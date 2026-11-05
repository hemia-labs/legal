import assert from 'node:assert/strict';
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../.changeset/', import.meta.url));
const configPath = join(directory, 'config.json');

export function changesetTargets(source) {
  const header = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
  return [...header.matchAll(/^\s*["']?([^"'\s:]+)["']?\s*:\s*(patch|minor|major)\s*$/gm)].map(match => match[1]);
}

export function withChangesetScope(scope, version) {
  assert(['app', 'sdk'].includes(scope), 'Unknown Legal release scope');
  const targets = scope === 'app' ? ['api', 'web'] : ['@hemia/legal'];
  const original = readFileSync(configPath);
  const config = JSON.parse(original);
  const hidden = [];
  for (const name of readdirSync(directory).filter(name => name.endsWith('.md') && name !== 'README.md')) {
    const path = join(directory, name);
    const contents = readFileSync(path);
    const packages = changesetTargets(contents.toString());
    assert(packages.length || /^---\r?\n\s*---(?:\r?\n|$)/.test(contents.toString()), `Invalid changeset: ${name}`);
    const selected = packages.filter(name => targets.includes(name));
    assert(!selected.length || selected.length === packages.length, `Split app and SDK changesets: ${name}`);
    if (!selected.length) hidden.push({ path, contents });
  }
  try {
    for (const note of hidden) unlinkSync(note.path);
    if (scope === 'sdk') {
      config.fixed = [];
      config.access = 'public';
      config.privatePackages = { version: false, tag: false };
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    }
    return version();
  } finally {
    writeFileSync(configPath, original);
    for (const note of hidden) writeFileSync(note.path, note.contents);
  }
}
