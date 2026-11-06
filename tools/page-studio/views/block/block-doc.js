/*
 * Reads and builds blocks for the Block view panel.
 *
 * DA's live document (the SDK's subscribeLiveDocument() HTML) is prose2aem() output:
 * each block table is a `div.<name>.<variant>…` whose rows are `div > div` cells, and
 * getInstrumentedHTMLForSDK() marks it `data-block-index` (da-live
 * blocks/canvas/editor-utils/editor-utils.js). Those are the blocks DA's live selection
 * counts (`blockIndex`: every table but metadata / section-metadata, in document
 * order). A block library document (DA source) has the same div form. DA turns
 * `Cards (news, expand)` into `cards news expand`, so the first class is the block and
 * the others are its variants (decorateBlock() in scripts/aem.js).
 *
 * The panel sends DA a plain <table> (name row, then one row per block row), the form
 * DA's editor parses for both insert and replace.
 */

import {
  INSTRUMENTATION, parse, cellText, clean, escapeHtml, toClassName,
} from '../../shared/dom.js';

/** @returns {Element[]} the live document's block divs, in blockIndex order */
function liveBlocks(doc) {
  const marked = [...doc.querySelectorAll('main [data-block-index]')];
  return marked.length ? marked : [...doc.querySelectorAll('main > div > div[class]')];
}

/**
 * @param {Element} el a block div
 * @returns {{name: string, variants: string[], rows: [string, string][], el: Element}} the
 *   block's name, its variant classes, its key/value rows (first two cells as text) and a
 *   copy of the div to build a replacement from
 */
function describe(el) {
  const [name, ...variants] = [...el.classList];
  const rows = [...el.children]
    .map((row) => [cellText(row.children[0]), cellText(row.children[1])]);
  return {
    name, variants, rows, el: el.cloneNode(true),
  };
}

/**
 * @param {string} html the live document
 * @param {number|null} blockIndex the live selection's block
 * @returns {Object|null} describe() of the block holding the cursor, or null
 */
export function readBlock(html, blockIndex) {
  if (!Number.isInteger(blockIndex)) return null;
  const el = liveBlocks(parse(html))[blockIndex];
  // a table whose name cell is still empty isn't a block yet
  return el?.classList[0] ? describe(el) : null;
}

/**
 * The library example closest to the picked variants: the most of them, the fewest others.
 * @param {string} sourceHtml the block's library document (DA source)
 * @param {string} name the block
 * @param {string[]} variants the picked variants
 * @returns {Object|null} describe() of the example, or null when the document has none
 */
export function pickExample(sourceHtml, name, variants) {
  const examples = [...parse(sourceHtml).querySelectorAll('main div[class]')]
    .filter((el) => el.classList[0] === name);
  let best = null;
  let bestScore = -Infinity;
  examples.forEach((el) => {
    const own = [...el.classList].slice(1);
    const score = own.filter((v) => variants.includes(v)).length * 10
      - own.filter((v) => !variants.includes(v)).length;
    if (score > bestScore) {
      best = el;
      bestScore = score;
    }
  });
  return best ? describe(best) : null;
}

/** An empty block of one row, for a block with no library example. */
export function emptyBlock(name) {
  const el = document.createElement('div');
  el.className = name;
  el.innerHTML = '<div><div></div></div>';
  return describe(el);
}

/** A cell's HTML without the live document's instrumentation attributes. */
function cellHtml(cell) {
  const copy = cell.cloneNode(true);
  copy.querySelectorAll('*').forEach((el) => INSTRUMENTATION.forEach((a) => el.removeAttribute(a)));
  return copy.innerHTML.trim() || '<p></p>';
}

/** `cards (news, expand)`: the block's name row as DA writes it. */
const title = (name, variants) => (variants.length ? `${name} (${variants.join(', ')})` : name);

/**
 * A copy of the block with the picked properties: content rows are kept as they are; a
 * property row is set, added (at the end) or removed (when emptied).
 */
