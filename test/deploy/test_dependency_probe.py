"""Run the fixed Node probe against synthetic read-only providers; never a real app/DB."""
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]


class DependencyProbeTests(unittest.TestCase):
    def run_probe(self, scenario):
        process = subprocess.run(['node', str(ROOT / 'test/deploy/dependency-probe-fixture.cjs'),
                                  str(ROOT / 'scripts/legal-dependency-probe.cjs'), scenario],
                                 capture_output=True, text=True, timeout=5, check=True)
        return json.loads(process.stdout)

    def test_vault_redis_ping_and_postgres_reads_without_application_startup(self):
        output = self.run_probe('success')
        result = output['result']
        self.assertEqual(result['flags'], {'node_env_production': True, 'roles_mode': True, 'redis_local_transport_true': False})
        self.assertEqual(result['bootstrap']['status'], 'ok')
        self.assertEqual(result['redis']['status'], 'ok')
        self.assertEqual(result['postgres']['status'], 'ok')
        self.assertIn('vault.database', output['calls'])
        self.assertIn('SELECT 1 AS ok', output['calls'])
        self.assertEqual(result['bus_sdk_ping'], 'not_executed_would_declare_queue')

    def test_errors_are_redacted_and_a_failed_redis_ping_does_not_hide_postgres(self):
        output = self.run_probe('redis-error')
        self.assertEqual(output['result']['redis']['status'], 'error')
        self.assertEqual(output['result']['postgres']['status'], 'ok')
        self.assertNotIn('PRIVATE_', json.dumps(output))

    def test_bounded_ping_and_bootstrap_failures_are_reported_without_raw_output(self):
        output = self.run_probe('redis-timeout')
        self.assertEqual(output['result']['redis']['message'], 'probe_timeout')
        self.assertEqual(output['result']['postgres']['status'], 'ok')
        bootstrap = self.run_probe('bootstrap-error')['result']
        self.assertEqual(bootstrap['bootstrap']['status'], 'error')
        self.assertNotIn('redis', bootstrap)
