import type Database from 'better-sqlite3';
import type { DbDriver, RunResult } from './db-driver.interface';

/**
 * Wraps the existing (fully synchronous) better-sqlite3 connection behind the
 * async DbDriver contract, so DatabaseService's callers await uniformly
 * regardless of which backend is active. Every method still runs its actual
 * work synchronously under the hood — there is no real I/O to wait on — the
 * `async` keyword exists purely to satisfy the shared interface.
 *
 * transaction() cannot use better-sqlite3's own `db.transaction(fn)` helper,
 * because that helper requires a synchronous callback and would commit
 * immediately without waiting for an async `fn` to actually finish. Instead
 * this issues BEGIN/COMMIT/ROLLBACK directly. That is safe from interleaving
 * with unrelated concurrent requests ONLY because every statement in `fn` here
 * resolves via an already-computed value (never real async I/O): Node drains
 * a promise chain's microtasks to completion before it ever checks for new
 * macrotask work (a new incoming request, a timer, network I/O), so a
 * transaction whose body only ever awaits this driver's own get/all/run never
 * yields to another request mid-transaction. That guarantee breaks the
 * moment a transaction callback awaits genuine I/O (a fetch, a timer, a
 * filesystem read) — don't do that inside a transaction on this driver.
 */
export class SqliteDriver implements DbDriver {
  readonly dialect = 'sqlite' as const;

  constructor(private readonly conn: Database.Database) {}

  async get<T = unknown>(sql: string, params: readonly unknown[] = []): Promise<T | undefined> {
    return this.conn.prepare(sql).get(...params) as T | undefined;
  }

  async all<T = unknown>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.conn.prepare(sql).all(...params) as T[];
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<RunResult> {
    const result = this.conn.prepare(sql).run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }

  async transaction<T>(fn: (tx: DbDriver) => Promise<T>): Promise<T> {
    if (this.conn.inTransaction) {
      // Already running inside a transaction() called from within one —
      // reuse it rather than attempting a nested BEGIN (SQLite has no true
      // nested transactions; savepoints aren't part of this contract).
      return fn(this);
    }
    this.conn.exec('BEGIN');
    try {
      const result = await fn(this);
      this.conn.exec('COMMIT');
      return result;
    } catch (err) {
      this.conn.exec('ROLLBACK');
      throw err;
    }
  }

  async close(): Promise<void> {
    // Lifecycle (open/close/reinitialize-after-restore) stays owned by
    // db/database.ts for as long as DB_DRIVER=sqlite is supported — this
    // driver wraps that connection, it never owns it outright.
  }
}
