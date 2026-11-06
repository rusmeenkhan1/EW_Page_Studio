/*
 * A block's content as fields, for the Block view panel's Content area.
 *
 * No per-block model: the fields come from what the block holds. A block is rows of
 * cells (the EDS div form, block-doc.js); each top-level element of a cell is a part:
 *   image    a picture or img (also wrapped in a p or a link)
 *   heading  h1–h6
 *   button   a paragraph that is one link (bold/italic marks and `[style=…]` options
 *            stay as they are: only the label and the link change)
 *   text     a paragraph of plain text (one wrapping mark, e.g. <em>, is kept)
 *   list     ul / ol of plain items
 *   rich     anything else (mixed formatting, inline links, tables): shown, edited in
 *            the page
 * Rows that are properties (`key | value`, a sheet field of the block) are not content.
 * When the content rows share one shape (cards, quote lines, stats) they are items:
 * they can be added (a copy of the last), removed and moved.
 *
 * Everything here changes a working copy of the block (an element from a DOMParser
 * document, never the panel's page) through the DOM: text goes in as text, links and
 * image addresses are checked first (safeLink(), safeImage()).
 */

import { buttonLink, optionsSuffix, withoutOptions } from '../../shared/dom.js';

const HEADING = /^H[1-6]$/;
const INLINE_MARKS = new Set(['EM', 'STRONG', 'U', 'S', 'SUB', 'SUP', 'B', 'I', 'SPAN']);

const meaningful = (node) => node.nodeType === 1
  || (node.nodeType === 3 && node.textContent.trim());

/**
 * The element whose text is the whole text of `el`, through single wrapping marks
 * (`<p><em>Chief Executive Officer</em></p>` → the em), or null when the text is mixed.
 */
function soleTextHolder(el) {
  const kids = [...el.childNodes].filter(meaningful);
  if (!kids.length || kids.every((n) => n.nodeType === 3)) return el;
  if (kids.length === 1 && INLINE_MARKS.has(kids[0].tagName)) return soleTextHolder(kids[0]);
  return null;
}

const imageOf = (el) => (el.tagName === 'IMG' ? el : el.querySelector('img'));

/** A paragraph that is one image (a picture, maybe in a link), with no text. */
function isImage(el) {
  if (el.tagName === 'PICTURE' || el.tagName === 'IMG') return true;
  return ['P', 'A', 'DIV'].includes(el.tagName) && Boolean(imageOf(el)) && !el.textContent.trim();
}

/** @returns {{kind: string, el: Element}} what one top-level element of a cell is */
function partOf(el) {
  if (isImage(el)) return { kind: 'image', el };
  if (HEADING.test(el.tagName)) return { kind: soleTextHolder(el) ? 'heading' : 'rich', el };
  if (buttonLink(el)) return { kind: 'button', el };
  if (el.tagName === 'P' && soleTextHolder(el)) return { kind: 'text', el };
  if ((el.tagName === 'UL' || el.tagName === 'OL')
    && [...el.children].every((li) => li.tagName === 'LI' && soleTextHolder(li))) {
    return { kind: 'list', el };
  }
  return { kind: 'rich', el };
}

const cellKey = (cell) => (cell.children[0]?.textContent || '').trim().toLowerCase()
  .replace(/[^0-9a-z]+/g, '-')
  .replace(/^-|-$/g, ''); // runs are one `-` by now

/**
 * @param {Element} el the working copy of the block
 * @param {string[]} propKeys the block's property keys (their rows are not content)
 * @returns {{rows: {el: Element, cells: {el: Element, parts: Object[]}[]}[], list: boolean}}
 */
export function readContent(el, propKeys = [], forceList = false) {
  const props = new Set(propKeys.map((k) => k.toLowerCase().replace(/[^0-9a-z]+/g, '-')));
  const rows = [...el.children]
    .filter((row) => !(row.children.length === 2 && props.has(cellKey(row.children[0]))))
    .map((row) => ({
      el: row,
      cells: [...row.children].map((cell) => ({
        el: cell,
        parts: [...cell.children].map(partOf),
      })),
    }));
  // one shape: the same number of cells, each starting with the same kind of part (an empty
  // cell fits any: a news card without an image is still a card)
  const first = (cell) => cell.parts[0]?.kind || '';
  const same = (x, y) => !first(x) || !first(y) || first(x) === first(y);
  const fits = (a, b) => a.cells.length === b.cells.length
    && a.cells.every((cell, i) => same(cell, b.cells[i]));
  const list = forceList || (rows.length > 1 && rows.every((r) => rows.every((o) => fits(r, o))));
  return { rows, list };
}

/* ---- reading a part's values -------------------------------------------- */

export const textOf = (el) => (soleTextHolder(el) || el).textContent.replace(/\s+/g, ' ').trim();

