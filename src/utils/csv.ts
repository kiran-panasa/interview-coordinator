/**
 * Canonical CSV parsing primitives.
 * All CSV utilities across the codebase import from here — do not define local copies.
 */

/** Parse a single CSV line, respecting double-quoted fields with embedded commas. */
export function splitCSVRow(line: string): string[] {
  const cols: string[] = [];
  let curr = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { cols.push(curr.trim()); curr = ""; }
    else { curr += ch; }
  }
  cols.push(curr.trim());
  return cols;
}

/**
 * Parse a single CSV line, handling escaped double-quotes ("").
 * More permissive than splitCSVRow — use this for import CSVs with rich content.
 */
export function parseLine(line: string): string[] {
  const fields: string[] = [];
  let field = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { field += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) { fields.push(field.trim()); field = ""; }
    else field += c;
  }
  fields.push(field.trim());
  return fields;
}

/**
 * Split CSV text into lines while respecting quoted fields that contain newlines.
 * Replaces a naive text.split("\n") which breaks on multiline cell content.
 */
export function splitCSVLines(text: string): string[] {
  const lines: string[] = [];
  let current = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQ && text[i + 1] === '"') { current += '""'; i++; }
      else { inQ = !inQ; current += c; }
    } else if (c === '\r') {
      // skip carriage returns
    } else if (c === '\n' && !inQ) {
      if (current.trim()) lines.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}
