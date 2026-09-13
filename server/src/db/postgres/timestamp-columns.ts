/**
 * Which SQLite storage convention each TIMESTAMPTZ column in schema.pg.ts
 * came from, so the one-time import tool (migrate-sqlite-to-postgres.ts)
 * knows how to convert that column's stored value into a real timestamp.
 * Kept as its own file (rather than folded into schema.pg.ts) because it is
 * consumed only by the import tool, not by the schema/migration runner.
 *
 * - 'datetime-text': SQLite `DATETIME DEFAULT CURRENT_TIMESTAMP`, or a TEXT
 *   column defaulted via `datetime('now')` — both produce the identical
 *   'YYYY-MM-DD HH:MM:SS' (implicitly UTC) text shape. A handful of these
 *   columns may ALSO contain an app-written ISO-8601-with-`Z` string from a
 *   direct `new Date().toISOString()` write that bypassed the DB default —
 *   the import tool's conversion handles both shapes (see
 *   parseSqliteDatetimeText in migrate-sqlite-to-postgres.ts).
 * - 'epoch-seconds': an INTEGER column defaulted via `strftime('%s','now')`.
 *   Only idempotency_keys.created_at uses this.
 * - 'epoch-millis': an INTEGER column with no SQL-level default, hand-verified
 *   (by reading its writer in src/nest/**) to always hold `Date.now()`.
 */
export type TimestampKind = 'datetime-text' | 'epoch-seconds' | 'epoch-millis';

export const TIMESTAMP_COLUMNS: Readonly<Record<string, Readonly<Record<string, TimestampKind>>>> = {
  audit_log: { created_at: 'datetime-text' },
  bucket_list: { created_at: 'datetime-text' },
  budget_items: { created_at: 'datetime-text' },
  budget_settlements: { created_at: 'datetime-text' },
  categories: { created_at: 'datetime-text' },
  collab_message_reactions: { created_at: 'datetime-text' },
  collab_messages: { created_at: 'datetime-text' },
  collab_notes: { created_at: 'datetime-text', updated_at: 'datetime-text' },
  collab_poll_votes: { created_at: 'datetime-text' },
  collab_polls: { created_at: 'datetime-text' },
  collection_labels: { created_at: 'datetime-text' },
  collection_members: { created_at: 'datetime-text' },
  collection_place_ratings: { created_at: 'datetime-text' },
  collection_places: { created_at: 'datetime-text', updated_at: 'datetime-text' },
  collections: { created_at: 'datetime-text', updated_at: 'datetime-text' },
  day_accommodations: { created_at: 'datetime-text' },
  day_assignments: { created_at: 'datetime-text' },
  day_notes: { created_at: 'datetime-text' },
  file_links: { created_at: 'datetime-text' },
  google_place_photo_meta: { error_at: 'epoch-millis', fetched_at: 'epoch-millis' },
  hidden_countries: { created_at: 'datetime-text' },
  hidden_regions: { created_at: 'datetime-text' },
  idempotency_keys: { created_at: 'epoch-seconds' },
  invite_tokens: { created_at: 'datetime-text' },
  journey_books: { created_at: 'datetime-text', updated_at: 'datetime-text' },
  journey_contributors: { added_at: 'epoch-millis' },
  journey_entries: { created_at: 'epoch-millis', updated_at: 'epoch-millis' },
  journey_entry_photos: { created_at: 'epoch-millis' },
  journey_photos: { created_at: 'epoch-millis' },
  journey_share_tokens: { created_at: 'datetime-text' },
  journey_trips: { added_at: 'epoch-millis' },
  journeys: { created_at: 'epoch-millis', updated_at: 'epoch-millis' },
  mcp_tokens: { created_at: 'datetime-text', last_used_at: 'datetime-text' },
  notifications: { created_at: 'datetime-text' },
  oauth_clients: { created_at: 'datetime-text' },
  oauth_consents: { updated_at: 'datetime-text' },
  oauth_tokens: {
    access_token_expires_at: 'datetime-text',
    created_at: 'datetime-text',
    refresh_token_expires_at: 'datetime-text',
    revoked_at: 'datetime-text',
  },
  packing_bags: { created_at: 'datetime-text' },
  packing_item_contributors: { created_at: 'datetime-text' },
  packing_items: { created_at: 'datetime-text', updated_at: 'datetime-text' },
  packing_templates: { created_at: 'datetime-text' },
  password_reset_tokens: { consumed_at: 'datetime-text', created_at: 'datetime-text', expires_at: 'datetime-text' },
  photos: { created_at: 'datetime-text' },
  place_details_cache: { fetched_at: 'epoch-millis' },
  place_ratings: { created_at: 'datetime-text' },
  places: { created_at: 'datetime-text', updated_at: 'datetime-text' },
  plugin_capability_audit: { ts: 'datetime-text' },
  plugin_egress_hosts: { created_at: 'datetime-text' },
  plugin_entity_metadata: { updated_at: 'datetime-text' },
  plugin_error_log: { ts: 'datetime-text' },
  plugin_meta_migrations: { applied_at: 'datetime-text' },
  plugin_oauth_state: { created_at: 'epoch-millis' },
  plugin_oauth_tokens: { expires_at: 'epoch-millis', updated_at: 'datetime-text' },
  plugin_scheduled_tasks: { created_at: 'datetime-text', due_at: 'epoch-millis' },
  plugin_user_config: { updated_at: 'datetime-text' },
  plugin_user_erasure_queue: { created_at: 'datetime-text' },
  plugins: { installed_at: 'datetime-text', updated_at: 'datetime-text' },
  reservation_endpoints: { created_at: 'datetime-text' },
  reservations: { created_at: 'datetime-text' },
  share_tokens: { created_at: 'datetime-text' },
  tags: { created_at: 'datetime-text' },
  todo_items: { created_at: 'datetime-text', reminded_at: 'datetime-text' },
  trek_photo_cache_meta: { fetched_at: 'epoch-millis' },
  trek_photos: { created_at: 'datetime-text' },
  trip_album_links: { created_at: 'datetime-text', last_synced_at: 'datetime-text' },
  trip_files: { created_at: 'datetime-text' },
  trip_invite_tokens: { created_at: 'datetime-text' },
  trip_members: { added_at: 'datetime-text' },
  trip_photos: { added_at: 'datetime-text' },
  trips: { created_at: 'datetime-text', updated_at: 'datetime-text' },
  user_notice_dismissals: { dismissed_at: 'epoch-millis' },
  users: { created_at: 'datetime-text', last_login: 'datetime-text', updated_at: 'datetime-text' },
  vacay_plan_members: { created_at: 'datetime-text' },
  vacay_plans: { created_at: 'datetime-text' },
  vacay_shares: { created_at: 'datetime-text' },
  visited_countries: { created_at: 'datetime-text' },
  visited_regions: { created_at: 'datetime-text' },
  webauthn_challenges: { created_at: 'datetime-text', expires_at: 'epoch-millis' },
  webauthn_credentials: { created_at: 'datetime-text', last_used_at: 'datetime-text' },
};
