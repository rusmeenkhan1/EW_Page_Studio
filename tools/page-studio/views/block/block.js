/*
 * Page Studio — the Block view (also a DA panel on its own)
 * (Experience Workspace) to style blocks: choose a block, pick its style, options,
 * visibility and properties; the page itself shows the result. With the cursor
 * in a block (DA's live selection names it), the panel styles that block and each pick
 * changes the page at once (sendHTML replace with DA's "page unchanged" check). With the
 * cursor on an empty line, choosing a block places it there as a trial block (a replace of
 * that line keeps the cursor in the new block), its content taken from the block's library
 * example; every pick then changes it, Add block ends the trial and Cancel puts the empty line
 * back. Without DA's live document and replace, the panel inserts the block instead.
 *
 * Everything comes from the DA sheet /.da/library/blocks:
 *   data tab     the blocks: entries whose path names a block of this site's code
 *                (/blocks/<name>/<name>.js answers), e.g. Cards → cards
 *   options tab  rows whose `blocks` column lists the block, one row in the panel each:
 *     type `variant`   one choice (chips, with Default), a class: `News=news | …`
 *     type `variants`  several choices (checkboxes), classes that combine (e.g. the
 *                      Visibility row: hide-mobile / hide-tablet / hide-desktop)
 *     any other row    a property: a `key | value` row in the block (values all
 *                      `name=#hex` → swatches; values → a dropdown, or checkboxes with
 *                      type `multi`; one value or none → a text field, the one value
 *                      as its placeholder)
 *   an optional `description` column (`value=text | …`) shows as each choice's tooltip
 *   an optional `when` column shows the row (`profile`) or each choice (`tall=text-up |
 *   no-image=banner`) only while one of those styles is picked (e.g. Cards › With bio only
 *   for Profile; Hero › Tall only for Article hero)
 * A property row is only for blocks whose code reads it: most blocks render any row.
 *
 *   type `content`   no field: names for the Content area (`item=Card | image=Photo | …`)
 *
 * Placing replaces the line the cursor is on, and DA tells a panel only which block holds
 * the cursor, not which line. So placeTrial() compares the page before and after: content
 * that went (a paragraph, a heading) is put back at once; section settings or the page's
 * Metadata table (read from the saved source, the live document leaves it out) ask for Undo.
 *
 * Under the settings, the Content area (content-form.js) shows the block's images,
 * headings, texts, buttons and lists as fields, read from the block itself; items (cards,
 * quote lines…) can be added, removed and moved. It edits a working copy of the block
 * (state.content), which the page and an insert take.
 */
import {
  readBlock, pickExample, emptyBlock, buildTable, contentSignature, replacedNode, addedBlock,
} from './block-doc.js';
import { withoutEmptyImages, safeImage } from './block-content.js';
// the live document holds a section's settings as its attributes (shared with the Section view)
import { readDocument, sectionSettings, changedSections } from '../section/live-doc.js';
import renderContent from './content-form.js';
import {
  DA_CONTENT, DA_SOURCE, NO_STALE, timeout, connect, canEditLive, trackCursor, sourceUrl,
  readSheet, savedSource, watchSaved, liveWaiter, onLiveDocument, registerView, notifyChange,
  isEmbedded, hasCommand, runCommand, loadConfig, codeOrigin,
} from '../../shared/da.js';
import {
  normalizeRow, parseValues, parseDescriptions, parseWhen,
} from '../../shared/sheet.js';
import { HEX_COLOR, colourName } from '../../shared/colour.js';
import {
  toClassName, metadataCount, settingsTable, buttonLink,
} from '../../shared/dom.js';
import { messenger, settingsCard, swatchButton } from '../../shared/ui.js';

const PICK_MS = 350; // a pick changes the page after this pause
const TYPE_MS = 800; // typing changes the page after this pause

const $ = (selector) => document.querySelector(selector);
const status = $('.ss-plugin-status');
const form = $('#bs-form');
const blockSelect = $('#bs-block');
const current = $('.bs-current');
const fieldsEl = $('.bs-fields');
const emptyNote = $('.bs-empty');
const liveNote = $('.bs-live-note');
const keptNote = $('.bs-kept');
const trialBox = $('.bs-trial');
const message = $('.ss-plugin-message');
const submit = $('.ss-plugin-submit');
const contentRoot = $('.bs-content');
const modeBadge = $('.bs-mode');
const startNote = $('.bs-start');

/** The settings cards and help texts (`.bs-layout` JSON in block.html). */
const LAYOUT = (() => {
  try {
    return JSON.parse($('.bs-layout')?.textContent || '{}');
  } catch {
    return {};
  }
})();
const HELP = Object.fromEntries(Object.entries(LAYOUT.help || {})
  .map(([k, v]) => [k.toLowerCase(), v]));

const state = {
  actions: null,
  context: null,
  token: '', // the author's DA token (from the SDK), to fetch DA images for thumbnails
  settings: {}, // the customer's configuration (loadConfig())
  canEdit: false, // DA offers the live document and replace (Experience Workspace)
  blocks: [], // [{ name, label }]: this site's blocks, in sheet order
  fields: {}, // block name → its fields
  liveHtml: '',
  blockIndex: null,
  editing: null, // { index, block }: the page block being styled
  trial: false, // the block being styled was just placed by the panel (Add block / Cancel)
  // the block just added (its blockIndex): the panel shows the selector though the cursor is
  // still in it, until the cursor's block changes
  added: null,
  addCount: 0, // blocks added (Add block, Insert): Page Studio goes home after each
  kept: [], // its variant classes the sheet doesn't list (kept as they are)
  timer: null,
  applying: false,
  again: false, // a pick came in while applying
  busy: null, // 'adding' while inserting, 'placing' / 'removing' a trial block
  examples: {}, // block name → its library document (DA source), for inserts
  images: {}, // DA image URL → Promise of a blob: copy ('' when it can't be fetched)
  names: {}, // block name → the sheet's names for its Content area
  content: null, // { name, el, touched }: the working copy of the block's content
};
const liveFeed = liveWaiter(); // waits for the next live document

