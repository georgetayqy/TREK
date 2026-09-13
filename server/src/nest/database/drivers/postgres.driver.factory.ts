import type { PoolConfig } from 'pg';
import type { AppEnv } from '../../../app-config';
import type { DbDriver } from './db-driver.interface';
import { createPostgresDriver, resolvePgSsl } from './postgres.driver';

/**
 * Builds node-postgres's Pool config from TREK's own derived env (never from
 * process.env directly — see server/CLAUDE.md's app-config rule), so the
 * fields the boot-time validator checked are exactly the fields used here. A
 * connection string, when set, wins outright: DATABASE_URL is intended as a
 * single override, not a value to be defaulted-into using the discrete PG*
 * fields piecemeal.
 */
export function buildPostgresPoolConfig(db: AppEnv['db']): PoolConfig {
  const { postgres } = db;
  if (postgres.connectionString) {
    return { connectionString: postgres.connectionString, ssl: resolvePgSsl(postgres.sslMode) };
  }
  return {
    host: postgres.host,
    port: postgres.port,
    database: postgres.database,
    user: postgres.user,
    password: postgres.password,
    ssl: resolvePgSsl(postgres.sslMode),
  };
}

export function createPostgresDriverFromEnv(db: AppEnv['db']): DbDriver {
  return createPostgresDriver(buildPostgresPoolConfig(db));
}
