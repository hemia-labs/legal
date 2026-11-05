import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withChangesetScope } from './changeset-scope.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = join(root, 'packages/sdk/package.json');
const lockPath = join(root, 'bun.lock');
const version = () => JSON.parse(readFileSync(manifest, 'utf8')).version;
const before = version();
const lock = readFileSync(lockPath, 'utf8');
const entry = /("packages\/sdk":\s*\{\s*"name":\s*"@hemia\/legal",\s*"version":\s*")([^"]+)(")/g;
const matches = [...lock.matchAll(entry)];
assert.equal(matches.length, 1, 'Expected one SDK workspace in bun.lock');
assert.equal(matches[0][2], before, 'SDK manifest and lockfile versions differ');
withChangesetScope('sdk', () => {
  execFileSync(process.execPath, [join(root, 'node_modules/@changesets/cli/bin.js'), 'version'], { cwd: root, stdio: 'inherit' });
});
const after = version();
assert.notEqual(after, before, 'No pending Legal SDK changesets');
writeFileSync(lockPath, lock.replace(entry, (_match, prefix, _old, suffix) => `${prefix}${after}${suffix}`));
execFileSync('bun', ['install', '--frozen-lockfile'], { cwd: root, stdio: 'inherit' });