const TONES = {
  applying: 'info',
  placing: 'info',
  applied: 'success',
  done: 'success',
  placed: 'info',
  kept: 'success',
  removed: 'success',
  left: 'info',
  moved: 'warning',
  stale: 'warning',
  restored: 'warning',
  'settings-restored': 'warning',
  'not-inside': 'warning',
  'in-block': 'warning',
};

/** @param {string|null} key a data-* message: loading, standalone, missing go above the form */
const say = messenger({
  status, message, tones: TONES, fallback: 'error',
});

const toId = (text) => `bs-${toClassName(text)}`;

/* ---- sheet ------------------------------------------------------------ */

/** One field per options row of a block (see the header comment). */
function parseField(row) {
  const type = row.type.toLowerCase();
  const choices = parseValues(row.values || '');
  let kind = 'text';
  if (type === 'variant') kind = 'variant';
  else if (type === 'variants') kind = 'variants';
  else if (choices.length && choices.every((c) => HEX_COLOR.test(c.value))) kind = 'swatch';
  // one value is an example (`Type any height (e.g. 40px)=40px`): a text field showing it
  else if (choices.length > 1) kind = type === 'multi' ? 'multi' : 'select';
  if (kind === 'variant' || kind === 'variants') {
    choices.forEach((c) => { c.value = toClassName(c.value); });
  }
  return {
    key: row.key,
    label: row.label || row.key.charAt(0).toUpperCase() + row.key.slice(1),
    kind,
    choices,
    id: toId(`${row.key}-${kind}`),
    placeholder: kind === 'text' && choices.length === 1 ? choices[0].label : '',
    descriptions: parseDescriptions(row.description || ''),
    // an optional `when` column: the row (`profile`) or a choice (`tall=text-up`) only shows,
    // and only counts, while one of those styles is picked (keyed by class name)
    when: parseWhen(row.when || '', toClassName),
  };
}

/** Is `/blocks/<name>/<name>.js` part of this site's code (the branch the panel loads from)? */
/**
 * Does the customer's code have the block (`/blocks/<name>/<name>.js`)? `check-blocks`: `yes`
 * asks the customer code (it must allow this origin, CORS), `no` trusts the sheet, `auto` (the
 * default) asks only when Page Studio is served by the customer's own site (no CORS needed) and
 * trusts the sheet otherwise.
 */
async function isBlock(name) {
  const mode = state.settings['check-blocks'];
  const origin = codeOrigin(state.context, state.settings);
  const sameSite = origin === window.location.origin;
  if (mode === 'no' || (mode !== 'yes' && !sameSite)) return true;
  try {
    const resp = await fetch(`${origin}/blocks/${name}/${name}.js`, { method: 'HEAD' });
    return resp.ok;
  } catch {
    return mode !== 'yes' || !sameSite; // another origin that doesn't allow it: trust the sheet
  }
}

/**
 * A block's library document, as a DA source path: from the sheet row's `path` (a DA content
 * address, or a site path), else next to the sheet (`<folder>/blocks/<name>.html`).
 */
function examplePath(row, name) {
  const { org, repo } = state.context;
  const raw = String(row.path || '').trim();
  let path = '';
  try {
    const url = new URL(raw, 'https://content.da.live/');
    const prefix = `/${org}/${repo}/`;
    path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length - 1) : url.pathname;
  } catch { /* not an address */ }
  if (!/^\/[\w./-]+$/.test(path) || path.includes('..')) {
    const folder = state.settings['library-sheet'].replace(/\/[^/]*$/, '');
    path = `${folder}/blocks/${name}`;
  }
  return path.endsWith('.html') ? path : `${path}.html`;
}

async function loadSheet() {
  const { context, actions } = state;
  const json = await readSheet(actions, context, state.settings['library-sheet'], NO_STALE);
  if (!json) return;
  try {
    const entries = (json?.data?.data || []).map(normalizeRow)
      .map((row) => {
        const name = toClassName(String(row.path || '').split('/').pop() || '');
        return { label: row.name, name, example: name ? examplePath(row, name) : '' };
      })
      .filter((b) => b.name);
    const known = await Promise.all(entries.map((b) => isBlock(b.name)));
    state.blocks = entries.filter((b, i) => known[i]);
    const rows = (json?.options?.data || []).map(normalizeRow).filter((row) => row.key);
    const isContent = (row) => row.type.toLowerCase() === 'content';
    state.blocks.forEach(({ name }) => {
      const own = rows.filter((row) => row.blocks.split(',').some((b) => toClassName(b) === name));
      state.fields[name] = own.filter((row) => !isContent(row)).map(parseField);
      state.names[name] = Object.fromEntries(own.filter(isContent)
        .flatMap((row) => parseValues(row.values || ''))
        // keys as written, lower case: `item`, `row-image`, `profile/text`, `text-2`, `column1`
        .map(({ label, value }) => [label.toLowerCase().replace(/\s+/g, ''), value]));
    });
  } catch { /* no sheet: the panel says so */ }
}

/** The block's library document (DA source), for an insert's starter content. */
function loadExample(name) {
  if (state.examples[name] === undefined) {
    const { context, actions } = state;
    const block = state.blocks.find((b) => b.name === name);
    const path = block?.example || examplePath({}, name);
    state.examples[name] = actions.daFetch(sourceUrl(context, path), NO_STALE)
      .then((resp) => (resp.ok ? resp.text() : ''))
      .catch(() => '');
  }
  return state.examples[name];
}

/**
 * A blob: copy of a DA image the panel can't load by itself (DA content needs a login), for
 * a Content thumbnail. Fetched with the author's token, not daFetch(): an image of another
 * DA org would make daFetch() open DA's sign-in. '' when it can't be fetched.
 */
function imageCopy(url) {
  if (!state.images[url]) {
    state.images[url] = (state.token
      ? fetch(url, { headers: { Authorization: `Bearer ${state.token}` } })
        .then((resp) => (resp.ok ? resp.blob() : null))
        // kept for the panel's life, then revoked on pagehide (below): one copy per image
        // eslint-disable-next-line browser-security/require-blob-url-revocation
        .then((blob) => (blob?.type.startsWith('image/') ? URL.createObjectURL(blob) : ''))
        .catch(() => '')
      : Promise.resolve(''));
  }
  return state.images[url];
}

