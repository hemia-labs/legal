import { createSecretsClient } from '@hemia/secrets';
import secretsConfig from '../src/config/secrets.config';
import {
  isDatabaseSecret,
  DatabaseSecret,
} from '../src/database/types/database.types';
/** Explicit one-time cutover; never loaded by application startup. */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { LegalServiceClients1791345600000 } from '../src/database/migrations/1791345600000-LegalServiceClients';
import {
  parseServicePolicy,
  ServiceGrantDto,
} from '../src/modules/legal/service-clients/service-client.dto';
async function main() {
  if (!process.argv.includes('--apply'))
    throw new Error('Run explicitly with --apply after backing up Legal');
  const vault = secretsConfig();
  const secret = vault.enabled
    ? await createSecretsClient({
        scope: {
          environment: vault.environment,
          category: vault.category,
          owner: vault.owner,
          system: vault.system,
        },
        provider: {
          type: 'hashicorp-vault',
          options: {
            baseUrl: vault.baseUrl,
            roleId: vault.roleId,
            secretId: vault.secretId,
            authPath: vault.authPath,
            mountPrefix: vault.mountPrefix,
            timeoutMs: vault.timeoutMs,
          },
        },
      }).getRequired<DatabaseSecret>('database/postgres')
    : undefined;
  if (secret && !isDatabaseSecret(secret))
    throw new Error('Invalid database secret');
  if (AppDataSource.options.type !== 'postgres')
    throw new Error('Postgres required');
  const db = new DataSource({
    ...AppDataSource.options,
    ...(secret
      ? {
          host: secret.db_host,
          port: secret.db_port,
          username: secret.db_username,
          password: secret.db_password,
          database: secret.db_database,
        }
      : {}),
    migrations: [LegalServiceClients1791345600000],
    logging: false,
  });
  await db.initialize();
  try {
    const policies = new Map<string, ServiceGrantDto[]>();
    for (const [variable, operation] of [
      ['LEGAL_EVALUATOR_CLIENTS', 'legal.pending.evaluate'],
      ['LEGAL_ACCEPTANCE_VALIDATOR_CLIENTS', 'legal.acceptances.validate'],
    ]) {
      const values: unknown = JSON.parse(process.env[variable] ?? '{}');
      if (!values || typeof values !== 'object' || Array.isArray(values))
        throw new Error(`Invalid ${variable}`);
      for (const [clientId, raw] of Object.entries(values)) {
        if (!/^[^\s]{1,120}$/.test(clientId) || !raw || typeof raw !== 'object')
          throw new Error('Invalid legacy client');
        const value = raw as {
          application_ids: string[];
          organization_ids: string[];
        };
        if (
          !Array.isArray(value.application_ids) ||
          !value.application_ids.length
        )
          throw new Error('Invalid legacy applications');
        const grants = policies.get(clientId) ?? [];
        for (const applicationId of value.application_ids) {
          const rows: { issuer_id: string }[] = await db.query(
            'SELECT issuer_id FROM applications WHERE id=$1 AND deleted_at IS NULL',
            [applicationId],
          );
          if (rows.length !== 1) throw new Error('Unknown legacy application');
          grants.push({
            operation,
            issuerId: rows[0].issuer_id,
            applicationId,
            organizationIds: value.organization_ids,
          });
        }
        parseServicePolicy({ grants });
        policies.set(clientId, grants);
      }
    }
    const issuer = process.env.SSO_ISSUER;
    if (!issuer || issuer.length > 2048)
      throw new Error('SSO_ISSUER is required');
    await db.runMigrations({ transaction: 'all' });
    await db.transaction(async (m) => {
      for (const [clientId, grants] of policies)
        await m.query(
          `INSERT INTO legal_service_clients(oauth_issuer,client_id,enabled,policy) VALUES($1,$2,true,$3::jsonb) ON CONFLICT(oauth_issuer,client_id) DO NOTHING`,
          [issuer, clientId, JSON.stringify({ grants })],
        );
    });
    const result: { count: string }[] = await db.query(
      'SELECT count(*)::text AS count FROM legal_service_clients',
    );
    console.log(
      JSON.stringify({
        migratedPolicies: policies.size,
        registeredClients: result[0].count,
        externalTablesPreserved: true,
      }),
    );
  } finally {
    await db.destroy();
  }
}
void main().catch((error: unknown) => {
  console.error(
    'Service client migration failed:',
    error instanceof Error ? error.name : 'UnknownError',
  );
  process.exitCode = 1;
});
