'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const req = createRequire(path.join(root, 'apps/api/package.json'));
const env = {};
for (const file of ['.env.local', '.env']) {
  const target = path.join(root, 'apps/api', file);
  if (fs.existsSync(target))
    Object.assign(env, req('dotenv').parse(fs.readFileSync(target)));
}
Object.assign(env, process.env);
const Redis = req('ioredis');
const { createSecretsClient } = req('@hemia/secrets');
const host = env.REDIS_HOST || '127.0.0.1';
const port = Number(env.REDIS_PORT);
function listening() {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });
}
async function ping(options) {
  const client = new Redis({
    host,
    port,
    ...options,
    lazyConnect: true,
    enableReadyCheck: false,
    retryStrategy: () => null,
    connectTimeout: 2000,
    commandTimeout: 2000,
    maxRetriesPerRequest: 0,
  });
  client.on('error', () => {});
  try {
    await client.connect();
    return await client.ping();
  } finally {
    client.disconnect();
  }
}
(async () => {
  if (
    !['development', 'test'].includes(env.NODE_ENV || 'development') ||
    env.REDIS_LOCAL_TRANSPORT !== 'true' ||
    !['127.0.0.1', '::1', 'localhost'].includes(host) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    env.SECRETS_ENABLED !== 'true'
  )
    throw new Error('LOCAL_REDIS_CONFIGURATION_REQUIRED');
  const secrets = createSecretsClient({
    scope: {
      environment: env.SECRETS_ENVIRONMENT || 'dev',
      category: env.SECRETS_CATEGORY || 'internal',
      owner: env.SECRETS_OWNER,
      system: env.SECRETS_SYSTEM,
    },
    provider: {
      type: 'hashicorp-vault',
      options: {
        baseUrl: env.VAULT_BASE_URL,
        roleId: env.VAULT_ROLE_ID,
        secretId: env.VAULT_SECRET_ID,
        authPath: env.VAULT_AUTH_PATH || 'approle',
        mountPrefix: env.VAULT_MOUNT_PREFIX || 'kv-',
        timeoutMs: Number(env.VAULT_TIMEOUT_MS) || 5000,
      },
    },
    cache: { enabled: false },
  });
  const secret = await secrets.getRequired('cache/redis');
  if (
    typeof secret.redis_password !== 'string' ||
    !secret.redis_password ||
    !Number.isInteger(secret.redis_db) ||
    secret.redis_db < 0
  )
    throw new Error('VAULT_REDIS_CREDENTIALS_REQUIRED');
  const options = { password: secret.redis_password, db: secret.redis_db };
  if (!(await listening())) {
    const directory = path.join(root, '.local/redis');
    process.umask(0o077);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const config =
      [
        `bind ${host}`,
        `port ${port}`,
        'protected-mode yes',
        `requirepass ${JSON.stringify(secret.redis_password)}`,
        'daemonize yes',
        `dir ${JSON.stringify(directory)}`,
        `pidfile ${JSON.stringify(path.join(directory, 'redis.pid'))}`,
        `logfile ${JSON.stringify(path.join(directory, 'redis.log'))}`,
        'appendonly yes',
      ].join('\n') + '\n';
    // Redis reads its password through stdin, never arguments, logs or a config file.
    const started = spawnSync('redis-server', ['-'], {
      input: config,
      encoding: 'utf8',
      timeout: 5000,
    });
    if (started.error || started.status !== 0)
      throw new Error('LOCAL_REDIS_START_FAILED');
    for (let count = 0; count < 20 && !(await listening()); count++)
      await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if ((await ping(options)) !== 'PONG')
    throw new Error('AUTHENTICATED_REDIS_UNAVAILABLE');
  let unauthenticated = false;
  try {
    unauthenticated = (await ping({})) === 'PONG';
  } catch (error) {
    if (!/NOAUTH/.test(String(error.message)))
      throw new Error('LOCAL_REDIS_AUTH_CHECK_FAILED');
  }
  if (unauthenticated) throw new Error('LOCAL_REDIS_MUST_REQUIRE_AUTH');
  console.log(
    'Legal local Redis ready: authenticated PONG; unauthenticated access denied.',
  );
})().catch((error) => {
  console.error(
    'Legal local Redis failure: ' +
      (new Set([
        'LOCAL_REDIS_CONFIGURATION_REQUIRED',
        'VAULT_REDIS_CREDENTIALS_REQUIRED',
        'LOCAL_REDIS_START_FAILED',
        'AUTHENTICATED_REDIS_UNAVAILABLE',
        'LOCAL_REDIS_AUTH_CHECK_FAILED',
        'LOCAL_REDIS_MUST_REQUIRE_AUTH',
      ]).has(error.message)
        ? error.message
        : 'DEPENDENCY_UNAVAILABLE'),
  );
  console.error(
    'Legal local Redis unavailable. Check development configuration, Vault access and redis-server installation; no credentials were printed.',
  );
  process.exitCode = 1;
});
