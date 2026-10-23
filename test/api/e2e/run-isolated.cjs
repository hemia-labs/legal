const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const api = path.resolve(__dirname, '../../../apps/api');
const apiRequire = createRequire(path.join(api, 'package.json'));
const root = path.resolve(api, '../..');
const temporary = mkdtempSync(path.join(tmpdir(), 'legal-e2e-'));
const containers = [];
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
function start(kind, image, port, args = []) {
  const name = `legal-e2e-${kind}-${process.pid}-${Date.now()}`;
  containers.push(name);
  run('docker', ['run', '-d', '--rm', '--name', name, '-p', `127.0.0.1::${port}`, ...args, image]);
  return { name, port: run('docker', ['port', name, String(port)]).split(':').at(-1) };
}
(async () => {
  let database;
  try {
    const pg = start('pg', 'postgres:18.4', 5432, ['-e', 'POSTGRES_PASSWORD=isolated-test-only', '-e', 'POSTGRES_DB=legal_e2e_test']);
    const redis = start('redis', 'redis:8-alpine', 6379);
    for (const [container, command] of [[pg, ['pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'legal_e2e_test']], [redis, ['redis-cli', 'ping']]]) {
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (spawnSync('docker', ['exec', container.name, ...command], { stdio: 'ignore' }).status === 0) { ready = true; break; }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      if (!ready) throw new Error(`${container.name} did not become ready`);
    }
    // Explicit credentials and paths: migrations can only reach the newly created container.
    process.env.TS_NODE_PROJECT = path.join(api, 'tsconfig.json');
    process.env.TS_NODE_TRANSPILE_ONLY = 'true';
    apiRequire('ts-node/register');
    const { DataSource } = apiRequire('typeorm');
    database = new DataSource({ type: 'postgres', host: '127.0.0.1', port: Number(pg.port), username: 'postgres', password: 'isolated-test-only', database: 'legal_e2e_test', entities: [path.join(api, 'src/**/*.entity.ts')], migrations: [path.join(api, 'src/database/migrations/*.ts')], synchronize: false, migrationsRun: false });
    await database.initialize();
    await database.runMigrations({ transaction: 'all' });
    await database.destroy();
    database = undefined;
    writeFileSync(path.join(temporary, 'jest.config.json'), '{}');
    const result = spawnSync(process.execPath, [apiRequire.resolve('jest/bin/jest'), '--config', path.join(root, 'test/api/jest-e2e.json'), '--runInBand', '--detectOpenHandles'], { cwd: temporary, stdio: 'inherit', env: { PATH: process.env.PATH, HOME: temporary, NODE_ENV: 'test', NODE_OPTIONS: '--experimental-vm-modules', DB_HOST: '127.0.0.1', DB_PORT: pg.port, DB_USERNAME: 'postgres', DB_PASSWORD: 'isolated-test-only', DB_DATABASE: 'legal_e2e_test', E2E_DB_DATABASE: 'legal_e2e_test', REDIS_HOST: '127.0.0.1', REDIS_PORT: redis.port, SECRETS_ENABLED: 'false', VAULT_BASE_URL:'https://127.0.0.1:1', VAULT_ROLE_ID:'synthetic', VAULT_SECRET_ID:'synthetic', SECRETS_OWNER:'hemia', SECRETS_SYSTEM:'legal', EVENT_BUS_ENABLED: 'false', S3_BUCKET: 'legal-e2e-only', SSO_CLIENT_SECRET: 'synthetic-e2e-secret', LEGAL_SERVICE_CLIENT_ID: 'legal-e2e', LEGAL_SERVICE_CLIENT_SECRET: 'synthetic-e2e-service-secret', SSO_ISSUER: 'http://127.0.0.1:1', ACCESS_API_URL: 'http://127.0.0.1:1' } });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    if (database?.isInitialized) await database.destroy();
    for (const container of containers.reverse()) spawnSync('docker', ['rm', '-f', '-v', container], { stdio: 'ignore' });
    rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
