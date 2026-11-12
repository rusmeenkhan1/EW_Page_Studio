/*
 * The panels' words. Each page's data-* messages (what a view says: statuses, footer
 * messages, labels it builds) are in its messages module (`<view>.messages.js`, a plain object:
 * element → { message: text }), not in its HTML. applyMessages() sets them on the page before the
 * view's script uses them; applySiteMessages() then sets the site's own wording from the
 * configuration's `messages` tab (`view` | `element` | `message` | `text`), so one Page Studio
 * can speak each site's words (or language) without a code change.
 *
 * An element is a CSS selector in the page as written; `selector@n` is the nth match (several
 * alike). Elements are found once, when the page loads: a later element the panel builds with the
 * same class never takes a message.
 */

const targets = new Map(); // element key → the element, as found when the page loaded

function find(key, root) {
  const at = key.lastIndexOf('@');
  if (at > 0 && /^\d+$/.test(key.slice(at + 1))) {
    return root.querySelectorAll(key.slice(0, at))[Number(key.slice(at + 1)) - 1] || null;
  }
  return root.querySelector(key);
}

/**
 * Sets a page's messages (`data-<message>` on each element).
 * @param {Object<string, Object<string, string>>} messages element → { message: text }
 */
export function applyMessages(messages, root = document) {
  Object.entries(messages).forEach(([key, texts]) => {
    const el = targets.get(key) || find(key, root);
    if (!el) return;
    targets.set(key, el);
    Object.entries(texts).forEach(([name, text]) => el.setAttribute(`data-${name}`, text));
  });
}

/**
 * The site's wording for this view, from the configuration's `messages` tab: rows whose `view`
 * is this one, for an element and message the view has (others are ignored).
 * @param {Object<string, Object[]>} tabs loadConfig()'s tabs
 * @param {string} view e.g. `block`, `button`, `section`, `check`, `page-studio`
 */
export function applySiteMessages(tabs, view) {
  (tabs?.messages || []).forEach((row) => {
    if (String(row.view || '').toLowerCase() !== view || !row.text) return;
    const el = targets.get(row.element);
    const name = String(row.message || '').trim();
    if (el && /^[a-z][a-z0-9-]*$/.test(name) && el.hasAttribute(`data-${name}`)) {
      el.setAttribute(`data-${name}`, row.text);
    }
  });
}
