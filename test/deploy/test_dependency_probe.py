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
        self.assertTrue(result['rabbitmq']['handshake'])
        self.assertTrue(result['rabbitmq']['existing_exchange_passive_check'])
        self.assertEqual(result['postgres']['migrations']['unqualified']['row_count'], 7)
        self.assertEqual(result['postgres']['migrations']['public']['row_count'], 7)

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

    def test_exact_migration_reads_distinguish_search_path_and_permissions(self):
        path = self.run_probe('pg-search-path')['result']['postgres']
        self.assertEqual(path['migrations']['unqualified']['code'], '42P01')
        self.assertEqual(path['migrations']['public']['status'], 'ok')
        self.assertFalse(path['unqualified_resolves_public'])
        denied = self.run_probe('pg-permission')['result']['postgres']['migrations']
        self.assertEqual(denied['unqualified']['code'], '42501')
        self.assertEqual(denied['public']['code'], '42501')

    def test_broker_auth_and_passive_failures_preserve_progress_without_writes(self):
        auth = self.run_probe('amqp-auth-denied')['result']['rabbitmq']
        self.assertEqual(auth['status'], 'error')
        self.assertEqual(auth['code'], '403')
        self.assertFalse(auth['handshake'])
        passive = self.run_probe('amqp-passive-denied')['result']['rabbitmq']
        self.assertTrue(passive['handshake'])
        self.assertFalse(passive['existing_exchange_passive_check'])
        self.assertEqual(passive['code'], '403')
