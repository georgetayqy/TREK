import { describe, it, expect } from 'vitest';
import { toPositionalPlaceholders } from '../../../../../src/nest/database/drivers/placeholder-shim';

describe('toPositionalPlaceholders', () => {
  it('numbers placeholders in source order starting at $1', () => {
    expect(toPositionalPlaceholders('SELECT * FROM trips WHERE id = ?')).toBe(
      'SELECT * FROM trips WHERE id = $1',
    );
    expect(toPositionalPlaceholders('UPDATE trips SET name = ?, currency = ? WHERE id = ?')).toBe(
      'UPDATE trips SET name = $1, currency = $2 WHERE id = $3',
    );
  });

  it('leaves SQL with no placeholders untouched', () => {
    expect(toPositionalPlaceholders('SELECT 1')).toBe('SELECT 1');
  });

  it('does not treat a ? inside a single-quoted literal as a placeholder', () => {
    expect(toPositionalPlaceholders("SELECT * FROM notes WHERE note LIKE 'TICKETJSON:%?' AND id = ?")).toBe(
      "SELECT * FROM notes WHERE note LIKE 'TICKETJSON:%?' AND id = $1",
    );
  });

  it('treats a doubled quote inside a string as an escaped quote, not the string end', () => {
    // "it''s" is one SQL string literal containing a literal apostrophe; the ?
    // that follows is a real placeholder, not (mis-set) still "inside" the string.
    expect(toPositionalPlaceholders("SELECT * FROM t WHERE label = 'it''s' AND id = ?")).toBe(
      "SELECT * FROM t WHERE label = 'it''s' AND id = $1",
    );
  });

  it('handles a placeholder immediately followed by more SQL', () => {
    expect(toPositionalPlaceholders('SELECT * FROM t WHERE a=? AND b=?)')).toBe(
      'SELECT * FROM t WHERE a=$1 AND b=$2)',
    );
  });
});
