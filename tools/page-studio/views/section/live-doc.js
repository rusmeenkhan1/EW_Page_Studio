/*
 * Reads the DA editor's live document (the SDK's subscribeLiveDocument() HTML)
 * for the Section view panel: which sections already have settings, which
 * section the cursor's block is in, and whether a selection (getSelection()
 * HTML) lies inside a section-metadata table.
 *
 * The live document is not the authored tables. DA builds it with prose2aem()
 * in live-preview mode (da-live blocks/shared/prose2aem.js, called by
 * getInstrumentedHTMLForSDK()): each section is a `main > div`, each block
 * table a `div.<name>`, the page metadata table is removed, and every
 * section-metadata table is applied to its section and deleted — `style` →
 * classes, any other key → a `data-<key>` attribute (applySectionMetadata()).
 * So a section's settings are read back from its attributes. Several tables
 * in one section merge, and empty rows and the keys' spelling are lost.
 * `metadata` and `section metadata` tables are not blocks, so the live
 * selection's blockIndex counts only the block divs, in document order
 * (da-live blocks/canvas/editor-utils/blocks.js).
 */

import {
  INSTRUMENTATION, parse, cellText, clean, trimEnd,
} from '../../shared/dom.js';

const NAME = 'section-metadata'; // `Section Metadata` normalises to the same

