"""Exercise diagnostics with synthetic containers/logs and pinned-SSH mocks only."""
import importlib.util
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('legal_diagnostics', ROOT / 'scripts/legal-diagnostics.py')
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)
API, WEB = 'a' * 64, 'b' * 64


class DiagnosticsTests(unittest.TestCase):
    def test_redacts_nested_health_logs_headers_credentials_and_multiline_keys(self):
        fixtures = {
            'password': 'PRIVATE_PASSWORD',
            'health': {'Log': [{'Output': 'readiness failed\nAuthorization: Bearer PRIVATE_BEARER\nredis://user:PRIVATE_URL@cache:6379/0\nclient_secret="PRIVATE_JSON"\nJWT_SECRET=PRIVATE_ENV\n-----BEGIN PRIVATE KEY-----\nPRIVATE_PEM\n-----END PRIVATE KEY-----'}]},
            'logs': "{\"access_token\":\"PRIVATE_TOKEN\"} password: 'PRIVATE_QUOTED'\nSet-Cookie: session=PRIVATE_COOKIE\nhttps://service.test/?api_key=PRIVATE_QUERY\neyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.PRIVATE_JWT",
        }
        result = json.dumps(diagnostics.redact(fixtures))
        for secret in ['PRIVATE_PASSWORD', 'PRIVATE_BEARER', 'PRIVATE_URL', 'PRIVATE_JSON', 'PRIVATE_ENV', 'PRIVATE_PEM', 'PRIVATE_TOKEN', 'PRIVATE_QUOTED', 'PRIVATE_COOKIE', 'PRIVATE_QUERY', 'PRIVATE_JWT']:
            self.assertNotIn(secret, result)
        self.assertIn('readiness failed', result)
        self.assertIn('cache:6379', result)

    def test_redacts_private_keys_truncated_at_either_end(self):
        for value in ['prefix\n-----BEGIN PRIVATE KEY-----\nPRIVATE_TRUNCATED_START',
                      'PRIVATE_TRUNCATED_END\n-----END RSA PRIVATE KEY-----\nreadiness failed']:
            with self.subTest(value=value):
                self.assertNotIn('PRIVATE_TRUNCATED', diagnostics.redact(value))
        self.assertIn('readiness failed', diagnostics.redact('PRIVATE_TRUNCATED_END\n-----END PRIVATE KEY-----\nreadiness failed'))

    def test_only_scoped_read_commands_and_bounded_redacted_output(self):
        calls = []
        def command(args):
            calls.append(args)
            if args[:2] == ['docker', 'ps']:
                self.assertIn('label=com.docker.compose.project=hemia-legal', args)
                service = next(arg.rsplit('=', 1)[1] for arg in args if arg.startswith('label=com.docker.compose.service='))
                return 0, (API if service == 'api' else WEB) + '\n', ''
            if args[:2] == ['docker', 'inspect']:
                self.assertNotIn('.Env', args[3])
                service = 'api' if args[-1] == API else 'web'
                return 0, json.dumps({'project': 'hemia-legal', 'service': service, 'image': 'registry.test/legal/' + service + ':test', 'status': 'running', 'health': {'Status': 'unhealthy', 'Log': [{'Output': 'password=PRIVATE_HEALTH\nconnection refused'}]}}), ''
            if args[:2] == ['docker', 'logs']:
                self.assertEqual(args[2:7], ['--since', '30m', '--tail', '80', '--timestamps'])
                return 0, 'x' * 20000 + '\nsecret=PRIVATE_LOG\nconnection refused', ''
            raise AssertionError(args)
        with patch.object(diagnostics, 'command', side_effect=command):
            result = diagnostics.diagnose()
        self.assertEqual(len(calls), 6)
        output = json.dumps(result)
        self.assertNotIn('PRIVATE_HEALTH', output)
        self.assertNotIn('PRIVATE_LOG', output)
        self.assertIn('connection refused', output)
        for service in ['api', 'web']:
            self.assertLessEqual(len(result['services'][service]['containers'][0]['logs']), 16000)

    def test_never_reads_logs_for_unverified_scope_and_reports_docker_errors(self):
        def command(args):
            if args[1] == 'ps': return 0, API + '\n', ''
            if args[1] == 'inspect': return 0, json.dumps({'project': 'another-app', 'service': 'api'}), ''
            raise AssertionError('No logs for another app')
        with patch.object(diagnostics, 'command', side_effect=command):
            self.assertIn('Cannot verify Legal container scope', json.dumps(diagnostics.diagnose()))
        with patch.object(diagnostics, 'command', return_value=(1, '', 'token=PRIVATE_ERROR')):
            self.assertNotIn('PRIVATE_ERROR', json.dumps(diagnostics.diagnose()))

    def test_remote_diagnose_runs_trusted_script_before_every_mutating_path(self):
        env = {'DEPLOY_HOST': 'apps.test', 'DEPLOY_USER': 'legal-deploy', 'DEPLOY_PATH': '/opt/hemia/legal', 'DEPLOY_KEY_FILE': '/tmp/key', 'DEPLOY_KNOWN_HOSTS_FILE': '/tmp/known', 'HEMIA_AUTHORIZATION_MODE': 'invalid', 'AMQP_HOST': 'invalid'}
        with patch.dict(os.environ, env), patch.object(sys, 'argv', ['legal-remote.py', 'diagnose', '', '/missing-release']), patch('subprocess.check_output', side_effect=AssertionError('No remote mktemp')), patch('subprocess.run') as run:
            with self.assertRaises(SystemExit) as stopped:
                runpy.run_path(str(ROOT / 'scripts/legal-remote.py'), run_name='__main__')
        self.assertEqual(stopped.exception.code, 0)
        run.assert_called_once()
        args, kwargs = run.call_args
        self.assertEqual(args[0][-1], 'python3 -')
        self.assertIn('legal-deploy@apps.test', args[0])
        self.assertIn('StrictHostKeyChecking=yes', args[0])
        self.assertEqual(kwargs['input'], (ROOT / 'scripts/legal-diagnostics.py').read_text())
        self.assertTrue(kwargs['check'])

    def test_workflow_diagnose_accepts_no_release_and_never_downloads_artifacts(self):
        workflow = (ROOT / '.github/workflows/legal-deploy.yml').read_text()
        self.assertIn('options: [deploy, rollback, migrate, diagnose]', workflow)
        self.assertIn("if: inputs.operation != 'diagnose'", workflow)
        block = workflow.split('      - name: Validate configuration\n', 1)[1].split('      - name: Validate and download requested release\n', 1)[0]
        code = '\n'.join(line[10:] for line in block.split("          python3 - <<'PY'\n", 1)[1].split('\n          PY', 1)[0].splitlines())
        with tempfile.TemporaryDirectory() as directory:
            env = {**os.environ, 'ENABLE_DEPLOY': '', 'REGISTRY_HOST': '', 'RELEASE_TAG': '', 'OPERATION': 'diagnose', 'DEPLOY_HOST': 'apps.test', 'DEPLOY_USER': 'legal-deploy', 'DEPLOY_PATH': '/opt/hemia/legal', 'TS_CLIENT_ID': 'fixture', 'TS_AUDIENCE': 'fixture', 'PRIVATE_KEY': 'synthetic-private-key', 'KNOWN_HOSTS': 'synthetic-pinned-host', 'DEPLOY_KEY_FILE': directory + '/key', 'DEPLOY_KNOWN_HOSTS_FILE': directory + '/known'}
            result = subprocess.run([sys.executable, '-c', code], env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, '')
            env['OPERATION'] = 'deploy'
            self.assertNotEqual(subprocess.run([sys.executable, '-c', code], env=env, capture_output=True).returncode, 0)


if __name__ == '__main__':
    unittest.main()
