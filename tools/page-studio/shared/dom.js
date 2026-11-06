/*
 * Small DOM and markup helpers shared by the authoring panels' readers of DA's live document
 * (block-doc.js, live-doc.js) and their writers.
 */

// the live document's position marks: they shift with every edit, so never compared
export const INSTRUMENTATION = ['data-block-index', 'data-prose-index', 'data-image-index',
  'data-image-version', 'data-cursor-remote', 'data-cursor-remote-color'];

/** DOMParser documents are inert: nothing in them runs or loads. */
export const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

export const cellText = (cell) => (cell?.textContent || '').replace(/\s+/g, ' ').trim();

export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** `Cards (News)` → `cards-news`, as decorateBlock() names classes. */
export const toClassName = (text) => String(text).trim().toLowerCase()
  .replace(/[^0-9a-z]+/g, '-')
  .replace(/^-|-$/g, ''); // runs are one `-` by now: at most one at each end

/** The text without the given character at its end (as many as there are), in linear time. */
export function trimEnd(text, char) {
  let end = text.length;
  while (end > 0 && text[end - 1] === char) end -= 1;
  return text.slice(0, end);
}

/** An element's HTML without the live document's instrumentation. */
export function clean(el) {
  const copy = el.cloneNode(true);
  [copy, ...copy.querySelectorAll('*')].forEach((node) => INSTRUMENTATION.forEach((a) => node.removeAttribute(a)));
  return copy.outerHTML;
}

/**
 * The `[…]` options at the end of a text (after a button's label: options the site may read),
 * found from the last `[` (linear, no backtracking).
 * @returns {{start: number, suffix: string, inner: string}|null} where it starts (spaces before
 *   the `[` included), the suffix as written, and what is between the brackets
 */
export function optionsSuffix(text) {
  const end = text.trimEnd();
  if (!end.endsWith(']')) return null;
  const open = end.lastIndexOf('[');
  if (open < 0 || end.indexOf(']', open) !== end.length - 1) return null;
  let start = open;
  while (start > 0 && /\s/.test(text[start - 1])) start -= 1;
  return { start, suffix: text.slice(start), inner: end.slice(open + 1, -1) };
}

/** The text without its `[…]` options. */
export function withoutOptions(text) {
  const found = optionsSuffix(text);
  return found ? text.slice(0, found.start) : text;
}

const QUOTES = '"“”\'‘’';
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
const isKeyChar = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '-';

/** The first index from `i` whose character `skip` doesn't accept. */
function skipWhile(text, i, skip) {
  let at = i;
  while (at < text.length && skip(text[at])) at += 1;
  return at;
}

/**
 * One value from `at` (just after `=` and spaces): quoted (any quote marks, commas allowed
 * inside) or up to the next comma or space.
 * @returns {{value: string, next: number}}
 */
function readValue(text, at) {
  if (at < text.length && QUOTES.includes(text[at])) {
    const close = skipWhile(text, at + 1, (c) => !QUOTES.includes(c));
    return { value: text.slice(at + 1, close), next: close + 1 };
  }
  const end = skipWhile(text, at, (c) => c !== ',' && !isSpace(c));
  return { value: text.slice(at, end), next: end };
}

/**
 * The `key="value"` pairs of an options text (`style="x", color=#fff`), read one character at
 * a time (linear). Anything that isn't a pair is skipped, to the next comma.
 * @returns {[string, string][]} [key (lower case), value]
 */
export function parseOptionPairs(inner) {
  const pairs = [];
  let i = 0;
  while (i < inner.length) {
    i = skipWhile(inner, i, (c) => isSpace(c) || c === ',');
    const keyEnd = skipWhile(inner, i, isKeyChar);
    const eq = skipWhile(inner, keyEnd, isSpace);
    if (keyEnd > i && inner[eq] === '=') {
      const { value, next } = readValue(inner, skipWhile(inner, eq + 1, isSpace));
      pairs.push([inner.slice(i, keyEnd).toLowerCase(), value]);
      i = next;
    } else {
      i = skipWhile(inner, Math.max(i + 1, keyEnd), (c) => c !== ',');
    }
  }
  return pairs;
}

/**
 * A paragraph that is one link, maybe in marks, maybe with `[options]` after it: a button
 * (or a plain text link) as the Buttons panel writes it and the Block view's Content shows it.
 * @returns {HTMLAnchorElement|null} its link
 */
export function buttonLink(el) {
  if (el.tagName !== 'P') return null;
  const links = el.querySelectorAll('a[href]');
  if (links.length !== 1 || el.querySelector('img')) return null;
  const [a] = links;
  const rest = el.textContent.replace(a.textContent, '');
  return !rest.trim() || optionsSuffix(rest) ? a : null;
}

/** The page metadata tables in a DA source (the live document leaves them out). */
export const metadataCount = (sourceHtml) => parse(sourceHtml).querySelectorAll('div.metadata').length;

/**
 * A section's settings as the DA table to send (cells are plain, escaped text).
 * @param {[string, string][]} rows its key/value rows
 */
export function settingsTable(rows) {
  const body = rows.map(([key, value]) => `<tr><td><p>${escapeHtml(key)}</p></td><td><p>${escapeHtml(value)}</p></td></tr>`).join('');
  return `<table><tr><td colspan="2"><p>section-metadata</p></td></tr>${body}</table>`;
}