// the blob: copies live as long as the panel; they go when it closes
window.addEventListener('pagehide', () => {
  Object.values(state.images).forEach((copy) => copy.then((href) => {
    if (href) URL.revokeObjectURL(href);
  }));
});

/* ---- fields ----------------------------------------------------------- */

const blockLabel = (name) => state.blocks.find((b) => b.name === name)?.label
  || name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

const blockFields = () => state.fields[blockSelect.value] || [];

const isClass = (field) => field.kind === 'variant' || field.kind === 'variants';

const conditional = (field) => field.when.row.length > 0
  || Object.keys(field.when.choice).length > 0;

/**
 * The form's values per field, and what counts: a `when` row or choice only while one of its
 * styles is picked in a row without `when`. Hidden, its ticks and text are kept for when the
 * style comes back, but it adds nothing to the block (a hidden property's row is removed).
 * @returns {{field: object, values: string[], shown: boolean, allows: function}[]}
 */
function fieldValues() {
  const data = new FormData(form);
  const all = blockFields().map((field) => ({
    field, values: data.getAll(field.id).map((v) => String(v).trim()).filter(Boolean),
  }));
  const on = new Set(all.filter(({ field }) => isClass(field) && !conditional(field))
    .flatMap(({ values }) => values));
  const met = (styles) => !styles?.length || styles.some((v) => on.has(v));
  return all.map(({ field, values }) => {
    const allows = (value) => met(field.when.choice[toClassName(value)]);
    const perChoice = Object.keys(field.when.choice).length > 0;
    const shown = met(field.when.row) && (!perChoice || field.choices.some((c) => allows(c.value)));
    return {
      field, values: shown ? values.filter(allows) : [], shown, allows,
    };
  });
}

/** @returns {{variants: string[], props: {key: string, value: string}[]}} what the form says */
function readFields() {
  const variants = [];
  const props = [];
  fieldValues().forEach(({ field, values }) => {
    if (isClass(field)) variants.push(...values);
    else props.push({ key: field.key, value: values.join(', ') });
  });
  return { variants: [...variants, ...state.kept], props };
}

/** What one settings row is set to, in the author's words ('' for Default / not set). */
function rowSummary(row) {
  const control = row.querySelector('.bs-row-control');
  const picked = [...control.querySelectorAll('input:checked')]
    .filter((input) => input.value && !input.closest('label')?.hidden)
    .map((input) => input.closest('label').textContent.trim());
  if (picked.length) return picked.join(', ');
  const swatch = control
    .querySelector('.ss-plugin-swatch[aria-pressed="true"]:not(.ss-plugin-swatch-none)');
  if (swatch) return swatch.textContent.trim();
  const select = control.querySelector('select');
  if (select?.value) return select.selectedOptions[0].textContent;
  return control.querySelector('input[type="text"]')?.value.trim() || '';
}

/** "Banner, Medium height", "Space above: Large": each card's title line says what is picked. */
function updateSummaries() {
  fieldsEl.querySelectorAll('.ss-plugin-section').forEach((card) => {
    const rows = [...card.querySelectorAll('.bs-row:not([hidden])')];
    const named = rows.length > 1 && !card.dataset.plain;
    card.querySelector('.ss-plugin-section-sum').textContent = rows.map((row) => {
      const value = rowSummary(row);
      return value && named ? `${row.querySelector('.bs-row-label').textContent}: ${value}` : value;
    }).filter(Boolean).join(' · ') || form.dataset.default;
  });
}

/** Hides the `when` rows and choices whose styles aren't picked. */
function showWhen() {
  fieldValues().forEach(({ field, shown, allows }) => {
    const row = fieldsEl.querySelector(`.bs-row[data-field="${field.id}"]`);
    if (!row) return;
    row.hidden = !shown;
    row.querySelectorAll(`[name="${field.id}"]`).forEach((input) => {
      const label = input.closest('label');
      if (label) label.hidden = !allows(input.value);
    });
    row.querySelectorAll('option').forEach((option) => { option.hidden = !allows(option.value); });
  });
  // a card whose every row waits for a style has nothing to show
  fieldsEl.querySelectorAll('.ss-plugin-section').forEach((card) => {
    card.hidden = !card.querySelector('.bs-row:not([hidden])');
  });
  updateSummaries();
}

/** `block` with the Content area's copy as its rows (images without an address left out). */
function withContent(block) {
  if (!state.content || state.content.name !== block.name) return block;
  return { ...block, el: withoutEmptyImages(state.content.el) };
}

/** Same content? (the rows as the table would carry them) */
const sameContent = (a, b) => buildTable(a, [], []) === buildTable(b, [], []);

/** A labelled choice: a radio chip (style) or a checkbox (options, visibility, multi). */
function choice(field, item, type) {
  const label = document.createElement('label');
  label.className = type === 'radio' ? 'bs-chip' : 'bs-check';
  const input = document.createElement('input');
  input.type = type;
  input.name = field.id;
  input.value = item.value;
  const text = document.createElement('span');
  text.className = type === 'radio' ? 'bs-chip-text' : 'bs-check-text';
  text.textContent = item.label;
  label.append(input, text);
  const description = field.descriptions[item.value];
  if (description) label.title = description;
  return label;
}

/** None and each colour as round swatches; the hidden input holds the picked name. */
function swatches(field, wrap) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = field.id;
  const list = document.createElement('div');
  list.className = 'ss-plugin-swatches';
  const markPicked = () => list.querySelectorAll('.ss-plugin-swatch')
    .forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.value === input.value)));
  const pick = (value) => {
    input.value = value;
    markPicked();
    input.dispatchEvent(new CustomEvent('input', { bubbles: true, detail: { byAuthor: true } }));
  };
  [{ label: form.dataset.none, value: '', none: true }, ...field.choices].forEach((c) => {
    const swatch = c.none ? swatchButton('ss-plugin-swatch-none', c.label)
      : swatchButton('', colourName(c.label), c.value);
    // a colour inserts its name (a site token, e.g. sage-grey-bg); its hex only paints the chip
    swatch.dataset.value = c.none ? '' : c.label;
    swatch.addEventListener('click', () => pick(swatch.dataset.value));
    list.append(swatch);
  });
  input.setValue = (value) => {
    // an existing value may be the name or the hex
    const match = field.choices
      .find((c) => [c.label, c.value].some((v) => v.toLowerCase() === value.toLowerCase()));
    input.value = match ? match.label : value;
    markPicked();
  };
  input.setValue('');
  wrap.append(list, input);
}

