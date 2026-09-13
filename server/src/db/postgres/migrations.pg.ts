import type { DbDriver } from '../../nest/database/drivers/db-driver.interface';
import { POSTGRES_BASELINE_INDEXES, POSTGRES_BASELINE_TABLES } from './schema.pg';

/**
 * The Postgres-side migration runner. Deliberately NOT a step-by-step replay
 * of SQLite's 207 `migrations.ts` entries (see schema.pg.ts's header) —
 * migration 0 is a single baseline that creates the current end-state schema
 * directly, and this array is what future schema changes append to, under
 * the same append-only discipline as the SQLite runner (server/CLAUDE.md:
 * identity is positional — never reorder, insert mid-list, or delete).
 */
export interface PgMigration {
  /** Logged as each step applies — keep it short and specific, like a commit subject. */
  description: string;
  run(driver: DbDriver): Promise<void>;
}

const baseline: PgMigration = {
  description: 'baseline schema (Postgres equivalent of SQLite schema_version 207)',
  async run(driver) {
    for (const sql of POSTGRES_BASELINE_TABLES) await driver.run(sql);
    for (const sql of POSTGRES_BASELINE_INDEXES) await driver.run(sql);
  },
};

// Appended LAST, always. Never reorder, insert mid-array, or delete an entry —
// identity is positional (array index == schema_version), exactly like
// server/src/db/migrations.ts.
export const PG_MIGRATIONS: readonly PgMigration[] = [baseline];

/**
 * Runs every not-yet-applied migration in order, each in its own transaction
 * with the version bump committed alongside it — a crash between a step and
 * its version bump would otherwise replay an already-applied step. Safe to
 * call on every boot: a fully up-to-date database does nothing.
 */
export async function runPostgresMigrations(driver: DbDriver): Promise<void> {
  await driver.run('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = await driver.get<{ version: number }>('SELECT version FROM schema_version LIMIT 1');
  const startVersion = row?.version ?? 0;
  if (!row) await driver.run('INSERT INTO schema_version (version) VALUES (?)', [0]);

  for (let i = startVersion; i < PG_MIGRATIONS.length; i++) {
    const migration = PG_MIGRATIONS[i];
    await driver.transaction(async (tx) => {
      await migration.run(tx);
      await tx.run('UPDATE schema_version SET version = ?', [i + 1]);
    });
    console.log(`[DB] Postgres migration ${i + 1}/${PG_MIGRATIONS.length} applied: ${migration.description}`);
  }
}
