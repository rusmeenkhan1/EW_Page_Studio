/*
 * Two-way editing for the Buttons panel: which button a selection is in, read whole
 * from DA's live document, and the writes that change it in the page.
 *
 * DA's getSelection() returns only what is highlighted (with its marks), so a highlight of one
 * word gives part of the label and none of the trailing `[…]` options. The live document
 * (subscribeLiveDocument(), prose2aem() form) holds the whole page: the highlight's link and
 * text pick the button paragraph there, inside the block holding the cursor (the live
 * selection's blockIndex) or else in the sections' default content.
 *
 * Writing: a button in default content is the top-level node at the cursor, so
 * sendHTML(p, { replace: true }) swaps it; a settings table or a paragraph holds no blockIndex,
 * so DA can't check where the cursor is, and pageWrite() checks afterwards that only that
 * button changed. A button in a block is changed by rewriting the block (the Block view's
 * buildTable()) with only that paragraph replaced, sent with DA's `expected` block check.
 */
import { parse, clean, buttonLink } from '../../shared/dom.js';
import { readBlock, buildTable } from '../block/block-doc.js';

const squash = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * What a selection says about the button it is in.
 * @param {string|null} html getSelection()
 * @returns {{href: string, text: string}|null} its link (if any) and its text; null when
 *   nothing is highlighted
 */
export function selectionHint(html) {
  if (typeof html !== 'string' || !html.trim()) return null;
  const doc = parse(html);
  const text = squash(doc.body.textContent);
  const href = doc.querySelector('a[href]')?.getAttribute('href') || '';
  return text || href ? { href, text } : null;
}

/**
 * Does a button paragraph hold the highlight (its link, and all the highlighted text)? A
 * highlight in a button's label carries its link; one without a link (plain text, or only the
 * `[…]` options) is not taken for a button, so a word that a label also has can't open it.
 */
function holds(p, hint) {
  const a = buttonLink(p);
  if (!a || !hint.href || a.getAttribute('href') !== hint.href) return false;
  return squash(p.textContent).includes(hint.text);
}

/** @returns {Element[]} the default content of the live document, section after section */
const pageNodes = (doc) => [...doc.querySelectorAll('main > div > *')];

/** @returns {Element[]} the button paragraphs of a block, in document order */
const blockButtons = (el) => [...el.querySelectorAll('p')].filter((p) => buttonLink(p));

/**
 * The button a highlight is in.
 * @param {string} liveHtml the live document
 * @param {number|null} blockIndex the block holding the cursor
 * @param {{href: string, text: string}} hint selectionHint()
 * @returns {Object|null} null: in no button. `{ ambiguous: true }`: several different buttons
 *   (or, in a block, two alike) hold it. Else `{ scope: 'page', positions, html }` (the
 *   button's index among the page nodes; several when identical buttons hold it) or
 *   `{ scope: 'block', blockIndex, position, html }` (its index among the block's buttons);
 *   `html` is the whole paragraph, without the live document's instrumentation.
 */
export function findButton(liveHtml, blockIndex, hint) {
  if (!liveHtml || !hint) return null;
  if (Number.isInteger(blockIndex)) {
    const block = readBlock(liveHtml, blockIndex);
    if (!block) return null;
    const buttons = blockButtons(block.el);
    const at = buttons.map((p, i) => (holds(p, hint) ? i : -1)).filter((i) => i >= 0);
    if (!at.length) return null;
    // two buttons in one block hold it: which one to change can't be told
    if (at.length > 1) return { ambiguous: true };
    return {
      scope: 'block', blockIndex, position: at[0], html: clean(buttons[at[0]]),
    };
  }
  const nodes = pageNodes(parse(liveHtml));
  const at = nodes.map((el, i) => (holds(el, hint) ? i : -1)).filter((i) => i >= 0);
  if (!at.length) return null;
  const html = clean(nodes[at[0]]);
  // identical buttons are the same button to edit: the write replaces the one at the cursor
  if (at.some((i) => clean(nodes[i]) !== html)) return { ambiguous: true };
  return { scope: 'page', positions: at, html };
}

/**
 * The edited button as it is now in a live document (the author may have typed in it).
 * @returns {string|null} its paragraph HTML, or null when it is no longer there
 */
export function currentButton(liveHtml, editing) {
  if (editing.scope === 'block') {
    const block = readBlock(liveHtml, editing.blockIndex);
    const p = block && blockButtons(block.el)[editing.position];
    return p ? clean(p) : null;
  }
  const nodes = pageNodes(parse(liveHtml));
  const p = editing.positions.map((i) => nodes[i]).find((el) => el && buttonLink(el));
  return p ? clean(p) : null;
}

/**
 * The block table that changes one of its buttons.
 * @param {string} html the new button paragraph (buildHtml() in button.js, escaped text)
 * @returns {string|null} the table to send with `expected`, or null when the block or the
 *   button isn't there any more
 */
export function blockWrite(liveHtml, editing, html) {
  const block = readBlock(liveHtml, editing.blockIndex);
  const p = block && blockButtons(block.el)[editing.position];
  if (!p) return null;
  // our own markup (every text escaped), read with DOMParser: inert, nothing in it runs or loads
  const next = parse(html).body.firstElementChild;
  if (!next) return null;
  p.replaceWith(p.ownerDocument.importNode(next, true));
  return buildTable(block, block.variants, []);
}

/**
 * Did a replace at the cursor change only the edited button?
 * @param {number[]} positions where the button may be (identical buttons: any of them)
 * @returns {{ok: boolean, position: number|null}} the button's index after the write (null:
 *   nothing changed, as when the button already looked like that)
 */
export function pageWrite(beforeHtml, afterHtml, positions) {
  const before = pageNodes(parse(beforeHtml));
  const after = pageNodes(parse(afterHtml));
  if (before.length !== after.length) return { ok: false, position: null };
  const changed = before.map((el, i) => (clean(el) === clean(after[i]) ? -1 : i))
    .filter((i) => i >= 0);
  if (!changed.length) return { ok: true, position: null };
  const [at] = changed;
  const ok = changed.length === 1 && positions.includes(at) && Boolean(buttonLink(after[at]));
  return { ok, position: ok ? at : null };
}

/** The page's default content as comparable HTML (to check a put-back gave the page back). */
export const pageContent = (html) => pageNodes(parse(html)).map(clean).join('\n');
