// Read-only probes: no AppModule, HTTP server, consumers, jobs, migrations or SDK bus.ping().
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = () => true;
process.stderr.write = () => true;
const result = { flags: {
  node_env_production: process.env.NODE_ENV === 'production',
  roles_mode: process.env.HEMIA_AUTHORIZATION_MODE === 'roles',
  redis_local_transport_true: process.env.REDIS_LOCAL_TRANSPORT === 'true'
}, bus_sdk_ping: 'not_executed_would_declare_queue' };
const privateValues = new Set(['VAULT_ROLE_ID', 'VAULT_SECRET_ID', 'DB_PASSWORD', 'REDIS_PASSWORD']
  .map((key) => process.env[key]).filter(Boolean));
function safe(value) {
  let text = String(value ?? '');
  for (const secret of privateValues) text = text.split(secret).join('[REDACTED]');
  return text.slice(0, 2000);
}
function failure(error) { return { status: 'error', name: safe(error?.name), code: safe(error?.code), message: safe(error?.message) }; }
function finish() { write(JSON.stringify(result)); process.exit(0); }
const watchdog = setTimeout(() => { result.timeout = true; finish(); }, 15000);
async function bounded(promise, ms) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('probe_timeout')), ms); })]); }
  finally { clearTimeout(timer); }
}
async function probe(name, run) {
  const start = Date.now();
  try { result[name] = { status: 'ok', ...await bounded(run(), 5000), elapsed_ms: Date.now() - start }; }
  catch (error) { result[name] = { ...result[name], ...failure(error), elapsed_ms: Date.now() - start }; }
}
async function main() {
  let redis, pg, broker;
  try {
    const { Module } = require('@nestjs/common');
    const { NestFactory } = require('@nestjs/core');
    const { ConfigModule, ConfigService } = require('@nestjs/config');
    const { SecretsService } = require('@hemia/secrets/nestjs');
    const { SecretsModule } = require('./dist/src/modules/secrets/secrets.module');
    const { RedisModule } = require('./dist/src/modules/auth/redis/redis.module');
    const { REDIS } = require('./dist/src/modules/auth/redis/redis-session-store');
    const load = ['secrets', 'redis', 'database'].map((name) => require('./dist/src/config/' + name + '.config').default);
    class DependencyProbeModule {}
    Module({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load }), SecretsModule, RedisModule] })(DependencyProbeModule);
    const context = await bounded(NestFactory.createApplicationContext(DependencyProbeModule, { logger: false, abortOnError: false }), 8000);
    const config = context.get(ConfigService);
    const secrets = context.get(SecretsService);
    redis = context.get(REDIS);
    if (redis.options?.password) privateValues.add(redis.options.password);
    result.bootstrap = { status: 'ok' };
    await Promise.all([
      probe('redis', async () => {
        const pong = await redis.ping();
        if (pong !== 'PONG') throw new Error('unexpected_redis_ping_response');
        return { pong: true };
      }),
      probe('postgres', async () => {
        const { Client } = require('pg');
        let options = { host: config.get('database.host'), port: config.get('database.port'), user: config.get('database.username'), password: config.get('database.password'), database: config.get('database.name') };
        if (config.get('secrets.enabled', false)) {
          const value = await secrets.getRequired('database/postgres');
          const { isDatabaseSecret } = require('./dist/src/database/types/database.types');
          if (!isDatabaseSecret(value)) throw new Error('invalid_database_secret_shape');
          options = { host: value.db_host, port: value.db_port, user: value.db_username, password: value.db_password, database: value.db_database };
        }
        if (options.password) privateValues.add(options.password);
        pg = new Client({ ...options, connectionTimeoutMillis: 3000, query_timeout: 3000,
          options: '-c default_transaction_read_only=on -c statement_timeout=3000' });
        await pg.connect();
        await pg.query('SELECT 1 AS ok');
        const schema = await pg.query("SELECT to_regclass('public.migrations') IS NOT NULL AS migrations_table_present");
        result.postgres = { select_one: true, migrations_table_present: schema.rows[0].migrations_table_present, migrations: {} };
        for (const [name, sql] of [['unqualified', 'SELECT name FROM migrations'], ['public', 'SELECT name FROM public.migrations']]) {
          try { result.postgres.migrations[name] = { status: 'ok', row_count: (await pg.query(sql)).rowCount }; }
          catch (error) { result.postgres.migrations[name] = failure(error); }
        }
        try {
          const path = await pg.query("SELECT current_schema() = 'public' AS current_schema_is_public, current_schemas(false) @> ARRAY['public']::name[] AS search_path_includes_public, to_regclass('migrations') = to_regclass('public.migrations') AS unqualified_resolves_public");
          for (const key of ['current_schema_is_public', 'search_path_includes_public', 'unqualified_resolves_public']) result.postgres[key] = path.rows[0][key] === true;
        } catch (error) { result.postgres.schema_check = failure(error); }
        return result.postgres;
      }),
      probe('rabbitmq', async () => {
        result.rabbitmq = { handshake: false, existing_exchange_passive_check: false };
        // Resolve the existing transport without loading the SDK's mutating setup/ping.
        const { createRequire } = require('node:module');
        const busRequire = createRequire(require.resolve('@hemia/event-bus'));
        const managerRequire = createRequire(busRequire.resolve('amqp-connection-manager'));
        const amqp = managerRequire('amqplib');
        const url = process.env.AMQP_URL;
        if (!url) throw new Error('AMQP_URL_missing');
        const parsed = new URL(url);
        if (parsed.password) privateValues.add(decodeURIComponent(parsed.password));
        if (parsed.username) privateValues.add(decodeURIComponent(parsed.username));
        broker = await amqp.connect(url, { timeout: 3000, clientProperties: { connection_name: 'hemia-legal-readonly-diagnostics' } });
        broker.on('error', () => {});
        result.rabbitmq.handshake = true;
        const channel = await broker.createChannel();
        channel.on('error', () => {});
        await channel.checkExchange('hemia.events');
        return { handshake: true, existing_exchange_passive_check: true };
      })
    ]);
  } catch (error) { result.bootstrap = failure(error); }
  finally {
    redis?.disconnect();
    await bounded(Promise.allSettled([pg?.end(), broker?.close()]), 1000).catch(() => {});
  }
  clearTimeout(watchdog);
  finish();
}
main().catch((error) => { result.unexpected = failure(error); finish(); });
