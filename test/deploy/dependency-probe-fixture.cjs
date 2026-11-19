const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(process.argv[2], 'utf8');
const scenario = process.argv[3];
const calls = [];
const REDIS = Symbol('redis');
class ConfigService {}
class SecretsService {}
class SecretsModule {}
class RedisModule {}
const redis = { options: { password: 'PRIVATE_REDIS' }, ping: async () => {
  calls.push('redis.ping');
  if (scenario === 'redis-error') throw new Error('password=PRIVATE_REDIS Vault PRIVATE_VAULT');
  if (scenario === 'redis-timeout') return new Promise(() => {});
  return 'PONG';
}, disconnect: () => calls.push('redis.disconnect') };
const config = { get: (key) => key === 'secrets.enabled' ? true : undefined };
const secrets = { getRequired: async (path) => {
  assert.equal(path, 'database/postgres'); calls.push('vault.database');
  return { db_host: 'fixture', db_port: 5432, db_username: 'fixture', db_password: 'PRIVATE_POSTGRES', db_database: 'fixture', db_logging: false };
} };
const context = { get: (key) => key === REDIS ? redis : key === ConfigService ? config : secrets };
const dependencies = {
  '@nestjs/common': { Module: (metadata) => (klass) => { assert.equal(metadata.imports.length, 3); assert.equal(metadata.imports[1], SecretsModule); assert.equal(metadata.imports[2], RedisModule); } },
  '@nestjs/config': { ConfigService, ConfigModule: { forRoot: (options) => { assert.equal(options.ignoreEnvFile, true); assert.equal(options.load.length, 3); return 'config'; } } },
  '@nestjs/core': { NestFactory: { createApplicationContext: async (_module, options) => { assert.equal(options.logger, false); assert.equal(options.abortOnError, false); if (scenario === 'bootstrap-error') throw new Error('token=PRIVATE_VAULT'); return context; } } },
  '@hemia/secrets/nestjs': { SecretsService },
  './dist/src/modules/secrets/secrets.module': { SecretsModule },
  './dist/src/modules/auth/redis/redis.module': { RedisModule },
  './dist/src/modules/auth/redis/redis-session-store': { REDIS },
  './dist/src/database/types/database.types': { isDatabaseSecret: () => true },
  'pg': { Client: class {
    constructor(options) { assert.match(options.options, /default_transaction_read_only=on/); assert.equal(options.password, 'PRIVATE_POSTGRES'); }
    async connect() { calls.push('postgres.connect'); }
    async query(sql) { assert.ok(['SELECT 1 AS ok', "SELECT to_regclass('public.migrations') IS NOT NULL AS migrations_table_present"].includes(sql)); calls.push(sql); return { rows: [{ migrations_table_present: true }] }; }
    async end() { calls.push('postgres.end'); }
  } }
};
for (const name of ['secrets', 'redis', 'database']) dependencies['./dist/src/config/' + name + '.config'] = { default: () => ({}) };
let output = '';
new Promise((resolve) => {
  const processFixture = { env: { NODE_ENV: 'production', HEMIA_AUTHORIZATION_MODE: 'roles', REDIS_LOCAL_TRANSPORT: 'false', VAULT_SECRET_ID: 'PRIVATE_VAULT' }, stdout: { write: (value) => { output += value; return true; } }, stderr: { write: () => assert.fail('Raw stderr') }, exit: () => resolve() };
  vm.runInNewContext(source, {
    require: (name) => { assert.ok(Object.hasOwn(dependencies, name), 'Forbidden dependency import: ' + name); return dependencies[name]; },
    process: processFixture,
    setTimeout: (callback, delay) => setTimeout(callback, delay === 15000 ? 100 : delay === 8000 ? 50 : delay === 5000 ? 20 : 10),
    clearTimeout
  });
}).then(() => {
  assert.ok(!output.includes('PRIVATE_'), 'Credential leaked');
  const result = JSON.parse(output);
  if (scenario !== 'bootstrap-error') assert.ok(calls.includes('redis.disconnect'));
  console.log(JSON.stringify({ result, calls }));
}).catch((error) => { console.error(error); process.exitCode = 1; });
