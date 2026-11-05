import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sdk = join(root, 'packages/sdk');
const temporary = mkdtempSync(join(tmpdir(), 'legal-sdk-package-'));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8' });

try {
  const [packed] = JSON.parse(run('npm', [
    'pack', '--ignore-scripts', '--json', '--pack-destination', temporary,
  ], sdk));
  assert.equal(packed.name, '@hemia/legal');
  assert.equal(packed.filename, `hemia-legal-${packed.version}.tgz`);
  for (const file of packed.files) {
    assert(/^(package\.json|README\.md|LICENSE|dist\/[\w-]+\.(js|d\.ts))$/.test(file.path), `Unexpected packed file: ${file.path}`);
  }
  for (const path of ['dist/index.js', 'dist/index.d.ts']) {
    assert(packed.files.some(file => file.path === path), `Missing packed file: ${path}`);
  }
  const tarball = join(temporary, packed.filename);
  const consumer = join(temporary, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), '{"private":true}\n');
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', tarball], consumer);
  run(process.execPath, ['-e',
    "const {createLegalClient} = require('@hemia/legal'); require('node:assert/strict').equal(typeof createLegalClient, 'function');",
  ], consumer);
  run(process.execPath, ['--input-type=module', '-e',
    "import {createLegalClient} from '@hemia/legal'; import assert from 'node:assert/strict'; assert.equal(typeof createLegalClient, 'function');",
  ], consumer);

  if (process.env.LEGAL_SDK_RELEASE_DIR) {
    const output = resolve(process.env.LEGAL_SDK_RELEASE_DIR);
    mkdirSync(output, { recursive: true });
    copyFileSync(tarball, join(output, packed.filename));
    writeFileSync(join(output, 'release.json'), JSON.stringify({
      commit: run('git', ['rev-parse', 'HEAD'], root).trim(),
      name: packed.name,
      version: packed.version,
      filename: packed.filename,
      integrity: packed.integrity,
    }, null, 2) + '\n');
  }
  console.log(`Validated ${packed.name}@${packed.version} from an isolated Node consumer`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
