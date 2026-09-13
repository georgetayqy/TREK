/**
 * The database abstraction's contract surface, mirroring the shape of
 * server/src/nest/storage/storage.types.ts's StorageDriver: one capability
 * interface, all-Promise, one driver file per backend. Call sites keep their
 * existing hand-written SQL strings and `?` positional bind syntax — a driver
 * (see postgres.driver.ts) is responsible for translating that to its own
 * dialect, not the caller.
 *
 * `sql` is always the SAME string a caller would have passed to
 * better-sqlite3's `.prepare(sql).get/all/run(...params)` today; params are
 * positional in source order. A driver is free to rewrite `sql` internally
 * (e.g. `?` -> `$1`) but must not require callers to know its dialect.
 */
export interface RunResult {
  /** Rows affected — better-sqlite3's `RunResult.changes` / pg's `rowCount`. */
  changes: number;
  /**
   * better-sqlite3 returns the last auto-assigned rowid for free; Postgres has
   * no equivalent without an explicit `RETURNING id` in the statement. Only a
   * SQLite-backed driver ever populates this — Postgres-backed callers must
   * add `RETURNING id` and read it via `get`/`all` instead (tracked for the
   * call-site conversion milestone, not part of the driver contract itself).
   */
  lastInsertRowid?: number | bigint;
}

export interface DbDriver {
  /** Which SQL dialect this driver speaks — lets a call site branch only when it truly must. */
  readonly dialect: 'sqlite' | 'postgres';

  get<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;

  all<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;

  run(sql: string, params?: readonly unknown[]): Promise<RunResult>;

  /**
   * Runs `fn` inside one transaction. `fn` receives a `DbDriver` bound to the
   * transaction's own connection — queries issued through it join the same
   * transaction; queries issued through the outer driver do not. Commits on
   * a resolved promise, rolls back (and rethrows) on a rejected one.
   */
  transaction<T>(fn: (tx: DbDriver) => Promise<T>): Promise<T>;

  /** Releases any pooled connections. Idempotent; safe to call during shutdown. */
  close(): Promise<void>;
}
