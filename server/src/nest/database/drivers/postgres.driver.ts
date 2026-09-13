import { Pool, type PoolClient, type PoolConfig } from 'pg';
import type { DbDriver, RunResult } from './db-driver.interface';
import { toPositionalPlaceholders } from './placeholder-shim';

/** Whichever of Pool or PoolClient the driver instance is bound to — both share the same `.query()` shape. */
type PgExecutor = Pick<Pool | PoolClient, 'query'>;

class PostgresDriver implements DbDriver {
  readonly dialect = 'postgres' as const;

  constructor(
    private readonly executor: PgExecutor,
    /** Only set on the top-level (pool-backed) driver — a transaction's inner driver has none, since it must not open a second connection. */
    private readonly pool?: Pool,
  ) {}

  async get<T = unknown>(sql: string, params: readonly unknown[] = []): Promise<T | undefined> {
    const { rows } = await this.executor.query(toPositionalPlaceholders(sql), params as unknown[]);
    return rows[0] as T | undefined;
  }

  async all<T = unknown>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    const { rows } = await this.executor.query(toPositionalPlaceholders(sql), params as unknown[]);
    return rows as T[];
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<RunResult> {
    const result = await this.executor.query(toPositionalPlaceholders(sql), params as unknown[]);
    return { changes: result.rowCount ?? 0 };
  }

  async transaction<T>(fn: (tx: DbDriver) => Promise<T>): Promise<T> {
    if (!this.pool) {
      // Already running inside a transaction's own client — Postgres doesn't
      // need (and this contract doesn't offer) nested transactions/savepoints,
      // so a transaction() called from within one just reuses the same client.
      return fn(this);
    }

    const client = await this.pool.connect();
    const tx = new PostgresDriver(client);
    try {
      await client.query('BEGIN');
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {
        // The connection may already be unusable (e.g. it dropped mid-transaction) — the
        // original error is what matters and is rethrown below regardless.
      });
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }
}

export function createPostgresDriver(config: PoolConfig): DbDriver {
  const pool = new Pool(config);
  return new PostgresDriver(pool, pool);
}

export type PgSslMode = 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';

/**
 * Maps TREK's PGSSLMODE values to node-postgres's `ssl` option. 'disable' and
 * 'prefer' both resolve to no TLS today — TREK has no cleartext-then-upgrade
 * negotiation, so "prefer" degrades to "disable" rather than silently
 * requiring TLS an operator didn't ask for. 'verify-ca'/'verify-full' both
 * request certificate validation; node-postgres has no distinct CA-only mode.
 */
export function resolvePgSsl(mode: PgSslMode): PoolConfig['ssl'] {
  switch (mode) {
    case 'disable':
    case 'prefer':
      return undefined;
    case 'require':
      return { rejectUnauthorized: false };
    case 'verify-ca':
    case 'verify-full':
      return { rejectUnauthorized: true };
  }
}
