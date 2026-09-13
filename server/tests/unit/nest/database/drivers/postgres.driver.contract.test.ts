import { describe, beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPostgresDriver } from '../../../../../src/nest/database/drivers/postgres.driver';
import type { DbDriver } from '../../../../../src/nest/database/drivers/db-driver.interface';

/**
 * Env-gated: engages only when TREK_TEST_PG_URL is set (manual-only, via
 * `docker compose -f docker-compose.postgres-test.yml up` — see that file's
 * header). Local runs stay hermetic. Mirrors s3.driver.contract.test.ts's gating.
 */
const connectionString = process.env.TREK_TEST_PG_URL;

describe.skipIf(!connectionString)('PostgresDriver against a real Postgres', () => {
  let driver: DbDriver;
  let table: string;

  beforeAll(() => {
    driver = createPostgresDriver({ connectionString });
  });

  afterAll(async () => {
    await driver.close();
  });

  beforeEach(async () => {
    // Fresh table per test — reruns against a shared instance never collide.
    table = `contract_${randomUUID().replace(/-/g, '_')}`;
    await driver.run(`CREATE TABLE ${table} (id SERIAL PRIMARY KEY, name TEXT NOT NULL, note TEXT)`);
  });

  it('run() inserts and get()/all() read the row(s) back using ? placeholders', async () => {
    await driver.run(`INSERT INTO ${table} (name, note) VALUES (?, ?)`, ["it's a test", 'TICKETJSON:%?']);
    const row = await driver.get<{ id: number; name: string; note: string }>(
      `SELECT * FROM ${table} WHERE name = ?`,
      ["it's a test"],
    );
    expect(row?.note).toBe('TICKETJSON:%?');

    await driver.run(`INSERT INTO ${table} (name) VALUES (?)`, ['second row']);
    const rows = await driver.all<{ name: string }>(`SELECT name FROM ${table} ORDER BY id`);
    expect(rows.map((r) => r.name)).toEqual(["it's a test", 'second row']);
  });

  it('get() returns undefined, not null, when nothing matches', async () => {
    const row = await driver.get(`SELECT * FROM ${table} WHERE id = ?`, [999_999]);
    expect(row).toBeUndefined();
  });

  it('run() reports the number of affected rows', async () => {
    await driver.run(`INSERT INTO ${table} (name) VALUES (?), (?), (?)`, ['a', 'b', 'c']);
    const result = await driver.run(`UPDATE ${table} SET note = ?`, ['updated']);
    expect(result.changes).toBe(3);
  });

  it('transaction() commits on success', async () => {
    await driver.transaction(async (tx) => {
      await tx.run(`INSERT INTO ${table} (name) VALUES (?)`, ['committed']);
    });
    const rows = await driver.all(`SELECT * FROM ${table}`);
    expect(rows).toHaveLength(1);
  });

  it('transaction() rolls back and rethrows on failure', async () => {
    await expect(
      driver.transaction(async (tx) => {
        await tx.run(`INSERT INTO ${table} (name) VALUES (?)`, ['rolled-back']);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await driver.all(`SELECT * FROM ${table}`);
    expect(rows).toHaveLength(0);
  });

  it('transaction() calls issued through tx join the same transaction as nested calls through it', async () => {
    await driver.transaction(async (tx) => {
      await tx.run(`INSERT INTO ${table} (name) VALUES (?)`, ['outer']);
      // A transaction() called from inside an existing one reuses the same
      // client rather than opening a second connection (see postgres.driver.ts).
      await tx.transaction(async (inner) => {
        await inner.run(`INSERT INTO ${table} (name) VALUES (?)`, ['inner']);
      });
      const rows = await tx.all(`SELECT name FROM ${table} ORDER BY name`);
      expect(rows).toEqual([{ name: 'inner' }, { name: 'outer' }]);
    });
  });
});