export function imageValues(el) {
  const img = imageOf(el);
  // alt is null when the image has none (not the same as '' for a decorative image)
  return { src: img?.getAttribute('src') || '', alt: img ? img.getAttribute('alt') : null };
}

export function buttonValues(el) {
  const a = buttonLink(el);
  const label = withoutOptions(a.textContent).replace(/\s+/g, ' ').trim();
  return { label, href: a.getAttribute('href') || '' };
}

export const listValues = (el) => [...el.children].map((li) => textOf(li));

export const headingLevel = (el) => Number(el.tagName[1]);

/* ---- checking author input ------------------------------------------------- */

/** A link authors may set: site paths, anchors, http(s), mailto, tel; '' for anything else. */
export function safeLink(value) {
  const v = String(value).trim();
  return /^(?:https?:\/\/|mailto:|tel:|\/|#|\.{1,2}\/)/i.test(v) && !/\s/.test(v) ? v : '';
}

/** An image address: https only (or this site's path); '' for anything else. */
export function safeImage(value) {
  const v = String(value).trim();
  return /^(?:https:\/\/|\/)/i.test(v) && !/\s/.test(v) ? v : '';
}

/* ---- changing a part -------------------------------------------------------- */

/** Sets the text of a heading, paragraph or list item, keeping its wrapping marks. */
export function setText(el, text) {
  (soleTextHolder(el) || el).textContent = text;
}

/** A heading of another level, with the same content. */
export function setLevel(el, level) {
  const next = el.ownerDocument.createElement(`h${level}`);
  next.append(...el.childNodes);
  el.replaceWith(next);
  return next;
}

/** The button's label (its `[options]` and marks kept) and link. */
export function setButton(el, { label, href }) {
  const a = buttonLink(el);
  if (label !== undefined) {
    const suffix = optionsSuffix(a.textContent)?.suffix || '';
    setText(a, `${label}${suffix}`);
  }
  if (href !== undefined) a.setAttribute('href', href);
}

/**
 * A new image address replaces the picture (its sources were for the old image);
 * the alt text is kept. An alt change keeps the picture as it is.
 */
export function setImage(el, { src, alt }) {
  const doc = el.ownerDocument;
  let img = imageOf(el);
  if (src !== undefined) {
    const picture = doc.createElement('picture');
    const fresh = doc.createElement('img');
    fresh.setAttribute('src', src);
    const keep = img?.getAttribute('alt');
    if (keep !== null && keep !== undefined) fresh.setAttribute('alt', keep);
    picture.append(fresh);
    const old = img?.closest('picture') || img;
    if (old && old !== el) old.replaceWith(picture);
    else if (old === el) {
      el.replaceWith(picture);
      return picture;
    } else el.append(picture);
    img = fresh;
  }
  if (alt !== undefined) img?.setAttribute('alt', alt);
  return el;
}

/** The list's items, one per line (empty lines dropped). */
export function setList(el, lines) {
  const items = lines.map((l) => l.trim()).filter(Boolean);
  const template = el.children[0];
  const lis = items.map((line) => {
    const li = template ? template.cloneNode(true) : el.ownerDocument.createElement('li');
    setText(li, line);
    return li;
  });
  el.replaceChildren(...lis);
}

/**
 * A new part at the end of a cell.
 * @param {Element} cell the cell
 * @param {string} kind heading, text, button or image
 * @param {Object} texts the starter texts (from the panel's HTML)
 */
export function addPart(cell, kind, texts) {
  const doc = cell.ownerDocument;
  let el;
  if (kind === 'heading') {
    el = doc.createElement('h2');
    el.textContent = texts.heading;
  } else if (kind === 'button') {
    el = doc.createElement('p');
    const a = doc.createElement('a');
    a.setAttribute('href', '/');
    a.textContent = texts.button;
    el.append(a);
  } else if (kind === 'image') {
    // no address yet: not sent to the page until one is set (withoutEmptyImages())
    // no alt yet: the panel asks for one (or Decorative)
    el = doc.createElement('picture');
    el.append(doc.createElement('img'));
  } else {
    el = doc.createElement('p');
    el.textContent = texts.text;
  }
  cell.append(el);
  return el;
}

/** A copy of the block without images that have no address yet (just added). */
export function withoutEmptyImages(el) {
  const copy = el.cloneNode(true);
  copy.querySelectorAll('img:not([src]), img[src=""]').forEach((img) => {
    (img.closest('picture') || img).remove();
  });
  return copy;
}

/** A new item: a copy of `row`, after `after` (the last item). */
export function addItem(row, after) {
  const copy = row.cloneNode(true);
  after.after(copy);
  return copy;
}

/** Moves an item one place up (-1) or down (1) among the content rows. */
export function moveItem(rows, index, step) {
  const other = rows[index + step];
  if (!other) return;
  const { el } = rows[index];
  if (step < 0) other.el.before(el);
  else other.el.after(el);
}
