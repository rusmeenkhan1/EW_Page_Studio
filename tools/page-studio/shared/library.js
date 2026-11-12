/*
 * The block library: which blocks there are and the option rows of each, from two sources.
 *
 *   the site file   `/page-studio.json` in the site's code (built from `blocks/<name>/<name>.studio.json`
 *                   by `tools/page-studio/cli/studio.mjs build`): what the block's code supports —
 *                   its styles, options, properties and content names. Owned by developers,
 *                   changed in the same pull request as the block's CSS.
 *   the DA sheet    the library sheet (`library-sheet`): the block list (`data`), option rows
 *                   (`options`) and named block groups (`groups`). Owned by authors and admins:
 *                   a row for a key the site file has changes only the cells it fills (label,
 *                   description, values, when); type `hidden` takes the row out; other rows add to it.
 *
 * Without a site file everything comes from the sheet, as before.
 *
 * The `blocks` cell of an option row: block names, comma-separated, and
 *   `*`          every block of the library except section-metadata
 *   `@group`     the blocks of a row of the `groups` tab (`group` | `blocks`)
 *   `-name`      not this block (or `-@group`), after the others
 *
 * Pure functions (no DOM, no fetch): the panels and the command-line tools share them.
 */
import { normalizeRow, parseValues } from './sheet.js';
import { toClassName } from './dom.js';

export const SECTION = 'section-metadata';
export const BLOCK_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `Section Metadata`, `section_metadata` → `section-metadata` */
export const toName = (text) => toClassName(text ?? '');

/** The cells a site-file option may have, as sheet columns. */
const CELLS = ['key', 'type', 'values', 'label', 'when', 'description'];

/** A sheet tab's rows (normalized), or []. */
export const tabRows = (json, tab) => (Array.isArray(json?.[tab]?.data) ? json[tab].data : [])
  .map(normalizeRow);

/**
 * A `values` cell from a site file's values: a string as written, `{ value: label }`, or
 * `[{ value, label }]`; `Label=value | …` either way.
 */
export function valuesCell(values) {
  if (values === undefined || values === null) return '';
  if (typeof values === 'string') return values;
  const pairs = Array.isArray(values)
    ? values.map((v) => (typeof v === 'string' ? [v, v] : [v?.value, v?.label ?? v?.value]))
    : Object.entries(values);
  return pairs.filter(([value]) => value !== undefined && value !== '')
    .map(([value, label]) => (String(label) === String(value) ? String(value) : `${label}=${value}`))
    .join(' | ');
}

/** A `description` cell from `{ '*': help, value: text }` or a string. */
function descriptionCell(description) {
  if (!description || typeof description === 'string') return description || '';
  return Object.entries(description).map(([value, text]) => (value === '*' ? text : `${value}=${text}`))
    .join(' | ');
}

/** The `when` cell from a string, a list of styles, or `{ value: [styles] }`. */
function whenCell(when) {
  if (!when || typeof when === 'string') return when || '';
  if (Array.isArray(when)) return when.join(', ');
  return Object.entries(when).map(([value, needs]) => `${value}=${[].concat(needs).join(', ')}`)
    .join(' | ');
}

/** One site-file option (or content names) of a block, as a normalized sheet row. */
export function fileRow(name, option) {
  const row = { blocks: name, source: 'code' };
  CELLS.forEach((cell) => { row[cell] = ''; });
  row.key = String(option?.key ?? '').trim();
  row.type = String(option?.type ?? '').trim();
  row.label = String(option?.label ?? '').trim();
  row.values = valuesCell(option?.values).trim();
  row.when = whenCell(option?.when).trim();
  row.description = descriptionCell(option?.description).trim();
  return row;
}

/** A block's rows in the site file: its options, then its content names (type `content`). */
export function fileRows(name, def) {
  const rows = (Array.isArray(def?.options) ? def.options : []).map((o) => fileRow(name, o))
    .filter((row) => row.key);
  if (def?.content && typeof def.content === 'object') {
    // the sheet's content cell is `part=Name`: the part as the label, the name as the value
    const values = Object.entries(def.content).map(([part, label]) => `${part}=${label}`).join(' | ');
    if (values) rows.push(fileRow(name, { key: 'content', type: 'content', values }));
  }
  return rows;
}

