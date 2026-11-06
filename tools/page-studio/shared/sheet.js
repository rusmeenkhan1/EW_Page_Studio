/*
 * Reading the DA sheets the authoring panels are built from (/.da/library/blocks,
 * /.da/library/buttons): rows, `values`, `description` and `when` cells.
 */

/** A sheet row with its column names lower case and every value a trimmed string. */
export const normalizeRow = (row) => Object.fromEntries(Object.entries(row)
  .map(([k, v]) => [k.trim().toLowerCase(), String(v ?? '').trim()]));

/** Lower-cases an object's keys. */
export const byKey = (obj) => Object.fromEntries(Object.entries(obj || {})
  .map(([k, v]) => [k.toLowerCase(), v]));

/**
 * @param {string} values `label=value | value | …` (a bare value is its own label)
 * @returns {{label: string, value: string}[]} the choices
 */
export const parseValues = (values) => values.split('|').map((entry) => {
  const [label, value = label] = entry.split('=').map((s) => s.trim());
  return { label, value };
}).filter((c) => c.label && c.value);

/**
 * @param {string} cell `value=text | text | …`
 * @returns {Object<string, string>} the text per value; the field's own help under `*`
 */
export const parseDescriptions = (cell) => Object.fromEntries(cell.split('|').map((part) => {
  const at = part.indexOf('=');
  return at < 0 ? ['*', part.trim()] : [part.slice(0, at).trim(), part.slice(at + 1).trim()];
}).filter(([, text]) => text));

/**
 * The `when` cell: `center` (the whole field) or `map-wide=center | tall=text-up` (each
 * choice): the field or choice only shows, and only counts, while one of those is picked.
 * @param {function(string): string} norm how a value is compared (lower case, or a class name)
 * @returns {{row: string[], choice: Object<string, string[]>}} the values that must be picked
 */
export function parseWhen(cell, norm) {
  const list = (text) => text.split(',').map(norm).filter(Boolean);
  if (!cell.includes('=')) return { row: list(cell), choice: {} };
  const choice = Object.fromEntries(cell.split('|').map((part) => {
    const at = part.indexOf('=');
    return [norm(part.slice(0, at)), list(part.slice(at + 1))];
  }).filter(([value, needs]) => value && needs.length));
  return { row: [], choice };
}
