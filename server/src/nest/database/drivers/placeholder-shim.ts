/**
 * Translates better-sqlite3's positional `?` bind placeholders to Postgres's
 * `$1`/`$2`/... so the ~600 existing hand-written SQL strings (and any new
 * ones written against the same convention) keep working unchanged against
 * the Postgres driver — the dialect difference is absorbed here, once,
 * instead of at every call site.
 *
 * Only `?` outside a single-quoted string literal is treated as a
 * placeholder — a literal `?` inside a bound value would have to appear
 * inline in the SQL source (not as a parameter) to be misdetected, and no
 * such usage exists in the current codebase (verified: no `.prepare()` call
 * site embeds a `?` inside a quoted literal). A doubled `''` inside a string
 * is treated as an escaped quote, not the string's end, per both SQLite's and
 * Postgres's standard SQL string-literal escaping.
 */
export function toPositionalPlaceholders(sql: string): string {
  let result = '';
  let inString = false;
  let paramIndex = 0;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (inString) {
      result += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          result += sql[++i];
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (ch === "'") {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === '?') {
      paramIndex += 1;
      result += `$${paramIndex}`;
      continue;
    }

    result += ch;
  }

  return result;
}
