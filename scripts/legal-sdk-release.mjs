import { changesetTargets } from './changeset-scope.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageName = '@hemia/legal';
const registry = 'https://registry.npmjs.org';
const repository = 'git+https://github.com/hemia-labs/legal.git';
const manifestPath = 'packages/sdk/package.json';
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function compareVersions(left, right) {
  const parse = (value) => {
    assert(/^\d+\.\d+\.\d+$/.test(value), `Expected a stable version: ${value}`);
    return value.split('.').map(Number);
  };
  const a = parse(left), b = parse(right);
  assert([...a, ...b].every(Number.isSafeInteger), 'Version number is too large');
  return a.map((value, index) => Math.sign(value - b[index])).find(Boolean) ?? 0;
}

export function isReviewedVersionBatch(beforeVersion, afterVersion, files, removedNotes) {
  if (!beforeVersion || beforeVersion === afterVersion) return false;
  assert(compareVersions(afterVersion, beforeVersion) > 0, 'Package version must increase');
  const required = [manifestPath, 'packages/sdk/CHANGELOG.md', 'bun.lock'];
  const consumed = new Set(removedNotes.filter(({ source }) => {
    const targets = changesetTargets(source);
    return targets.length === 1 && targets[0] === packageName;
  }).map(({ path }) => path));
  return required.every(file => files.includes(file)) &&
    files.some(file => consumed.has(file)) &&
    files.every(file => required.includes(file) || consumed.has(file));
}

export function registryDecision(metadata, version, integrity) {
  if (!metadata) return 'bootstrap';
  const existing = metadata.versions?.[version];
  if (existing) {
    assert.equal(existing.dist?.integrity, integrity, 'Published version has different tarball contents');
    return 'already-published';
  }
  const latest = metadata['dist-tags']?.latest;
  if (latest) assert(compareVersions(version, latest) > 0, `Refusing to move latest backwards from ${latest}`);
  return 'publish';
}

export function validateArtifact(release, manifest, packed, commit, bytes) {
  assert.equal(release.commit, commit, 'Artifact commit differs from checkout');
  assert.equal(release.name, packageName);
  assert.equal(release.version, manifest.version);
  assert.equal(release.filename, `hemia-legal-${manifest.version}.tgz`);
  assert.equal(manifest.repository?.url, repository);
  assert.equal(manifest.publishConfig?.access, 'public');
  assert.equal(manifest.publishConfig?.registry, registry);
  assert(!manifest.private, 'The SDK package must allow publishing');
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  assert.equal(release.integrity, integrity, 'Artifact integrity changed after validation');
  assert.deepEqual(packed, manifest, 'Packed manifest differs from checkout');
}

