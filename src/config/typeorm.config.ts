import 'dotenv/config'; // necessário para o CLI de migrations (typeorm migration:run) ler o .env
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';

// Porta padrão do MySQL local (Docker mapeia 127.0.0.1:3302 -> 3306 do container).
// Em produção (Hostinger) defina DB_PORT=3306 no .env.
const DEFAULT_DB_PORT = 3302;

// Aceita DB_USERNAME (padrão do projeto) ou DB_USER (usado em docs/docker antigos)
const dbUser = (get: (k: string) => string | undefined) => get('DB_USERNAME') || get('DB_USER');

export const typeOrmConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: config.get<string>('DB_HOST', '127.0.0.1'),
  port: parseInt(config.get<string>('DB_PORT') ?? String(DEFAULT_DB_PORT), 10),
  username: dbUser((k) => config.get<string>(k)),
  password: config.get<string>('DB_PASSWORD'),
  database: config.get<string>('DB_NAME'),
  ssl: config.get<string>('DB_SSL') === 'true' ? { rejectUnauthorized: true } : false,
  entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, '..', 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: config.get<string>('NODE_ENV') === 'development',
  charset: 'utf8mb4',
  timezone: 'Z',
  extra: {
    connectionLimit: 10,
    waitForConnections: true,
  },
});

// DataSource para CLI de migrações
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || String(DEFAULT_DB_PORT), 10),
  username: dbUser((k) => process.env[k]),
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, '..', 'migrations', '*.{ts,js}')],
  synchronize: false,
  charset: 'utf8mb4',
  timezone: 'Z',
} as DataSourceOptions);
