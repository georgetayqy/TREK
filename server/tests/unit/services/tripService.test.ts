/**
 * Unit tests for tripService — exportICS function (TRIP-SVC-001 through TRIP-SVC-009).
 * Uses a real in-memory SQLite DB so SQL logic is exercised faithfully.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

// ── DB setup ──────────────────────────────────────────────────────────────────

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  const mock = {
    db,
    closeDb: () => {},
    reinitialize: () => {},
    getPlaceWithTags: () => null,
    canAccessTrip: () => null,
    isOwner: () => false,
  };
  return { testDb: db, dbMock: mock };
});

vi.mock('../../../src/db/database', () => dbMock);
vi.mock('../../../src/config', () => ({
  JWT_SECRET: 'test-secret',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
}));

import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';
import { resetTestDb } from '../../helpers/test-db';
import { createUser, createTrip, createReservation } from '../../helpers/factories';
import { exportICS } from '../../../src/services/tripService';

beforeAll(() => {
  createTables(testDb);
  runMigrations(testDb);
});

beforeEach(() => {
  resetTestDb(testDb);
});

afterAll(() => {
  testDb.close();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('exportICS', () => {
  it('TRIP-SVC-001: returns VCALENDAR wrapper', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, {
      title: 'My Vacation',
      start_date: '2025-06-01',
      end_date: '2025-06-07',
    });

    const { ics } = exportICS(trip.id);

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('TRIP-SVC-002: trip with start_date + end_date includes all-day VEVENT', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, {
      title: 'Summer Holiday',
      start_date: '2025-06-01',
      end_date: '2025-06-07',
    });

    const { ics } = exportICS(trip.id);

    expect(ics).toContain('DTSTART;VALUE=DATE:20250601');
    expect(ics).toContain('SUMMARY:Summer Holiday');
  });

  it('TRIP-SVC-003: reservation with full datetime (includes T) → DTSTART without VALUE=DATE', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { title: 'Paris Trip' });
    const reservation = createReservation(testDb, trip.id, {
      title: 'Morning Flight',
      type: 'flight',
    });
    testDb
      .prepare('UPDATE reservations SET reservation_time=? WHERE id=?')
      .run('2025-06-02T09:00', reservation.id);

    const { ics } = exportICS(trip.id);

    expect(ics).toContain('DTSTART:20250602T090000');
    expect(ics).not.toContain('DTSTART;VALUE=DATE');
  });

  it('TRIP-SVC-004: reservation with date-only → DTSTART;VALUE=DATE', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { title: 'Paris Trip' });
    const reservation = createReservation(testDb, trip.id, {
      title: 'Hotel Check-in',
      type: 'hotel',
    });
    testDb
      .prepare('UPDATE reservations SET reservation_time=? WHERE id=?')
      .run('2025-06-02', reservation.id);

    const { ics } = exportICS(trip.id);

    expect(ics).toContain('DTSTART;VALUE=DATE:20250602');
  });

  it('TRIP-SVC-005: reservation metadata with flight info appears in DESCRIPTION', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { title: 'Paris Trip' });
    const reservation = createReservation(testDb, trip.id, {
      title: 'CDG to JFK',
      type: 'flight',
    });
    testDb
      .prepare('UPDATE reservations SET reservation_time=?, metadata=? WHERE id=?')
      .run(
        '2025-06-02T09:00',
        JSON.stringify({
          airline: 'Air Test',
          flight_number: 'AT100',
          departure_airport: 'CDG',
          arrival_airport: 'JFK',
        }),
        reservation.id
      );

    const { ics } = exportICS(trip.id);

    expect(ics).toContain('Airline: Air Test');
    expect(ics).toContain('Flight: AT100');
  });

  it('TRIP-SVC-006: special characters in title are escaped', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { title: 'Trip; First, Best' });

    const { ics } = exportICS(trip.id);

    expect(ics).toContain('Trip\\; First\\, Best');
  });

  it('TRIP-SVC-007: throws NotFoundError for non-existent trip', () => {
    expect(() => exportICS(99999)).toThrow();
  });

  it('TRIP-SVC-008: returns a filename derived from trip title', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { title: 'My Trip 2025' });

    const { filename } = exportICS(trip.id);

    expect(filename).toMatch(/My.Trip.2025\.ics/);
  });

  it('TRIP-SVC-009: reservation with end time includes DTEND', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { title: 'Paris Trip' });
    const reservation = createReservation(testDb, trip.id, {
      title: 'Afternoon Tour',
      type: 'activity',
    });
    testDb
      .prepare('UPDATE reservations SET reservation_time=?, reservation_end_time=? WHERE id=?')
      .run('2025-06-02T14:00', '2025-06-02T16:00', reservation.id);

    const { ics } = exportICS(trip.id);

    expect(ics).toContain('DTEND:20250602T160000');
  });
});