/** Style chips (one style, with Default) or checkboxes (options, visibility, multi). */
function choiceList(field) {
  const radio = field.kind === 'variant';
  const list = document.createElement('div');
  list.className = radio ? 'bs-chips' : 'bs-checks';
  const items = radio ? [{ label: form.dataset.default, value: '' }, ...field.choices] : field.choices;
  list.append(...items.map((item) => choice(field, item, radio ? 'radio' : 'checkbox')));
  if (radio) list.querySelector('input').checked = true;
  return list;
}

/** A dropdown (several values) or a text field (one value or none: its example). */
function inputControl(field) {
  const select = field.kind === 'select';
  const input = document.createElement(select ? 'select' : 'input');
  if (select) {
    input.append(new Option(form.dataset.none, ''));
    field.choices.forEach((c) => input.append(new Option(c.label, c.value)));
  } else {
    input.type = 'text';
    input.placeholder = field.placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
  }
  input.id = field.id;
  input.name = field.id;
  return input;
}

/** What the setting does: the sheet's own text for the row, else the panel's (layout JSON). */
function rowHelp(field) {
  const text = field.descriptions['*'] || HELP[field.key.toLowerCase()];
  if (!text) return null;
  const help = document.createElement('p');
  help.className = 'bs-row-help';
  help.id = `${field.id}-help`;
  help.textContent = text;
  return help;
}

const CHOICE_KINDS = ['variant', 'variants', 'multi'];

/** One row: the setting's name, then its control. */
function renderField(field) {
  const grouped = field.kind !== 'select' && field.kind !== 'text';
  const row = document.createElement(grouped ? 'fieldset' : 'div');
  row.className = 'bs-row';
  row.dataset.kind = field.kind;
  row.dataset.field = field.id;
  const title = document.createElement(grouped ? 'legend' : 'label');
  title.className = 'bs-row-label';
  title.textContent = field.label;
  const control = document.createElement('div');
  control.className = 'bs-row-control';
  if (CHOICE_KINDS.includes(field.kind)) {
    control.append(choiceList(field));
  } else if (field.kind === 'swatch') {
    swatches(field, control);
  } else {
    title.htmlFor = field.id;
    control.append(inputControl(field));
  }
  row.append(title);
  const help = rowHelp(field);
  if (help) {
    (grouped ? row : control.querySelector('input, select')).setAttribute('aria-describedby', help.id);
    row.append(help);
  }
  row.append(control);
  return row;
}

/** One settings card: its title, a line saying what is picked (updateSummaries()), its rows. */
function groupCard(group, fields) {
  const { card, body } = settingsCard(group.label);
  // style rows read well without their names ("Banner, Medium height")
  if (group.classes) card.dataset.plain = 'true';
  const rows = fields.map(renderField);
  // a card's only row of the same name (Visibility): the title says it (kept for screen readers)
  const only = rows.length === 1 ? rows[0].querySelector('.bs-row-label') : null;
  if (only && only.textContent.trim().toLowerCase() === group.label.toLowerCase()) {
    only.classList.add('ss-plugin-visually-hidden');
  }
  body.append(...rows);
  return card;
}

/**
 * The fields in the layout JSON's groups: by sheet key, else style and option rows in the
 * `classes` group and properties in the `properties` group; anything left in a last card.
 */
function groupCards(fields) {
  const groups = (LAYOUT.groups || []).map((g) => ({
    ...g, keys: (g.keys || []).map((k) => k.toLowerCase()), fields: [],
  }));
  const rest = [];
  fields.forEach((field) => {
    const key = field.key.toLowerCase();
    const home = groups.find((g) => g.keys.includes(key))
      || groups.find((g) => (isClass(field) ? g.classes : g.properties));
    (home ? home.fields : rest).push(field);
  });
  if (rest.length) groups.push({ label: form.dataset.other, fields: rest });
  return groups.filter((g) => g.fields.length).map((g) => groupCard(g, g.fields));
}

/** Shows the chosen block's settings. */
function renderFields() {
  const fields = blockFields();
  fieldsEl.replaceChildren(...groupCards(fields));
  emptyNote.hidden = !blockSelect.value || fields.length > 0;
  startNote.hidden = Boolean(blockSelect.value || state.editing);
  showWhen();
}

const sameText = (a, b) => a.toLowerCase() === b.toLowerCase();

/** A style or options row: its boxes ticked from the block's classes (Default when none). */
function fillClasses(field, inputs, block) {
  inputs.forEach((input) => {
    input.checked = input.value ? block.variants.includes(input.value) : false;
  });
  if (field.kind === 'variant' && !inputs.some((i) => i.checked)) inputs[0].checked = true;
}

/** Checkboxes from `a, b`; a value the sheet doesn't list stays, as a choice of its own. */
function fillMulti(field, inputs, value) {
  const picked = value.split(',').map((v) => v.trim()).filter(Boolean);
  inputs.forEach((input) => { input.checked = picked.some((v) => sameText(v, input.value)); });
  const list = fieldsEl.querySelector(`.bs-row[data-field="${field.id}"] .bs-checks`);
  picked.filter((v) => !inputs.some((input) => sameText(v, input.value))).forEach((v) => {
    const extra = choice(field, { label: v, value: v }, 'checkbox');
    extra.querySelector('input').checked = true;
    list?.append(extra);
  });
}

/** A dropdown's value; one the sheet doesn't list is added, so it is kept. */
function fillSelect(select, value) {
  const known = [...select.options].find((o) => sameText(o.value, value));
  if (!known && value) select.append(new Option(value, value));
  select.value = known ? known.value : value;
}