/** The `groups` tab: group name → its `blocks` tokens. */
export function parseGroups(json) {
  return Object.fromEntries(tabRows(json, 'groups')
    .filter((row) => row.group)
    .map((row) => [toName(row.group), row.blocks.split(',').map((t) => t.trim()).filter(Boolean)]));
}

/**
 * The blocks a `blocks` cell is for.
 * @param {string} cell e.g. `cards, hero`, `*`, `@media, -video`
 * @param {string[]} all every block of the library
 * @param {Object<string, string[]>} groups from parseGroups()
 * @param {function(string)} [report] gets each name or group it can't resolve
 * @returns {Set<string>}
 */
export function resolveBlocks(cell, all, groups, report = () => {}) {
  const take = new Set();
  const drop = new Set();
  const expand = (token, into, seen = new Set()) => {
    if (token === '*') {
      all.filter((name) => name !== SECTION).forEach((name) => into.add(name));
    } else if (token.startsWith('@')) {
      const group = toName(token.slice(1));
      if (!groups[group] || seen.has(group)) { report(token); return; }
      seen.add(group);
      groups[group].forEach((t) => expand(t, into, seen));
    } else {
      const name = toName(token);
      if (name) into.add(name);
    }
  };
  String(cell ?? '').split(',').map((t) => t.trim()).filter(Boolean).forEach((token) => {
    if (token.startsWith('-') || token.startsWith('!')) expand(token.slice(1).trim(), drop);
    else expand(token, take);
  });
  drop.forEach((name) => take.delete(name));
  return take;
}

/** The site file's blocks, with only valid names. */
export function siteBlocks(site) {
  const blocks = site?.blocks && typeof site.blocks === 'object' ? site.blocks : {};
  return Object.fromEntries(Object.entries(blocks).filter(([name]) => BLOCK_NAME.test(name)));
}

/**
 * The library from the sheet and the site file.
 * @param {Object|null} json the library sheet (multi-sheet JSON)
 * @param {Object|null} site the site file
 * @returns {{
 *   entries: {label: string, name: string, path: string}[],
 *   all: string[], groups: Object<string, string[]>,
 *   rowsFor: function(string): Object[],
 * }}
 */
export function buildLibrary(json, site = null) {
  const fromCode = siteBlocks(site);
  const entries = tabRows(json, 'data')
    .map((row) => ({
      label: row.name,
      name: toName(String(row.path || '').split('/').pop() || ''),
      path: row.path,
    }))
    .filter((b) => b.name);
  // blocks only the site file names come after the sheet's
  Object.entries(fromCode).forEach(([name, def]) => {
    if (name === SECTION || entries.some((b) => b.name === name)) return;
    const label = typeof def?.label === 'string' && def.label.trim() ? def.label.trim()
      : name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
    entries.push({ label, name, path: '' });
  });
  const all = [...new Set([...entries.map((b) => b.name), SECTION])];
  const groups = parseGroups(json);
  const sheetRows = tabRows(json, 'options').filter((row) => row.key)
    .map((row) => ({ ...row, targets: resolveBlocks(row.blocks, all, groups) }));

  const cache = {};
  const rowsFor = (name) => {
    if (!cache[name]) {
      const rows = fileRows(name, fromCode[name]);
      sheetRows.filter((row) => row.targets.has(name)).forEach(({ targets, ...row }) => {
        const own = rows.find((r) => r.source === 'code' && !r.merged
          && r.key.toLowerCase() === row.key.toLowerCase()
          && (r.type.toLowerCase() === 'content') === (row.type.toLowerCase() === 'content'));
        if (!own) { rows.push({ ...row, blocks: name, source: 'sheet' }); return; }
        own.merged = true; // one sheet row per site-file row
        if (['hidden', 'hide'].includes(row.type.toLowerCase())) { own.hidden = true; return; }
        CELLS.forEach((cell) => { if (cell !== 'key' && row[cell]) own[cell] = row[cell]; });
      });
      cache[name] = rows.filter((row) => !row.hidden)
        .map(({ merged, hidden, ...row }) => row);
    }
    return cache[name].map((row) => ({ ...row }));
  };
  return {
    entries, all, groups, rowsFor,
  };
}

/** The content names of rows (type `content`): `part` (lower case, no spaces) → name. */
export const contentNames = (rows) => Object.fromEntries(rows
  .filter((row) => row.type.toLowerCase() === 'content')
  .flatMap((row) => parseValues(row.values || ''))
  .map(({ label, value }) => [label.toLowerCase().replace(/\s+/g, ''), value]));
