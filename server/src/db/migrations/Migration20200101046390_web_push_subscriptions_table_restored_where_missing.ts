import { Migration } from '@mikro-orm/migrations';

/**
 * Web Push (#894) subscriptions: restores `push_subscriptions` on a database
 * that has the earlier migration recorded as executed but not the table.
 *
 * Such a database answered `GET /api/notifications/preferences` with a 500
 * (`no such table: push_subscriptions`). The shipped migration is frozen, so
 * this one repeats its DDL behind `IF NOT EXISTS`: a database that has the
 * table is left untouched.
 */
export class Migration20200101046390_web_push_subscriptions_table_restored_where_missing extends Migration {
  override name = 'Migration20200101046390_web_push_subscriptions_table_restored_where_missing';

  override async up(): Promise<void> {
    await this.execute(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        vapid_public_key TEXT NOT NULL,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_success_at TEXT,
        failure_count INTEGER NOT NULL DEFAULT 0
      )
    `);
    await this.execute(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)`);
  }
}