/** Sets the fields from a block's classes and rows; returns its classes the sheet lacks. */
function fillFields(block) {
  const listed = new Set();
  blockFields().forEach((field) => {
    const inputs = [...form.elements].filter((el) => el.name === field.id);
    if (isClass(field)) {
      field.choices.forEach((c) => listed.add(c.value));
      fillClasses(field, inputs, block);
      return;
    }
    const row = block.rows.find(([key]) => toClassName(key) === toClassName(field.key));
    const value = row ? row[1] : '';
    if (field.kind === 'multi') fillMulti(field, inputs, value);
    else if (field.kind === 'swatch') inputs[0].setValue(value);
    else if (field.kind === 'select') fillSelect(inputs[0], value);
    else inputs[0].value = value;
  });
  showWhen();
  return block.variants.filter((v) => !listed.has(v));
}

/** @returns {Promise<string|null>} the next live document other than `html`, or null after `ms` */
const nextLive = (html, ms) => liveFeed.next(html, ms);

const APPLY_ERRORS = {
  WRONG_SELECTION: 'moved', STALE_LIVE: 'stale', READ_ONLY: 'read-only', TIMEOUT: 'timeout',
};

/**
 * DA refused the write because the author typed in the page meanwhile (`STALE_LIVE`): take that
 * newer live document (already here, or the next one) and say whether to send again.
 * @param {boolean} panelEdits the panel's Content area had changes in that write
 */
async function takeNewerPage(editing, sent, panelEdits) {
  const next = state.liveHtml !== sent ? state.liveHtml : await nextLive(state.liveHtml, 1500);
  const block = next && readBlock(next, editing.index);
  if (!block || state.editing !== editing) return false;
  state.liveHtml = next;
  editing.block = block;
  // typed in the page and nothing changed in the panel's Content area: keep the typing
  // eslint-disable-next-line no-use-before-define
  if (!panelEdits && !state.content?.edited) setContent(block, true);
  return true;
}

/** After a write: the page as DA answered it, and the message. */
function applied(result, editing) {
  if (!result?.ok) {
    say(APPLY_ERRORS[result?.error] || 'apply-failed');
    return;
  }
  state.liveHtml = result.html || state.liveHtml;
  const block = readBlock(state.liveHtml, editing.index);
  if (block) editing.block = block;
  say('applied');
}

/** Replaces the block at the cursor with the form's style, options and properties. */
async function apply() {
  state.timer = null;
  if (!state.editing) return;
  if (state.applying) {
    state.again = true;
    return;
  }
  state.applying = true;
  say('applying');
  const { editing } = state;
  // the panel's own content edits go with this write; any made from now on go with the next
  const panelEdits = Boolean(state.content?.edited);
  if (state.content) state.content.edited = false;
  let sent = '';
  const send = () => {
    sent = state.liveHtml;
    return state.actions.sendHTML(
      buildTable(withContent(editing.block), ...Object.values(readFields())),
      { replace: true, expected: { html: sent, blockIndex: editing.index } },
    );
  };
  try {
    let result = await send();
    if (result?.error === 'STALE_LIVE' && await takeNewerPage(editing, sent, panelEdits)) {
      result = await send();
    }
    applied(result, editing);
  } catch {
    say('apply-failed');
  } finally {
    state.applying = false;
    if (state.again) {
      state.again = false;
      apply();
    } else {
      // eslint-disable-next-line no-use-before-define -- the cursor moved while applying
      followCursor();
    }
  }
}

/** A change in the form: in edit mode it reaches the page after a short pause. */
function scheduleApply(typing) {
  if (!state.editing) return;
  clearTimeout(state.timer);
  state.timer = setTimeout(apply, typing ? TYPE_MS : PICK_MS);
}

/* ---- content ----------------------------------------------------------- */

/** The block's property keys: their rows are settings, not content. */
const propKeys = (name) => (state.fields[name] || [])
  .filter((f) => f.kind !== 'variant' && f.kind !== 'variants').map((f) => f.key);

/** An image address the panel can show: a blob: copy of a DA image, else the address. */
function thumbnail(src) {
  if (src.startsWith(DA_CONTENT)) return imageCopy(src);
  return Promise.resolve(safeImage(src) ? new URL(src, window.location.origin).href : '');
}

/**
 * Uploads an image next to the page, where DA puts a dragged-in image
 * (`/<folder>/.<page>/<file>`, da-live imageDrop.js), under a new name so nothing is replaced.
 * @returns {Promise<string>} its address, or '' when DA refused it
 */
async function uploadImage(file) {
  const { context, actions } = state;
  const path = context.path || '';
  const at = path.lastIndexOf('/');
  const page = path.slice(at + 1);
  if (!page) return '';
  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
  const base = toClassName(file.name.replace(/\.[^.]+$/, '')) || 'image';
  const stamp = Date.now().toString(36);
  const target = `${context.org}/${context.repo}${path.slice(0, at)}/.${page}/${base}-${stamp}${ext}`;
  const body = new FormData();
  body.append('data', file);
  const resp = await actions.daFetch(`${DA_SOURCE}${target}`, { method: 'POST', body });
  if (!resp.ok) return '';
  const json = await resp.json().catch(() => ({}));
  return safeImage(json?.source?.contentUrl || '') || `${DA_CONTENT}${target}`;
}

/**
 * Page Studio: Button style on a button of the block's content opens that
 * button in the Button view (design, colours, icon, new tab), by its place among the block's
 * button paragraphs. A change still waiting goes to the page first, so the view reads it as is.
 */
async function openButtonStyle(partEl) {
  if (!state.editing || !state.content) return;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
    await apply();
  }
  const position = [...state.content.el.querySelectorAll('p')].filter((p) => buttonLink(p))
    .indexOf(partEl);
  const opened = position >= 0 && hasCommand('button:edit')
    && runCommand('button:edit', { blockIndex: state.editing.index, position });
  if (!opened) say('button-style-failed');
}

/**
 * Button style is offered inside Page Studio (which always has the Button view; it may still
 * be loading when the content is drawn, so the click checks it), for a block on the page.
 */
const offersButtonStyle = () => isEmbedded && state.canEdit && Boolean(state.editing);

