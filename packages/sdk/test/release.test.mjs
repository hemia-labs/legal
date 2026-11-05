import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { isReviewedVersionBatch, registryDecision } from '../../../scripts/legal-sdk-release.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const sdkNote = '---\n"@hemia/legal": minor\n---\nInitial SDK.\n';
const appNote = '---\n"api": patch\n---\nApplication fix.\n';
const sdkNotePath = '.changeset/sdk.md';
const versionFiles = ['packages/sdk/package.json', 'packages/sdk/CHANGELOG.md', 'bun.lock', sdkNotePath];

test('classifies only a version merge that consumes SDK notes', () => {
  const notes = [{ path: sdkNotePath, source: sdkNote }];
  assert(isReviewedVersionBatch('0.0.0', '0.1.0', versionFiles, notes));
  assert.equal(isReviewedVersionBatch('0.0.0', '0.1.0', versionFiles, [{ path: sdkNotePath, source: appNote }]), false);
  assert.equal(isReviewedVersionBatch('0.0.0', '0.1.0', [...versionFiles, 'packages/sdk/src/client.ts'], notes), false);
  assert.equal(isReviewedVersionBatch(undefined, '0.1.0', versionFiles, notes), false);
});

test('distinguishes first publish and matching retries from conflicting artifacts', () => {
  const published = { versions: { '0.1.0': { dist: { integrity: 'same' } } }, 'dist-tags': { latest: '0.1.0' } };
  assert.equal(registryDecision(null, '0.1.0', 'same'), 'bootstrap');
  assert.equal(registryDecision(published, '0.1.0', 'same'), 'already-published');
  assert.equal(registryDecision(published, '0.1.1', 'other'), 'publish');
  assert.throws(() => registryDecision(published, '0.1.0', 'other'), /different tarball/);
  assert.throws(() => registryDecision(published, '0.0.1', 'other'), /backwards/);
});

test('Changesets versions the SDK and preserves the application notes and versions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'legal-sdk-version-'));
  try {
    for (const folder of ['apps/api', 'apps/web', 'packages/sdk', '.changeset', 'scripts', 'bin']) {
      mkdirSync(join(dir, folder), { recursive: true });
    }
    for (const path of ['package.json', 'bun.lock', 'apps/api/package.json', 'apps/web/package.json',
      'packages/sdk/package.json', '.changeset/config.json', 'scripts/changeset-scope.mjs', 'scripts/version-legal-sdk.mjs']) {
      cpSync(join(root, path), join(dir, path));
    }
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    const read = path => readFileSync(join(dir, path), 'utf8');
    const appBefore = ['apps/api/package.json', 'apps/web/package.json', '.changeset/config.json'].map(read);
    const before = JSON.parse(read('packages/sdk/package.json')).version;
    const [major, minor] = before.split('.').map(Number);
    const after = `${major}.${minor + 1}.0`;
    writeFileSync(join(dir, sdkNotePath), sdkNote);
    writeFileSync(join(dir, '.changeset/app.md'), appNote);
    writeFileSync(join(dir, 'bin/bun'), '#!/bin/sh\ntest "$*" = "install --frozen-lockfile"\n', { mode: 0o755 });
    execFileSync(process.execPath, [join(dir, 'scripts/version-legal-sdk.mjs')], {
      cwd: dir, env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` }, stdio: 'pipe',
    });
    assert.equal(JSON.parse(read('packages/sdk/package.json')).version, after);
    assert(read('bun.lock').split('"packages/sdk": {')[1].split('}')[0].includes(`"version": "${after}"`));
    assert(read('packages/sdk/CHANGELOG.md').includes(`## ${after}`));
    assert.equal(read('.changeset/app.md'), appNote);
    assert.deepEqual(['apps/api/package.json', 'apps/web/package.json', '.changeset/config.json'].map(read), appBefore);
    assert.throws(() => read(sdkNotePath), { code: 'ENOENT' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