/** Text compared without case, spacing or punctuation differences (`Split-Left` / `split left`). */
const norm = (text) => String(text).toLowerCase().replace(/[^0-9a-z#]+/g, '-').replace(/^-|-$/g, '');
const tokens = (value) => value.split(',').map(norm).filter(Boolean);

/** Rows as a comparable list: keys normalised, empty rows dropped, style values sorted. */
function canonical(rows) {
  return rows.map(([key, value]) => {
    const k = norm(key);
    const v = k === 'style' ? tokens(value).sort().join(',') : value.trim().toLowerCase();
    return [k, v];
  }).filter(([k, v]) => k && v).sort(([a], [b]) => a.localeCompare(b));
}

/** Rows compared without case, order or spacing differences (e.g. `Style` / `style`). */
export const sameRows = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/*
 * A table inserted inside a settings table's cell stays raw HTML in that cell, so the
 * setting holds the cell's text run into the inner table's: a data value
 * (`#ffefbesection-metadata…`) or, in the style cell, one long class
 * (`hide-mobilesection-metadatabackground-ffefbe…`).
 */
const INNER_TABLE = /section[\s-]*metadata/i;

/**
 * @returns {{rows: [string, string][], nested: boolean, raw: string}} the settings prose2aem()
 *   applied to a section, each value cut where an inner table's text starts, whether one did,
 *   and the section's attributes as they are (to see that they changed)
 */
function sectionRows(section) {
  let nested = false;
  const cut = (text) => {
    const at = text.search(INNER_TABLE);
    if (at < 0) return text.trim();
    nested = true;
    return trimEnd(text.slice(0, at), '-').trim();
  };
  const rows = [...section.attributes]
    .filter(({ name }) => name.startsWith('data-') && name !== 'data-section-name')
    .map(({ name, value }) => [name.slice(5), cut(value)])
    .filter(([, value]) => value);
  const styles = [...section.classList].map(cut).filter(Boolean);
  if (styles.length) rows.push(['style', styles.join(', ')]);
  const raw = [...section.attributes].map(({ name, value }) => `${name}=${value}`).join(' ');
  return { rows, nested, raw };
}

/**
 * @param {string} html the live document
 * @returns {{tables: Object[], blocks: Object[]}} `tables`: one per section with settings
 *   (its section index, rows, and the texts a selection in its table can show);
 *   `blocks`: the block divs in blockIndex order, with their section index and name
 */
export function readDocument(html) {
  const doc = parse(html);
  const tables = [];
  const blocks = [];
  doc.querySelectorAll('main > div').forEach((el, section) => {
    const { rows, nested, raw } = sectionRows(el);
    if (rows.length || nested) {
      const cells = [NAME, ...rows.flatMap(([key, value]) => [key, value, ...tokens(value)])];
      tables.push({
        section, rows, nested, raw, cells: new Set(cells.map(norm)),
      });
    }
    el.querySelectorAll(':scope > div[class]')
      .forEach((block) => blocks.push({ section, name: block.classList[0] }));
  });
  return { tables, blocks };
}

/** @returns {string|null} the name of the block holding the cursor (`cards`), or null */
export function cursorBlock(live, blockIndex) {
  return Number.isInteger(blockIndex) ? live?.blocks[blockIndex]?.name ?? '' : null;
}

/**
 * The page metadata table's texts (whole cells and comma-separated parts), from the saved
 * DA source: the live document drops that table, and it is the only other table that is
 * not a block, so a selection in it looks like one in a section's settings.
 * @param {string} sourceHtml the page's DA source (admin.da.live/source/…)
 * @returns {Set<string>} its normalised texts
 */
export function readPageMetadata(sourceHtml) {
  const doc = parse(sourceHtml);
  const cells = [...doc.querySelectorAll('div.metadata > div > div')].map(cellText);
  return new Set(cells.flatMap((text) => [norm(text), ...tokens(text)]).filter(Boolean));
}

/** @returns {[string, string][]} a section's settings rows ([] when it has none) */
export const sectionSettings = (live, section) => live.tables
  .find((t) => t.section === section)?.rows || [];

/* ---- writing live: what changed? --------------------------------- */

const sectionsOf = (html) => [...parse(html).querySelectorAll('main > div')];

/**
 * The page's content without section settings: each section's text and image count. A write
 * of a section's settings table may change only its section's attributes, never this.
 */
export const pageSignature = (html) => sectionsOf(html)
  .map((s) => `${s.textContent.replace(/\s+/g, ' ').trim()}|${s.querySelectorAll('img').length}`)
  .join('\n');

/**
 * @returns {number[]|null} the sections whose attributes (their settings) differ between two
 *   live documents, or null when the sections themselves changed (one merged or split)
 */
export function changedSections(beforeHtml, afterHtml) {
  const attrs = (html) => sectionsOf(html).map((s) => [...s.attributes]
    .filter((a) => !INSTRUMENTATION.includes(a.name)).map((a) => `${a.name}=${a.value}`).sort().join(' '));
  const before = attrs(beforeHtml);
  const after = attrs(afterHtml);
  if (before.length !== after.length) return null;
  return before.map((a, i) => (a === after[i] ? -1 : i)).filter((i) => i >= 0);
}

/**
 * The content node a write took the place of (the cursor was on that line, not in the
 * settings table): the first section child the new document lacks. Only plain content
 * (a paragraph, heading, list, picture) can be put back this way.
 * @returns {string|null} its HTML
 */
export function removedNode(beforeHtml, afterHtml) {
  const kids = (html) => [...parse(html).querySelectorAll('main > div > *')];
  const before = kids(beforeHtml);
  const after = kids(afterHtml).map(clean);
  const node = before.find((el, i) => clean(el) !== after[i]);
  return node && !node.matches('div[class]') ? clean(node) : null;
}

/** The settings tables in one section of a DA source (more than one is a duplicate). */
export const settingsTables = (sourceHtml, section) => parse(sourceHtml)
  .querySelectorAll('main > div')[section]?.querySelectorAll('div.section-metadata').length ?? 0;

/**
 * Where a selection lies, judged from its HTML: DA serialises a selection with its
 * ancestors, so a selection inside a table cell comes back as a <table> holding the
 * selected text (only the selected cells). With the cursor in no block, the only tables
 * are section-metadata ones and the page metadata. The selection is in a section's
 * settings table when each selected cell is a whole value, key or style name of that
 * section's settings, or else (any part highlighted) is part of one. Text the page
 * metadata also has is not decided, as Update would replace the table at the cursor.
 * @param {string|null} selectionHtml getSelection() result
 * @param {Object} live readDocument() of the current document
 * @param {number|null} blockIndex the live selection's block
 * @param {Set<string>} [pageMetadata] readPageMetadata() of the page
 * @returns {{where: string, rows?: [string, string][], sections?: number[]}} `metadata` (with
 *   the table's rows and the sections that have them), `ambiguous` (sections with different
 *   settings, or the page metadata, hold the same text), `name` (only a table's name, e.g. of
 *   an empty one), `text` (selected text outside any such table), or `none` (nothing selected)
 */
export function locateSelection(selectionHtml, live, blockIndex, pageMetadata = new Set()) {
  if (!selectionHtml) return { where: 'none' };
  const doc = parse(selectionHtml);
  const roots = [...doc.body.children];
  const table = roots.length === 1 && roots[0].tagName === 'TABLE' ? roots[0] : null;
  if (!table || Number.isInteger(blockIndex)) return { where: 'text' };
  const all = [...table.querySelectorAll('td, th')].map((cell) => norm(cellText(cell))).filter(Boolean);
  if (!all.length) return { where: 'text' };
  // the table's name, or a part of it (`data` in `section-metadata`): every settings table has
  // it, and an empty one (all its rows taken out) has nothing else, so it says which table it
  // is not; nor is it text a write would lose. Only the other cells pick a table.
  const name = norm(NAME);
  const picked = all.filter((text) => !name.includes(text));
  if (!picked.length) return { where: 'name' };
  const values = (t) => new Set([...t.cells].filter((cell) => cell !== name));
  const holds = (texts, whole) => picked.every((text) => (whole ? texts.has(text)
    : [...texts].some((t) => t.includes(text))));
  // whole values first, so `blue` picks the section set to `blue`, not one whose value contains it
  let whole = true;
  let matches = live.tables.filter((t) => holds(values(t), true));
  if (!matches.length) {
    whole = false;
    matches = live.tables.filter((t) => holds(values(t), false));
  }
  if (!matches.length) return { where: 'text' };
  if (holds(pageMetadata, whole)) return { where: 'ambiguous' };
  // sections with the very same settings: replace still targets the table at the cursor
  if (matches.some((t) => !sameRows(t.rows, matches[0].rows))) return { where: 'ambiguous' };
  return { where: 'metadata', rows: matches[0].rows, sections: matches.map((t) => t.section) };
}