function showContent() {
  if (!state.content || state.content.name !== blockSelect.value) {
    contentRoot.hidden = true;
    return;
  }
  const { name, el } = state.content;
  renderContent(contentRoot, {
    el,
    propKeys: propKeys(name),
    names: state.names[name] || {},
    variants: readFields().variants,
    thumbnail,
    upload: uploadImage,
    buttonStyle: offersButtonStyle() ? openButtonStyle : undefined,
    onChange: ({ typing, rerender }) => {
      state.content.touched = true;
      state.content.edited = true;
      if (rerender) {
        showContent();
        contentRoot.querySelector('.bs-content-list')?.focus({ preventScroll: true });
      }
      if (!state.editing && message.dataset.tone !== 'error') say(null);
      scheduleApply(typing);
    },
  });
}

/**
 * The Content area edits a copy of `block` (the page block, or the library example).
 * @param {boolean} [touched] the author already changed it (typed in the page)
 */
function setContent(block, touched = false) {
  state.content = {
    name: block.name, el: block.el.cloneNode(true), touched, edited: false,
  };
  showContent();
}

/**
 * Adding (insert mode, or a trial block): until the author edits it, the content is the
 * library example closest to the picks, so Cards › News arrives with news cards. A trial
 * block on the page then changes to it.
 */
async function followExample() {
  const name = blockSelect.value;
  const untouched = () => !(state.content?.name === name && state.content.touched);
  const adding = () => !state.editing || state.trial;
  if (!adding() || !name || !untouched()) return;
  const { variants } = readFields();
  const example = pickExample(await loadExample(name), name, variants) || emptyBlock(name);
  if (!adding() || blockSelect.value !== name || !untouched()) return;
  if (state.content?.name === name && sameContent(state.content, example)) return;
  setContent(example);
  scheduleApply(false);
}

/* ---- modes ------------------------------------------------------------ */

/** Insert mode (cursor outside blocks), edit mode (the block at the cursor), or a trial block. */
function showMode() {
  const { editing, trial, canEdit } = state;
  const mode = (trial && 'trial') || (editing && 'edit') || 'insert';
  modeBadge.hidden = false;
  modeBadge.dataset.mode = mode;
  modeBadge.textContent = modeBadge.dataset[mode];
  // a trial block can still become another block; a page block can't
  blockSelect.hidden = Boolean(editing) && !trial;
  current.hidden = !editing || trial;
  if (editing) current.textContent = current.dataset.text.replace('{block}', blockLabel(editing.block.name));
  trialBox.hidden = !trial;
  liveNote.hidden = !editing;
  keptNote.hidden = !state.kept.length;
  keptNote.textContent = state.kept.length ? `${keptNote.dataset.label} ${state.kept.join(', ')}` : '';
  // edits apply as they are picked, and choosing a block places it: Insert is only for an
  // editor without the live document
  submit.hidden = Boolean(editing) || canEdit;
  $('.ss-plugin-reset').hidden = Boolean(editing) || canEdit;
  submit.textContent = submit.dataset[state.busy === 'adding' ? 'adding' : 'insert'];
  submit.disabled = Boolean(state.busy);
  submit.classList.toggle('ss-plugin-is-busy', Boolean(state.busy));
  fieldsEl.inert = Boolean(state.busy);
  contentRoot.inert = Boolean(state.busy);
  trialBox.inert = Boolean(state.busy);
  blockSelect.disabled = Boolean(state.busy);
  startNote.hidden = Boolean(blockSelect.value || editing);
  notifyChange();
}

// what this panel is doing, for Page Studio's choice of view
registerView('block', () => ({
  editing: Boolean(state.editing),
  trial: state.trial,
  busy: Boolean(state.busy || state.applying),
  name: state.editing?.block.name || '',
  label: state.editing ? blockLabel(state.editing.block.name) : '',
  index: state.editing?.index ?? null,
  addCount: state.addCount,
}));

/**
 * Styles the page block at the cursor: its block, style, options and properties in the form.
 * @param {boolean} [trial] the panel just placed it (Add block / Cancel, its block can change)
 */
function startEdit(index, block, trial = false) {
  clearTimeout(state.timer);
  state.timer = null;
  state.editing = { index, block };
  state.trial = trial;
  if (!state.fields[block.name]) state.fields[block.name] = [];
  if (![...blockSelect.options].some((o) => o.value === block.name)) {
    blockSelect.append(new Option(blockLabel(block.name), block.name)); // a block the sheet lacks
  }
  blockSelect.value = block.name;
  renderFields();
  state.kept = fillFields(block);
  setContent(block);
  showMode();
}

function startInsert() {
  clearTimeout(state.timer);
  state.timer = null;
  state.editing = null;
  state.trial = false;
  state.kept = [];
  state.content = null;
  blockSelect.value = '';
  renderFields();
  showContent();
  showMode();
}

/** Same block, new live document: take its new content; show its classes/rows if they changed. */
function refreshEdit(block) {
  state.editing.block = block;
  // the page's content (typed in the page) is taken, even while a pick waits, unless the
  // author is changing it in the panel's Content area
  if (!state.content?.edited && !contentRoot.contains(document.activeElement)
    && !sameContent(withContent(block), block)) {
    setContent(block, true);
  }
  if (state.timer || state.applying) return; // the author's picks win
  const now = readFields();
  const picked = new Set(now.variants);
  const rowValue = (key) => block.rows.find(([k]) => toClassName(k) === toClassName(key))?.[1] || '';
  const same = block.variants.length === picked.size && block.variants.every((v) => picked.has(v))
    && now.props.every(({ key, value }) => rowValue(key) === value);
  if (!same) state.kept = fillFields(block);
  showMode();
}

/* ---- live changes ----------------------------------------------------- */

/** Out of a block: "Your cursor is still in a block" no longer holds. */
function clearInBlockNote() {
  if (state.blockIndex === null && message.dataset.tone === TONES['in-block']
    && message.textContent === message.dataset.inBlock) say(null);
}

/**
 * The block the cursor is in, for the panel: none right after Add block while the cursor is
 * still in that block (the selector shows until it moves).
 */
function cursorBlockIndex() {
  if (state.added !== null && state.blockIndex !== state.added) state.added = null;
  return state.blockIndex === state.added ? null : state.blockIndex;
}