/** A property row: its key and value as plain text, each in a cell's paragraph. */
function propRow(doc, key, value) {
  const row = doc.createElement('div');
  [key, value].forEach((text) => {
    const cell = doc.createElement('div');
    const p = doc.createElement('p');
    p.textContent = text;
    cell.append(p);
    row.append(cell);
  });
  return row;
}

function withProps(block, props) {
  const el = block.el.cloneNode(true);
  props.forEach(({ key, value }) => {
    const row = [...el.children]
      .find((r) => toClassName(cellText(r.children[0])) === toClassName(key));
    if (!value) {
      row?.remove();
      return;
    }
    const next = propRow(el.ownerDocument, key, value);
    if (row) row.replaceWith(next);
    else el.append(next);
  });
  return el;
}

/**
 * The DA table for a block with the picked variants and properties (see withProps()).
 * @param {Object} block describe() of the block (live or library example)
 * @param {string[]} variants the variant classes
 * @param {{key: string, value: string}[]} props the property values ('' = no row)
 * @returns {string} the table HTML
 */
export function buildTable(block, variants, props) {
  const el = withProps(block, props);
  const rows = [...el.children];
  const cols = Math.max(1, ...rows.map((r) => r.children.length));
  const head = `<tr><td colspan="${cols}"><p>${escapeHtml(title(block.name, variants))}</p></td></tr>`;
  const cells = (row) => [...row.children].map((cell) => `<td>${cellHtml(cell)}</td>`).join('');
  const body = rows.map((row) => `<tr>${cells(row)}</tr>`).join('');
  return `<table>${head}${body}</table>`;
}

/* ---- placing a trial block: did it replace anything? ---------------- */

/**
 * What a live document holds apart from one block: each section's settings (its attributes,
 * where DA puts section metadata), text and images. Two documents with the same signature
 * differ only in that block, or in empty lines.
 * @param {string} html the live document
 * @param {number|null} [skip] the blockIndex of the block to leave out
 * @returns {string}
 */
export function contentSignature(html, skip = null) {
  const doc = parse(html);
  if (Number.isInteger(skip)) liveBlocks(doc)[skip]?.remove();
  return [...doc.querySelectorAll('main > div')].map((section) => {
    const attrs = [...section.attributes].filter((a) => !INSTRUMENTATION.includes(a.name))
      .map((a) => `${a.name}=${a.value}`).sort().join(' ');
    const text = section.textContent.replace(/\s+/g, ' ').trim();
    return `${attrs}|${text}|${section.querySelectorAll('img').length}`;
  }).join('\n');
}

/**
 * The block a placement added: its blockIndex in the new live document.
 * @returns {number|null} null when the block count didn't grow by one
 */
export function addedBlock(beforeHtml, afterHtml) {
  const before = liveBlocks(parse(beforeHtml)).map(clean);
  const after = liveBlocks(parse(afterHtml)).map(clean);
  if (after.length !== before.length + 1) return null;
  const at = after.findIndex((html, i) => html !== before[i]);
  return at < 0 ? after.length - 1 : at;
}

/**
 * The content node a placement took the place of, when putting it back where the block is
 * gives the page it had before (a paragraph, heading, list or picture). Section settings or
 * a page metadata table can't be put back this way (the live document holds neither as a
 * node): null.
 * @param {number} index the blockIndex of the placed block in the new live document
 * @returns {string|null} the node's HTML
 */
export function replacedNode(beforeHtml, afterHtml, index) {
  const before = [...parse(beforeHtml).querySelectorAll('main > div > *')];
  const doc = parse(afterHtml);
  const block = liveBlocks(doc)[index];
  if (!block) return null;
  const at = [...doc.querySelectorAll('main > div > *')].indexOf(block);
  const node = before[at];
  if (!node || node.matches('div[class]')) return null;
  block.replaceWith(doc.importNode(node, true));
  return contentSignature(doc.documentElement.outerHTML) === contentSignature(beforeHtml)
    ? clean(node) : null;
}
