// Fast drop-in for make.fun's csv-reader 1.0.0: returns exactly what readCsv
// returns for every input {text, header} -> {columns, rows, errors}, but
// scans with charCodeAt loops and extracts fields with slice instead of
// reading one character at a time with per-character string concatenation.
//
// Semantics replicated exactly from the reference (vendor/csv-reader):
//  - U+FEFF at the very start is dropped.
//  - A record ends at LF or CRLF; a line left with no characters is no record.
//  - Outside quotes a CR not followed by LF is dropped (stray_cr).
//  - A field opening with a quote runs to the next quote that is not doubled;
//    "" inside is one quote; CRLF or a lone CR inside is read as LF; what
//    follows the closing quote, up to the next comma or line break, is appended
//    as it stands (quote_junk, when the field ends); a quote that never closes
//    is a literal character and the text after it is read again as unquoted
//    (unterminated_quote).
//  - A quote inside an unquoted field is a literal character; fields stay
//    strings, never trimmed or converted.
//  - columns is the first record when header is true, else null; rows holds
//    the records after it, each padded with "" (short_row, with fields: its
//    count) or cut (long_row, with extra: the cut fields) to the first
//    record's width.
//  - Each error is {code, line, row}: line the 1-based line its record starts
//    on (every LF, CRLF and lone CR inside a quoted field counted), row its
//    record's index in rows (null for the header), in the order met, a field's
//    quote_junk when the field ends and a record's short_row or long_row when
//    the record ends.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next. No caching across cases; each run(input) call is independent.
const COMMA = 0, LINE_BREAK = 1, END = 2;
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;
  let pos = 0, line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;
  let recordLine = 1, recordRow = null;

  function readUnquoted(value, added) {
    let parts = null;
    let seg = pos;
    while (pos < n) {
      // scan to next delimiter char
      let i = pos;
      let c;
      while (i < n) {
        c = text.charCodeAt(i);
        if (c === 44 || c === 10 || c === 13) break;
        i++;
      }
      if (i >= n) {
        if (parts !== null) { parts.push(text.slice(seg)); value = parts.join(''); }
        else value += text.slice(seg);
        added += n - seg;
        pos = n;
        return { value, ended: END, added };
      }
      if (c === 44) {
        if (parts !== null) { parts.push(text.slice(seg, i)); value = parts.join(''); }
        else value += text.slice(seg, i);
        added += i - seg;
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (c === 10) {
        if (parts !== null) { parts.push(text.slice(seg, i)); value = parts.join(''); }
        else value += text.slice(seg, i);
        added += i - seg;
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // CR
      if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
        if (parts !== null) { parts.push(text.slice(seg, i)); value = parts.join(''); }
        else value += text.slice(seg, i);
        added += i - seg;
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (parts === null) parts = [value];
      parts.push(text.slice(seg, i));
      added += i - seg;
      pos = i + 1;
      seg = pos;
    }
    if (parts !== null) value = parts.join('');
    return { value, ended: END, added };
  }

  function readQuoted() {
    const open = pos;
    const openLine = line;
    let parts = null;
    let seg = pos + 1;
    pos = pos + 1;
    let closed = false;
    while (pos < n) {
      // scan to the next quote, LF or CR
      let d = pos;
      let kind = -1;
      while (d < n) {
        const cc = text.charCodeAt(d);
        if (cc === 34) { kind = 0; break; }
        if (cc === 10) { kind = 1; break; }
        if (cc === 13) { kind = 2; break; }
        d++;
      }
      if (kind === -1) break;
      if (kind === 0) {
        if (d + 1 < n && text.charCodeAt(d + 1) === 34) {
          if (parts === null) parts = [];
          parts.push(text.slice(seg, d));
          parts.push('"');
          pos = d + 2;
          seg = pos;
          continue;
        }
        let value;
        if (parts !== null) { parts.push(text.slice(seg, d)); value = parts.join(''); }
        else value = text.slice(seg, d);
        pos = d + 1;
        closed = true;
        if (pos >= n) return { value, ended: END };
        const c = text.charCodeAt(pos);
        if (c === 44) { pos += 1; return { value, ended: COMMA }; }
        if (c === 10) { pos += 1; line += 1; return { value, ended: LINE_BREAK }; }
        if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
          pos += 2; line += 1; return { value, ended: LINE_BREAK };
        }
        const junk = readUnquoted(value, 0);
        if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        return junk;
      }
      if (parts === null) parts = [];
      parts.push(text.slice(seg, d));
      parts.push('\n');
      line += 1;
      if (kind === 1) pos = d + 1;
      else pos = d + 1 < n && text.charCodeAt(d + 1) === 10 ? d + 2 : d + 1;
      seg = pos;
    }
    if (!closed) {
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"', 0);
    }
    return { value: '', ended: END };
  }

  while (true) {
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;
    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('', 0);
      fields.push(field.value);
    } while (field.ended === COMMA);
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; continue; }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
