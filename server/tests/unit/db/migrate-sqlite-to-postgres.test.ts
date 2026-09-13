import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { convertTimestampValue, parseSqliteDatetimeText } from '../../../scripts/migrate-sqlite-to-postgres';
import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';

const SERVER_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT_PATH = path.join(SERVER_ROOT, 'scripts/migrate-sqlite-to-postgres.ts');

describe('parseSqliteDatetimeText', () => {
  it("treats SQLite's own space-separated shape as UTC (no timezone marker)", () => {
    expect(parseSqliteDatetimeText('2024-03-15 10:30:00')).toBe('2024-03-15T10:30:00Z');
  });

  it('passes an already-ISO-8601 string through unchanged (an app-level write that bypassed the DB default)', () => {
    expect(parseSqliteDatetimeText('2024-06-01T08:00:00.000Z')).toBe('2024-06-01T08:00:00.000Z');
  });
});

describe('convertTimestampValue', () => {
  it('datetime-text: converts SQLite text to an ISO instant', () => {
    expect(convertTimestampValue('datetime-text', '2024-03-15 10:30:00')).toBe(
      new Date('2024-03-15T10:30:00Z').toISOString(),
    );
  });

  it('epoch-seconds: multiplies by 1000 before converting', () => {
    expect(convertTimestampValue('epoch-seconds', 1_700_000_000)).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('epoch-millis: converts directly', () => {
    expect(convertTimestampValue('epoch-millis', 1_700_000_000_123)).toBe(new Date(1_700_000_000_123).toISOString());
  });

  it('passes non-timestamp columns and null values straight through', () => {
    expect(convertTimestampValue(undefined, 'plain text')).toBe('plain text');
    expect(convertTimestampValue('datetime-text', null)).toBeNull();
    expect(convertTimestampValue('epoch-millis', undefined)).toBeUndefined();
  });
});

/**
 * Env-gated: engages only when TREK_TEST_PG_URL is set (manual-only, via
 * `docker compose -f docker-compose.postgres-test.yml up` — see that file's
 * header). Runs the actual CLI as a subprocess (the way an operator would),
 * against a throwaway SQLite file built from the app's OWN schema.ts +
 * migrations.ts + seeds.ts (never a hand-copied schema), and a dedicated
 * Postgres schema so parallel test workers sharing the same instance can't
 * collide.
 */
const connectionString = process.env.TREK_TEST_PG_URL;
const schemaName = `trek_import_test_${randomUUID().replace(/-/g, '_')}`;

function runImportCli(sqliteFile: string): void {
  execFileSync(process.execPath, ['--import', 'tsx', SCRIPT_PATH, sqliteFile], {
    cwd: SERVER_ROOT,
    env: {
      ...process.env,
      DB_DRIVER: 'postgres',
      DATABASE_URL: connectionString,
      PGOPTIONS: `-c search_path=${schemaName}`,
    },
    stdio: 'pipe',
  });
}

describe.skipIf(!connectionString)('migrate-sqlite-to-postgres.ts (golden-file parity)', () => {
  let tmpDir: string;
  let sqliteFile: string;
  let admin: Pool;
  let seededUserId: number;
  let seededAppWrittenUserId: number;

  beforeAll(async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'trek-pg-import-'));
    sqliteFile = path.join(tmpDir, 'travel.db');

    const sqlite = new Database(sqliteFile);
    sqlite.exec('PRAGMA foreign_keys = ON');
    createTables(sqlite);
    runMigrations(sqlite);

    // Cover all four timestamp representations the import tool must reconcile.
    seededUserId = Number(
      sqlite
        .prepare(
          "INSERT INTO users (username, email, password_hash, created_at, updated_at) VALUES ('golden', 'golden@example.com', 'x', '2024-03-15 10:30:00', '2024-03-15 10:30:00')",
        )
        .run().lastInsertRowid,
    );
    seededAppWrittenUserId = Number(
      sqlite
        .prepare('INSERT INTO users (username, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run('golden2', 'golden2@example.com', 'x', '2024-06-01T08:00:00.000Z', '2024-06-01T08:00:00.000Z')
        .lastInsertRowid,
    );
    // created_at is explicit here (not left to the DEFAULT (strftime('%s','now'))
    // clause) so the test controls the exact epoch-seconds value being converted.
    sqlite
      .prepare(
        "INSERT INTO idempotency_keys (key, user_id, method, path, status_code, response_body, created_at) VALUES ('k1', ?, 'POST', '/x', 200, '{}', ?)",
      )
      .run(seededUserId, 1_700_000_000);
    sqlite
      .prepare('INSERT INTO journeys (user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(seededUserId, 'Golden Journey', 1_700_000_000_123, 1_700_000_000_123);
    sqlite.close();

    admin = new Pool({ connectionString });
    await admin.query(`CREATE SCHEMA "${schemaName}"`);
  });

  afterAll(async () => {
    await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    await admin.end();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports every row and reconciles every timestamp representation correctly', async () => {
    runImportCli(sqliteFile);

    const scoped = new Pool({ connectionString, options: `-c search_path=${schemaName}` });
    try {
      const users = await scoped.query(
        'SELECT id, username, created_at, updated_at FROM users WHERE id IN ($1, $2) ORDER BY id',
        [seededUserId, seededAppWrittenUserId],
      );
      expect(users.rows).toEqual([
        {
          id: seededUserId,
          username: 'golden',
          created_at: new Date('2024-03-15T10:30:00Z'),
          updated_at: new Date('2024-03-15T10:30:00Z'),
        },
        {
          id: seededAppWrittenUserId,
          username: 'golden2',
          created_at: new Date('2024-06-01T08:00:00.000Z'),
          updated_at: new Date('2024-06-01T08:00:00.000Z'),
        },
      ]);

      const idem = await scoped.query('SELECT created_at FROM idempotency_keys WHERE key = $1', ['k1']);
      // Seeded with epoch-seconds precision (1_700_000_000) -> exact-second instant.
      expect(idem.rows[0].created_at).toEqual(new Date(1_700_000_000_000));

      const journey = await scoped.query('SELECT created_at, updated_at FROM journeys WHERE title = $1', [
        'Golden Journey',
      ]);
      // Seeded with millisecond precision -> preserved exactly.
      expect(journey.rows[0].created_at).toEqual(new Date(1_700_000_000_123));

      // schema_version reflects the NEW Postgres migration runner's own state
      // (1 migration applied), never the old SQLite system's version number.
      const version = await scoped.query('SELECT version FROM schema_version');
      expect(version.rows[0].version).toBe(1);
    } finally {
      await scoped.end();
    }
  });

  it('a subsequent auto-assigned id does not collide with an imported explicit id', async () => {
    const scoped = new Pool({ connectionString, options: `-c search_path=${schemaName}` });
    try {
      const before = await scoped.query('SELECT MAX(id)::int AS max FROM users');
      const inserted = await scoped.query(
        "INSERT INTO users (username, email, password_hash) VALUES ('new-after-import', 'new@example.com', 'x') RETURNING id",
      );
      expect(inserted.rows[0].id).toBeGreaterThan(before.rows[0].max);
    } finally {
      await scoped.end();
    }
  });

  it('refuses to import into a non-empty target without --force', () => {
    expect(() => runImportCli(sqliteFile)).toThrow();
  });
});
