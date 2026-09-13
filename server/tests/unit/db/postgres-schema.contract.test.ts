import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPostgresDriver } from '../../../src/nest/database/drivers/postgres.driver';
import { PG_MIGRATIONS, runPostgresMigrations } from '../../../src/db/postgres/migrations.pg';
import { POSTGRES_BASELINE_TABLES, POSTGRES_BASELINE_INDEXES } from '../../../src/db/postgres/schema.pg';
import type { DbDriver } from '../../../src/nest/database/drivers/db-driver.interface';

/**
 * Env-gated: engages only when TREK_TEST_PG_URL is set (manual-only, via
 * `docker compose -f docker-compose.postgres-test.yml up` — see that file's
 * header). Mirrors postgres.driver.contract.test.ts's gating, but exercises
 * the actual baseline schema + migration runner rather than the driver alone.
 *
 * Each run gets its own throwaway Postgres schema (not just tables) so
 * repeated/parallel runs against a shared instance never collide.
 */
const connectionString = process.env.TREK_TEST_PG_URL;
const schemaName = `trek_schema_test_${randomUUID().replace(/-/g, '_')}`;

describe.skipIf(!connectionString)('Postgres baseline schema + migration runner', () => {
  let admin: DbDriver;
  let scoped: DbDriver;

  beforeAll(async () => {
    admin = createPostgresDriver({ connectionString });
    await admin.run(`CREATE SCHEMA "${schemaName}"`);
    // Every connection this driver's pool opens gets search_path pinned to the
    // fresh schema, so the baseline's unqualified `CREATE TABLE ...` calls land
    // there instead of "public".
    scoped = createPostgresDriver({ connectionString, options: `-c search_path=${schemaName}` });
  });

  afterAll(async () => {
    await scoped.close();
    await admin.run(`DROP SCHEMA "${schemaName}" CASCADE`);
    await admin.close();
  });

  it('applies the full baseline schema with zero errors', async () => {
    await runPostgresMigrations(scoped);
    const { count } = (await scoped.get<{ count: string }>(
      `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = ?`,
      [schemaName],
    ))!;
    // +1: the migration runner's own schema_version bookkeeping table, created
    // by runPostgresMigrations() itself rather than listed in the baseline.
    expect(Number(count)).toBe(POSTGRES_BASELINE_TABLES.length + 1);
  });

  it('records schema_version equal to the number of migrations applied', async () => {
    const row = await scoped.get<{ version: number }>('SELECT version FROM schema_version LIMIT 1');
    expect(row?.version).toBe(PG_MIGRATIONS.length);
  });

  it('creates every declared index', async () => {
    const { count } = (await scoped.get<{ count: string }>(
      `SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname = ?`,
      [schemaName],
    ))!;
    // >= not ===: PRIMARY KEY/UNIQUE column constraints create their own
    // implicit indexes on top of the ones explicitly listed in schema.pg.ts.
    expect(Number(count)).toBeGreaterThanOrEqual(POSTGRES_BASELINE_INDEXES.length);
  });

  it('re-running the migrator on an up-to-date schema is a no-op', async () => {
    await expect(runPostgresMigrations(scoped)).resolves.toBeUndefined();
    const row = await scoped.get<{ version: number }>('SELECT version FROM schema_version LIMIT 1');
    expect(row?.version).toBe(PG_MIGRATIONS.length);
  });
});
