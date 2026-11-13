"""Verify non-secret authorization settings replace one key and preserve the rest of production.env."""
import ast
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
REMOTE = ROOT / 'scripts' / 'legal-remote.py'
CODE = next(node.value.value for node in ast.walk(ast.parse(REMOTE.read_text()))
            if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'configure_setting' for target in node.targets))


class EnvSettingTests(unittest.TestCase):
    def run_setting(self, content, key, value, label='authmode', mode=0o600):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'shared/production.env'
            path.parent.mkdir()
            path.write_text(content)
            path.chmod(mode)
            result = subprocess.run([sys.executable, '-c', CODE, temp, key, value, label], capture_output=True, text=True)
            return result, path.read_text(), list(path.parent.glob('production.env.before-' + label + '-*')) != []

    def test_adds_or_replaces_only_the_requested_key(self):
        original = 'JWT_SECRET=dummy-unchanged\nHEMIA_AUTHORIZATION_MODE=roles\nOTHER_SETTING=unchanged\n'
        result, output, backup = self.run_setting(original, 'HEMIA_AUTHORIZATION_MODE', 'authenticated')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, 'JWT_SECRET=dummy-unchanged\nOTHER_SETTING=unchanged\nHEMIA_AUTHORIZATION_MODE=authenticated\n')
        self.assertTrue(backup)
        self.assertNotIn('dummy-unchanged', result.stdout + result.stderr)

    def test_authorization_mode_keeps_its_backup_label(self):
        result, output, backup = self.run_setting('HEMIA_AUTHORIZATION_MODE=roles\n', 'HEMIA_AUTHORIZATION_MODE', 'authenticated', 'authmode')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, 'HEMIA_AUTHORIZATION_MODE=authenticated\n')
        self.assertTrue(backup)

    def test_already_configured_is_idempotent(self):
        original = 'HEMIA_AUTHORIZATION_MODE=authenticated\n'
        result, output, backup = self.run_setting(original, 'HEMIA_AUTHORIZATION_MODE', 'authenticated')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, original)
        self.assertFalse(backup)

    def test_invalid_input_or_permissions_leave_file_unchanged(self):
        original = 'JWT_SECRET=dummy\n'
        for key, value, mode in [('bad key', 'authenticated', 0o600), ('HEMIA_AUTHORIZATION_MODE', 'x\nJWT_SECRET=leak', 0o600), ('HEMIA_AUTHORIZATION_MODE', 'authenticated', 0o644)]:
            with self.subTest(key=key, mode=mode):
                result, output, backup = self.run_setting(original, key, value, mode=mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(output, original)
                self.assertFalse(backup)


if __name__ == '__main__':
    unittest.main()
