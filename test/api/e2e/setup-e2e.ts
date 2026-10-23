import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const databaseName = process.env.E2E_DB_DATABASE ?? process.env.DB_DATABASE;
const isIsolatedDatabase = databaseName
  ? /(^|[-_])(test|e2e)([-_]|$)/i.test(databaseName)
  : false;

if (!isIsolatedDatabase) {
  throw new Error(
    'E2E tests require an isolated database. Set E2E_DB_DATABASE to a database name containing "test" or "e2e"; refusing to run against the application database.',
  );
}

process.env.NODE_ENV = 'test';
process.env.DB_DATABASE = databaseName;
