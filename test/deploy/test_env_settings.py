"""Verify non-secret authorization settings replace one key and preserve the rest of production.env."""
import ast
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
REMOTE = ROOT / 'scripts' / 'legal-remote.py'
CODE = next(node.value.value for node in ast.walk(ast.parse(REMOTE.read_text()))
            if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'configure_setting' for target in node.targets))
PLATFORM = '3f1c2b9e-8d7a-4c6b-9a5e-1f2d3c4b5a69'
APPLICATION = '53e97cb8-8f1a-4c1f-9d7d-7c22330ecc85'
OPERATOR = {'identityIssuer': 'https://identity.example.test', 'subjectId': 'admin-qa',
            'organizationId': PLATFORM, 'applicationIds': [APPLICATION]}


class EnvSettingTests(unittest.TestCase):
    def run_setting(self, content, key, value, label='platform-orgs', mode=0o600):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'shared/production.env'
            path.parent.mkdir()
            path.write_text(content)
            path.chmod(mode)
            result = subprocess.run([sys.executable, '-c', CODE, temp, key, value, label], capture_output=True, text=True)
            return result, path.read_text(), list(path.parent.glob('production.env.before-' + label + '-*')) != []

    def test_adds_or_replaces_only_the_requested_key(self):
        original = 'JWT_SECRET=dummy-unchanged\nLEGAL_PLATFORM_ORGANIZATION_IDS=old\nHEMIA_AUTHORIZATION_MODE=authenticated\n'
        result, output, backup = self.run_setting(original, 'LEGAL_PLATFORM_ORGANIZATION_IDS', PLATFORM)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, 'JWT_SECRET=dummy-unchanged\nHEMIA_AUTHORIZATION_MODE=authenticated\nLEGAL_PLATFORM_ORGANIZATION_IDS=' + PLATFORM + '\n')
        self.assertTrue(backup)
        self.assertNotIn('dummy-unchanged', result.stdout + result.stderr)

    def test_authorization_mode_keeps_its_backup_label(self):
        result, output, backup = self.run_setting('HEMIA_AUTHORIZATION_MODE=roles\n', 'HEMIA_AUTHORIZATION_MODE', 'authenticated', 'authmode')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, 'HEMIA_AUTHORIZATION_MODE=authenticated\n')
        self.assertTrue(backup)

    def test_already_configured_is_idempotent(self):
        original = 'LEGAL_PLATFORM_ORGANIZATION_IDS=' + PLATFORM + '\n'
        result, output, backup = self.run_setting(original, 'LEGAL_PLATFORM_ORGANIZATION_IDS', PLATFORM)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, original)
        self.assertFalse(backup)

    def test_invalid_input_or_permissions_leave_file_unchanged(self):
        original = 'JWT_SECRET=dummy\n'
        for key, value, mode in [('bad key', PLATFORM, 0o600), ('LEGAL_PLATFORM_ORGANIZATION_IDS', 'x\nJWT_SECRET=leak', 0o600), ('LEGAL_PLATFORM_ORGANIZATION_IDS', PLATFORM, 0o644)]:
            with self.subTest(key=key, mode=mode):
                result, output, backup = self.run_setting(original, key, value, mode=mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(output, original)
                self.assertFalse(backup)

    def test_binding_is_compact_backed_up_and_not_logged(self):
        original = 'JWT_SECRET=dummy-unchanged\nHEMIA_AUTHORIZATION_MODE=authenticated\n'
        result, output, backup = self.run_setting(original, 'LEGAL_PLATFORM_OPERATOR_BINDINGS', json.dumps([OPERATOR], indent=2), 'platform-operators')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, original + 'LEGAL_PLATFORM_OPERATOR_BINDINGS=' + json.dumps([OPERATOR], separators=(',', ':')) + '\n')
        self.assertTrue(backup)
        self.assertNotIn(OPERATOR['subjectId'], result.stdout + result.stderr)
        self.assertNotIn('dummy-unchanged', result.stdout + result.stderr)

    def test_binding_can_be_explicitly_revoked_and_is_idempotent(self):
        original = 'LEGAL_PLATFORM_OPERATOR_BINDINGS=' + json.dumps([OPERATOR]) + '\n'
        result, output, backup = self.run_setting(original, 'LEGAL_PLATFORM_OPERATOR_BINDINGS', '[]', 'platform-operators')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, 'LEGAL_PLATFORM_OPERATOR_BINDINGS=[]\n')
        self.assertTrue(backup)
        result, output, backup = self.run_setting(output, 'LEGAL_PLATFORM_OPERATOR_BINDINGS', '[]', 'platform-operators')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(backup)

    def test_broad_access_can_be_cleared_before_selective_configuration(self):
        original = 'LEGAL_PLATFORM_ORGANIZATION_IDS=' + PLATFORM + '\n'
        result, output, backup = self.run_setting(original, 'LEGAL_PLATFORM_ORGANIZATION_IDS', '')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, 'LEGAL_PLATFORM_ORGANIZATION_IDS=\n')
        self.assertTrue(backup)
        result, output, _ = self.run_setting(output, 'LEGAL_PLATFORM_OPERATOR_BINDINGS', json.dumps([OPERATOR]), 'platform-operators')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_invalid_bindings_leave_configuration_unchanged(self):
        original = 'JWT_SECRET=dummy-unchanged\n'
        invalid = [None, {}, [OPERATOR, OPERATOR], [{**OPERATOR, 'extra': True}],
                   [{**OPERATOR, 'identityIssuer': 'https://user:pass@example.test'}],
                   [{**OPERATOR, 'identityIssuer': 'http://identity.example.test'}],
                   [{**OPERATOR, 'identityIssuer': 'https://identity.example.test/?query=x'}],
                   [{**OPERATOR, 'identityIssuer': 'https://@identity.example.test'}],
                   [{**OPERATOR, 'identityIssuer': 'https:\\identity.example.test'}],
                   [{**OPERATOR, 'subjectId': 'admin\u0080'}],
                   [{**OPERATOR, 'subjectId': 'admin\nENV=value'}],
                   [{**OPERATOR, 'organizationId': 'bad'}],
                   [{**OPERATOR, 'applicationIds': []}],
                   [{**OPERATOR, 'applicationIds': [APPLICATION, APPLICATION.upper()]}],
                   [{**OPERATOR, 'applicationIds': ['bad']}]]
        for value in invalid:
            with self.subTest(value=value):
                result, output, backup = self.run_setting(original, 'LEGAL_PLATFORM_OPERATOR_BINDINGS', json.dumps(value), 'platform-operators')
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(output, original)
                self.assertFalse(backup)

    def test_selective_and_broad_access_cannot_overlap_in_either_direction(self):
        for original, key, value in [
            ('LEGAL_PLATFORM_ORGANIZATION_IDS=' + PLATFORM + '\n', 'LEGAL_PLATFORM_OPERATOR_BINDINGS', json.dumps([OPERATOR])),
            ('LEGAL_PLATFORM_OPERATOR_BINDINGS=' + json.dumps([OPERATOR]) + '\n', 'LEGAL_PLATFORM_ORGANIZATION_IDS', PLATFORM),
        ]:
            with self.subTest(key=key):
                result, output, backup = self.run_setting(original, key, value)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(output, original)
                self.assertFalse(backup)


if __name__ == '__main__':
    unittest.main()