/**
 * The panel follows the cursor, in the Layout and the Content view alike: in a block,
 * that block's settings; anywhere else, the Block selector. While a change is on its way the
 * panel waits, and looks again as soon as it is done (a move made meanwhile isn't lost). Right
 * after Add block the cursor is still in that block, but the selector shows until the
 * cursor's block changes.
 * @param {boolean} [changed] the page changed (the block at the cursor is read again)
 */
function followCursor(changed = false) {
  if (state.busy || state.applying) return;
  clearInBlockNote();
  const index = cursorBlockIndex();
  const block = readBlock(state.liveHtml, index);
  // the cursor left a block being added: it is added, a block like any other
  const left = state.trial && state.editing?.index !== index;
  if (left) state.trial = false;
  const { editing } = state;
  if (block && editing?.index === index && editing.block.name === block.name) {
    if (changed) refreshEdit(block);
    return;
  }
  if (!block && !editing) return;
  // a pick still waiting was for the old block; an old block's result isn't this one's
  const note = (state.timer && 'moved') || (left && 'left') || null;
  if (block) startEdit(index, block);
  else startInsert();
  say(note);
}

/** The live document or selection changed (DA sends both, in either view). */
function onLive({ html, selection }) {
  const changed = html !== state.liveHtml;
  if (changed) {
    state.liveHtml = html;
    liveFeed.notify(html);
  }
  state.blockIndex = selection?.blockIndex ?? null;
  followCursor(changed);
}

/* ---- insert, and trial blocks ------------------------------------ */

const blockCount = (html) => new DOMParser().parseFromString(html, 'text/html')
  .querySelectorAll('main [data-block-index]').length;

/** Is some text highlighted in the page? (an insert or a placement would replace it) */
async function highlighted() {
  try {
    const selected = await Promise.race([state.actions.getSelection(), timeout(1000)]);
    return typeof selected === 'string' && Boolean(selected.trim());
  } catch {
    return false; // nothing highlighted
  }
}

/** The library example closest to the picks, as the table to send. */
async function exampleTable(name, variants = [], props = []) {
  const example = pickExample(await loadExample(name), name, variants) || emptyBlock(name);
  return buildTable(example, variants, props);
}

async function insert() {
  const name = blockSelect.value;
  if (!name) {
    say('pick');
    blockSelect.focus();
    return;
  }
  state.busy = 'adding';
  showMode();
  try {
    if (await highlighted()) {
      say('text-selected');
      return;
    }
    const { variants, props } = readFields();
    const own = state.content?.name === name && state.content;
    const table = own ? buildTable(withContent({ name, variants: [], el: own.el }), variants, props)
      : await exampleTable(name, variants, props);
    const before = state.liveHtml;
    const changed = state.canEdit ? nextLive(before, 3000) : Promise.resolve(null);
    const result = await state.actions.sendHTML(table);
    // an insert may answer nothing (older editors); only a refusal is a failure
    if (result?.ok === false) {
      say(APPLY_ERRORS[result.error] || 'failed');
      return;
    }
    const next = await changed;
    // inside a settings or metadata table, the block isn't counted as a block
    if (next && blockCount(next) <= blockCount(before)) {
      say('misplaced');
    } else {
      state.addCount += 1;
      startInsert();
      say('done');
    }
  } catch {
    say('failed');
  } finally {
    state.busy = null;
    showMode();
    followCursor(); // the cursor may have moved meanwhile
  }
}

const pageSource = () => savedSource(state.actions, state.context);

/** The page metadata tables in the page's saved DA source (null when it can't be read). */
async function savedMetadata() {
  const source = await pageSource();
  return source === null ? null : metadataCount(source);
}

/**
 * The live document leaves the page's Metadata table out, so a placement over it shows only
 * in the saved source, a moment later: watch it for a while after placing.
 */
async function watchMetadata(before) {
  if (!before) return;
  await watchSaved(pageSource, (source) => {
    if (metadataCount(source) >= before) return false;
    say('metadata-lost');
    return true;
  });
}

/**
 * Replaces the block at `index` (the cursor is in it) with `html`, retrying once when the
 * author typed in the page meanwhile.
 * @returns {Promise<Object>} DA's result ({ ok, html, selection } or { ok: false, error })
 */
async function replaceBlock(html, index) {
  let sent = '';
  const send = () => {
    sent = state.liveHtml;
    return state.actions.sendHTML(html, {
      replace: true, expected: { html: sent, blockIndex: index },
    });
  };
  let result = await send();
  if (!result?.ok && result?.error === 'STALE_LIVE') {
    // the newer page may be here already (it came while DA answered), else wait for it
    const next = state.liveHtml !== sent ? state.liveHtml : await nextLive(state.liveHtml, 1500);
    if (next) {
      state.liveHtml = next;
      result = await send();
    }
  }
  if (result?.ok && result.html) state.liveHtml = result.html;
  return result;
}

/**
 * The placement took the place of content (the line wasn't empty): a paragraph or heading
 * goes straight back; anything else asks the author to Undo.
 */
async function undoPlacement(before, after, index) {
  let node = Number.isInteger(index) ? replacedNode(before, after, index) : null;
  let kind = 'restored';
  if (!node && Number.isInteger(index)) {
    // a section's settings table (only its section's attributes show it): written back from
    // them, as the Section view does
    const [lost] = changedSections(before, after) || [];
    const rows = lost === undefined ? [] : sectionSettings(readDocument(before), lost);
    if (rows.length) {
      node = settingsTable(rows);
      kind = 'settings-restored';
    }
  }
  const result = node ? await replaceBlock(node, index) : null;
  if (result?.ok) {
    say(kind);
    return;
  }
  // the block stays until the author undoes it, and the cursor is in it: show it as the block
  // being styled, so the next live document (same block) keeps the warning
  const block = readBlock(state.liveHtml, index);
  if (block) {
    state.busy = null;
    startEdit(index, block);
  }
  say('replaced');
}

/**
 * Puts the chosen block on the line at the cursor as a trial block. A replace of that line
 * keeps the cursor in the new block (da-live replaceHTMLAtCursor()), so every pick after it
 * changes the block in the page.
 */
