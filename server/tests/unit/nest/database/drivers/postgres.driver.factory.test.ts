import { describe, it, expect } from 'vitest';
import { deriveDb } from '../../../../../src/app-config/derive';
import { resolvePgSsl } from '../../../../../src/nest/database/drivers/postgres.driver';
import { buildPostgresPoolConfig } from '../../../../../src/nest/database/drivers/postgres.driver.factory';

describe('resolvePgSsl', () => {
  it('disable and prefer both resolve to no TLS', () => {
    expect(resolvePgSsl('disable')).toBeUndefined();
    expect(resolvePgSsl('prefer')).toBeUndefined();
  });

  it('require accepts an unverified certificate', () => {
    expect(resolvePgSsl('require')).toEqual({ rejectUnauthorized: false });
  });

  it('verify-ca and verify-full both require a validated certificate', () => {
    expect(resolvePgSsl('verify-ca')).toEqual({ rejectUnauthorized: true });
    expect(resolvePgSsl('verify-full')).toEqual({ rejectUnauthorized: true });
  });
});

describe('buildPostgresPoolConfig', () => {
  it('a set DATABASE_URL wins outright over any discrete PG* fields', () => {
    const db = deriveDb({
      DATABASE_URL: 'postgres://u:p@db:5432/trek',
      PGHOST: 'ignored-host',
      PGDATABASE: 'ignored-db',
    });
    expect(buildPostgresPoolConfig(db)).toEqual({
      connectionString: 'postgres://u:p@db:5432/trek',
      ssl: undefined,
    });
  });

  it('falls back to discrete PG* fields when no DATABASE_URL is set', () => {
    const db = deriveDb({
      PGHOST: 'pg.internal',
      PGPORT: '6543',
      PGDATABASE: 'trek',
      PGUSER: 'trek',
      PGPASSWORD: 'secret',
      PGSSLMODE: 'require',
    });
    expect(buildPostgresPoolConfig(db)).toEqual({
      host: 'pg.internal',
      port: 6543,
      database: 'trek',
      user: 'trek',
      password: 'secret',
      ssl: { rejectUnauthorized: false },
    });
  });

  it('defaults host/port when nothing is set at all', () => {
    expect(buildPostgresPoolConfig(deriveDb({}))).toEqual({
      host: 'localhost',
      port: 5432,
      database: undefined,
      user: undefined,
      password: undefined,
      ssl: undefined,
    });
  });
});