export function changelogNotes(changelog, version) {
  compareVersions(version, version);
  const sections = [...changelog.matchAll(/^## ([^\r\n]+)\r?$/gm)];
  const index = sections.findIndex((section) => section[1] === version);
  assert(index >= 0, `Missing changelog entry for ${version}`);
  const start = sections[index].index + sections[index][0].length;
  const notes = changelog.slice(start, sections[index + 1]?.index ?? changelog.length).trim();
  assert(notes, `Empty changelog entry for ${version}`);
  return notes;
}

export async function createGitHubRelease({ version, commit, notes, token }, request = fetch) {
  compareVersions(version, version);
  assert(/^[a-f0-9]{40}$/.test(commit), 'Expected the published commit');
  assert(token, 'GitHub release requires GH_TOKEN');
  assert(notes.trim(), 'GitHub release requires changelog notes');
  const tag = `${packageName}@${version}`;
  const encoded = encodeURIComponent(tag);
  const api = async (path, body) => {
    const response = await request(`https://api.github.com/repos/hemia-labs/legal/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404 && !body) return null;
    assert(response.ok, `GitHub ${body ? 'POST' : 'GET'} ${path} failed: HTTP ${response.status}`);
    return response.json();
  };
  let ref = await api(`git/ref/tags/${encoded}`);
  if (!ref) ref = await api('git/refs', { ref: `refs/tags/${tag}`, sha: commit });
  assert.equal(ref.object?.type, 'commit', 'Expected a lightweight release tag');
  assert.equal(ref.object?.sha, commit, 'Existing release tag points to another commit');
  const existing = await api(`releases/tags/${encoded}`);
  if (existing) {
    assert.equal(existing.tag_name, tag);
    assert.equal(existing.name, tag, 'Existing release title differs');
    assert.equal(existing.draft, false, 'Existing release is still a draft');
    assert.equal(existing.prerelease, false, 'Existing release is a prerelease');
    console.log(`GitHub Release ${tag} already exists; skipping`);
    return;
  }
  await api('releases', {
    tag_name: tag, target_commitish: commit, name: tag, body: notes,
    draft: false, prerelease: false,
  });
  console.log(`Created GitHub Release ${tag}`);
}

function classify(base) {
  assert(/^[a-f0-9]{40}$/.test(base), 'Expected the previous main commit');
  let release = false;
  if (!/^0+$/.test(base)) {
    let before;
    try { before = JSON.parse(git('show', `${base}:${manifestPath}`)); }
    catch { /* A newly introduced package cannot be a version-only merge. */ }
    const after = readJson(join(root, manifestPath));
    const files = execFileSync('git', ['diff', '--name-only', '-z', base, 'HEAD'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
    const deleted = execFileSync('git', ['diff', '--diff-filter=D', '--name-only', '-z', base, 'HEAD'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
    const removedNotes = deleted.filter(path => /^\.changeset\/[a-z0-9-]+\.md$/.test(path))
      .map(path => ({ path, source: git('show', `${base}:${path}`) }));
    release = isReviewedVersionBatch(before?.version, after.version, files, removedNotes);
  }
  console.log(release ? 'Reviewed Legal SDK version batch' : 'No reviewed version batch in this push');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `release=${release}\n`);
}

async function readRegistry() {
  const response = await fetch(`${registry}/${encodeURIComponent(packageName)}`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) return null;
  assert(response.ok, `npm registry lookup failed: HTTP ${response.status}`);
  return response.json();
}

export async function waitForRegistryVisibility(version, integrity, {
  read = readRegistry, sleep = setTimeout, now = () => performance.now(),
} = {}) {
  const started = now();
  const timeout = 10 * 60_000;
  while (true) {
    const metadata = await read();
    const published = metadata?.versions?.[version];
    if (published) {
      assert.equal(published.dist?.integrity, integrity, 'Published version has different tarball contents');
      return;
    }
    const elapsed = now() - started;
    if (elapsed >= timeout) {
      throw new Error(`npm accepted ${packageName}@${version}, but registry visibility is still pending after 10 minutes. Wait for npm processing, then rerun the failed publish job to verify the same artifact and finish the GitHub Release.`);
    }
    console.log(`npm is processing ${packageName}@${version}; waiting for registry visibility (${Math.floor(elapsed / 1000)}s elapsed)`);
    await sleep(Math.min(20_000, timeout - elapsed));
  }
}

function loadArtifact(directory) {
  const release = readJson(join(directory, 'release.json'));
  const manifest = readJson(join(root, manifestPath));
  assert.equal(release.filename, basename(release.filename), 'Invalid artifact filename');
  const tarball = join(directory, release.filename);
  const bytes = readFileSync(tarball);
  const packed = JSON.parse(execFileSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8' }));
  validateArtifact(release, manifest, packed, git('rev-parse', 'HEAD'), bytes);
  return { release, manifest, tarball };
}

async function publish(directory) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Publishing requires GitHub Actions');
  assert(['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME), 'Publishing requires a reviewed version merge');
  assert.equal(process.env.GITHUB_REPOSITORY, 'hemia-labs/legal');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  assert.equal(process.env.ENABLE_LEGAL_SDK_PUBLISH, 'true', 'Publication gate is disabled');
  const { release, tarball } = loadArtifact(directory);
  const notes = changelogNotes(readFileSync(join(root, 'packages/sdk/CHANGELOG.md'), 'utf8'), release.version);
  assert(process.env.GH_TOKEN, 'GitHub release requires GH_TOKEN');
  const finish = () => createGitHubRelease({ version: release.version, commit: release.commit, notes, token: process.env.GH_TOKEN });
  const decision = registryDecision(await readRegistry(), release.version, release.integrity);
  if (decision === 'already-published') {
    console.log(`${packageName}@${release.version} already published with the same tarball; skipping npm publication`);
    return finish();
  }
  const env = { ...process.env };
  delete env.NODE_AUTH_TOKEN;
  delete env.GH_TOKEN;
  delete env.LEGAL_SDK_BOOTSTRAP_TOKEN;
  if (decision === 'bootstrap') {
    assert(process.env.LEGAL_SDK_BOOTSTRAP_TOKEN, 'First release requires the npm bootstrap token in the protected environment');
    env.NODE_AUTH_TOKEN = process.env.LEGAL_SDK_BOOTSTRAP_TOKEN;
  }
  execFileSync('npm', ['publish', tarball, '--ignore-scripts', '--access', 'public', '--registry', registry], {
    cwd: root, stdio: 'inherit', env,
  });
  await waitForRegistryVisibility(release.version, release.integrity);
  console.log(`Published and verified ${packageName}@${release.version}`);
  return finish();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, argument] = process.argv.slice(2);
  if (command === 'classify') classify(argument);
  else if (command === 'notes') {
    const manifest = readJson(join(root, manifestPath));
    console.log(changelogNotes(readFileSync(join(root, 'packages/sdk/CHANGELOG.md'), 'utf8'), manifest.version));
  } else if (command === 'publish') await publish(resolve(argument));
  else throw new Error('Usage: node scripts/legal-sdk-release.mjs <classify BASE_SHA|notes|publish DIR>');
}