async function placeTrial(name) {
  state.busy = 'placing';
  say('placing');
  showMode();
  try {
    if (!state.liveHtml) await nextLive('', 3000);
    if (!state.liveHtml) {
      say('not-placed');
      return;
    }
    // the cursor is still in a block (e.g. the one just added): a replace would take its place
    if (Number.isInteger(state.blockIndex)) {
      say('in-block');
      return;
    }
    if (await highlighted()) {
      say('text-selected');
      return;
    }
    const before = state.liveHtml;
    const metadata = savedMetadata();
    const result = await state.actions.sendHTML(await exampleTable(name), { replace: true });
    if (!result?.ok) {
      say(APPLY_ERRORS[result?.error] || 'not-placed');
      return;
    }
    const after = result.html || (await nextLive(before, 3000)) || before;
    state.liveHtml = after;
    const index = result.selection?.blockIndex ?? addedBlock(before, after);
    // the page lost more than an empty line
    if (contentSignature(before) !== contentSignature(after, index)) {
      await undoPlacement(before, after, index);
      return;
    }
    const block = readBlock(after, index);
    if (!block) {
      say(blockCount(after) > blockCount(before) ? 'not-inside' : 'not-placed');
      return;
    }
    if (result.selection?.blockIndex !== index) {
      say('not-inside'); // on the page, but the cursor isn't in it: a click styles it
      return;
    }
    state.busy = null;
    startEdit(index, block, true);
    followExample(); // the example closest to the picks, as they change
    say('placed');
    watchMetadata(await metadata);
  } catch {
    say('not-placed');
  } finally {
    state.busy = null;
    if (!state.editing) startInsert();
    showMode();
    followCursor(); // the cursor may have moved meanwhile
  }
}

/** A trial block becomes another block (the library example of the new one). */
async function swapTrial(name) {
  const { index } = state.editing;
  state.busy = 'placing';
  say('placing');
  showMode();
  try {
    const result = await replaceBlock(await exampleTable(name), index);
    const block = result?.ok && readBlock(state.liveHtml, result.selection?.blockIndex ?? index);
    if (block) {
      state.busy = null;
      startEdit(result.selection?.blockIndex ?? index, block, true);
      followExample();
      say('placed');
    } else {
      blockSelect.value = state.editing.block.name;
      say(APPLY_ERRORS[result?.error] || 'apply-failed');
    }
  } catch {
    blockSelect.value = state.editing.block.name;
    say('apply-failed');
  } finally {
    state.busy = null;
    showMode();
    followCursor(); // the cursor may have moved meanwhile
  }
}

/** Add block: the trial block stays, and the Block selector is ready for the next one. */
async function keepTrial() {
  // a pick still waiting goes in first, and one on its way is waited for
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
    await apply();
  }
  for (let i = 0; i < 50 && (state.applying || state.busy); i += 1) {
    await timeout(100);
  }
  if (!state.trial) return; // the cursor went elsewhere meanwhile; the panel followed it
  // the selector at once, for the next block, though the cursor is still in this one
  state.added = state.editing?.index ?? null;
  state.addCount += 1; // before the reset, which tells Page Studio (notifyChange)
  startInsert();
  say('kept');
}

/** Remove: the trial block goes and the empty line it took is back. */
async function removeTrial() {
  clearTimeout(state.timer);
  state.timer = null;
  state.busy = 'removing';
  showMode();
  try {
    const result = await replaceBlock('<p></p>', state.editing.index);
    if (result?.ok) {
      state.busy = null;
      startInsert();
      say('removed');
    } else {
      say(APPLY_ERRORS[result?.error] || 'apply-failed');
    }
  } catch {
    say('apply-failed');
  } finally {
    state.busy = null;
    showMode();
    followCursor(); // the cursor may have moved meanwhile
  }
}

/* ---- events ----------------------------------------------------------- */

form.addEventListener('input', (e) => {
  if (contentRoot.contains(e.target)) return; // the Content area reports its own changes
  if (!(e.isTrusted || e.detail?.byAuthor) || e.target === blockSelect) return;
  if (!state.editing && message.dataset.tone !== 'error') say(null);
  updateSummaries(); // typed text and colour picks show on their card's title line
  scheduleApply(e.target.type === 'text');
});
form.addEventListener('change', (e) => {
  if (contentRoot.contains(e.target)) return;
  if (e.target === blockSelect) {
    const name = blockSelect.value;
    if (state.trial) {
      if (name) swapTrial(name);
      else removeTrial(); // "Choose a block…": no block
      return;
    }
    if (state.canEdit && name) {
      placeTrial(name);
      return;
    }
    // without the live document: set it up here, then Insert
    renderFields();
    state.content = null;
    showContent();
    showMode();
    followExample();
    say(null);
    return;
  }
  // radios and checkboxes report on change too; text fields wait for their pause
  if (e.target.type === 'text') return;
  showWhen(); // a style can bring its own rows (`when`)
  scheduleApply(false);
  followExample(); // adding: the example for the new style, until the content is edited
  showContent(); // a style can have its own content names (profile/text=Job title)
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state.editing && !state.busy) insert();
});
$('.ss-plugin-reset').addEventListener('click', () => {
  startInsert();
  say(null);
});
$('.bs-trial-keep').addEventListener('click', keepTrial);
$('.bs-trial-remove').addEventListener('click', removeTrial);

async function init() {
  say('loading');
  const sdk = await connect();
  if (!sdk) { say('standalone'); return; }

  const {
    context, actions, capabilities, token,
  } = sdk;
  Object.assign(state, { context, token: typeof token === 'string' ? token : '' });
  state.actions = trackCursor(actions, (index) => { state.blockIndex = index; });
  ({ settings: state.settings } = await loadConfig(actions, context));
  await loadSheet();
  if (!state.blocks.length) { say('missing'); return; }
  blockSelect.append(
    new Option(form.dataset.choose, ''),
    ...state.blocks.map((b) => new Option(b.label, b.name)),
  );

  state.canEdit = canEditLive(capabilities, actions);
  startInsert();
  form.hidden = false;
  say(null);
  if (state.canEdit) onLiveDocument(actions, onLive);
}

init();
