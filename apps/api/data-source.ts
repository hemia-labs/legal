import { envFilePath } from './src/config/env-file';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

for (const file of envFilePath) dotenv.config({ path: file });

const isProduction = process.env.NODE_ENV === 'production';
const ext = isProduction ? 'js' : 'ts';
const baseDir = isProduction ? 'dist/src' : 'src';

export const AppDataSource = new DataSource({
  type: 'postgres',
  synchronize: false,
  migrationsRun: false,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  extra: { options: '-c timezone=America/Mexico_City' },
  entities: [path.join(process.cwd(), `${baseDir}/**/*.entity.${ext}`)],
  migrations: [path.join(process.cwd(), `${baseDir}/database/migrations/*.${ext}`)],
});
