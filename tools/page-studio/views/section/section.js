/*
 * Page Studio — the Section view (also a DA panel on its own): it writes a
 * `section-metadata` table into the section the cursor is in. A panel is needed because
 * Experience Workspace loads block-library items through DA's preview proxy, which removes
 * every section-metadata table, so a library item can't insert one; the SDK's sendHTML goes
 * straight into the editor and keeps it.
 *
 * The fields come from the `options` tab of the library sheet (configuration
 * `library-sheet`, default /.da/library/blocks) — every row
 * whose `blocks` column lists section-metadata:
 *   values all `name=#hex`,  → colour swatches (the sheet colours, named) + None
 *   or type `colour`/`color`     + Custom (any colour) + a colour code field;
 *                              inserts the hex (the site paints it)
 *   values + type `multi`    → a dropdown of checkboxes in groups, inserts the
 *                              values comma-separated
 *   values                   → a dropdown
 *   no values                → a text field
 * A `values` cell looks like `Center text=center | Narrow width=narrow` (a bare
 * value is its own label), as for the block-options autocomplete. How a field
 * is shown (its label, the dropdown's groups, values not offered, fields under
 * "More options") comes from the layout JSON in section.html.
 *
 * An optional `when` cell shows a field (`center`) or each choice (`map-wide=center`)
 * only while one of those values is picked; hidden, it keeps its pick but isn't sent.
 *
 * Each option shows its description as a tooltip; a field's own help shows
 * under its label. The texts come from an optional `description` cell
 * (`center=Centres the text | narrow=…`, a part without `=` is the field's
 * help), else from the defaults in section.html.
 *
 * The page is the preview, as in the Block view: with the editor's live document
 * and replace (capabilities liveDocument / sendHTMLReplace), every pick is written to the
 * page at once. On an empty line in a section, the first pick puts a settings table there
 * (a replace of that line, which keeps the cursor in the table): "New settings", then Add
 * settings or Cancel. Highlighting a value in a section's table opens its settings, and each
 * pick replaces that table (values the panel doesn't know are kept). The panel follows the
 * cursor as far as DA reports it (followCursor()).
 *
 * A settings table isn't a block, so DA can't check that the cursor is still in it (no
 * `expected` blockIndex). So every write is checked afterwards (writeTable()): only the
 * target section's settings may change. A line it replaced is put back, another section's
 * settings are rewritten as they were, a second table in the section is reported, and the
 * page Metadata table (only in the saved source) is watched. Without the live document, the
 * panel inserts a table at the cursor (Apply to section).
 */

import {
  HEX_COLOR, toLongHex, textOn, colourName,
} from '../../shared/colour.js';
import {
  NO_STALE, connect, canEditLive, trackCursor, readSheet, savedSource as readSaved, watchSaved,
  liveWaiter, onLiveDocument, onSelection, registerView, notifyChange, loadConfig, configCards,
  configHelp,
} from '../../shared/da.js';
import {
  byKey, parseValues, parseDescriptions, parseWhen,
} from '../../shared/sheet.js';
import { buildLibrary, SECTION } from '../../shared/library.js';
import { metadataCount, settingsTable } from '../../shared/dom.js';
import { messenger, settingsCard, swatchButton } from '../../shared/ui.js';
import { pauseTimer, replaceAtCursor as replaceNode } from '../../shared/write.js';
import {
  readDocument, readPageMetadata, locateSelection, sameRows, cursorBlock, sectionSettings,
  pageSignature, changedSections, removedNode, settingsTables,
} from './live-doc.js';
import messages from './section.messages.js';
import { applyMessages, applySiteMessages } from '../../shared/messages.js';

// the view's words (its messages module), on the page before anything reads them
applyMessages(messages);

const WATCH_MS = 700; // how often the panel looks at what is highlighted in the page

const $ = (selector) => document.querySelector(selector);
const status = $('.ss-plugin-status');
const message = $('.ss-plugin-message');
const form = $('.ss-plugin-form');
const fieldsEl = $('.ss-plugin-fields');
const moreBox = $('.ss-plugin-more');
const submitButton = $('.ss-plugin-submit');
const resetButton = $('.ss-plugin-reset');
const foundBox = $('.ss-plugin-found');
const editingBox = $('.ss-plugin-editing');
const blockedBox = $('.ss-plugin-blocked');
const modeBadge = $('.ss-plugin-mode');
const trialBox = $('.ss-plugin-trial');
const removeButton = $('.ss-plugin-remove-settings');

const state = {
  actions: null,
  fields: [],
  canEdit: false, // the editor sends the live document and can replace the table at the cursor
  live: null, // readDocument() of the latest live document
  pageMetadata: undefined, // readPageMetadata() of the page's saved source
  context: null,
  blockIndex: null,
  // the table being written: its rows (as last written or read), the values the panel can't
  // show (extras), and the sections it may be in (one, once a write has shown which)
  editing: null, // { rows, extras, sections }
  trial: false, // the panel put that table there (Add settings / Cancel)
  found: null, // { unsure } when a highlight matches several sections' settings
  busy: null, // 'adding' (Apply without the live document), 'writing', 'removing'
  again: false, // a pick came in while writing
  liveHtml: '',
  addCount: 0, // settings added (Add settings, Apply): Page Studio goes home after each
};
const liveFeed = liveWaiter(); // waits for the next live document
// a pick reaches the page after a pause (shared/write.js)
// eslint-disable-next-line no-use-before-define -- writeTable() is below, with the writes
const pause = pauseTimer(() => writeTable());

/* ---- messages --------------------------------------------------------- */

// the tone of each footer message (its text is a data-* attribute in the HTML)
const TONES = {
  done: 'success',
  cleared: 'success',
  takenOut: 'success',
  added: 'success',
  applied: 'success',
  placed: 'info',
  kept: 'success',
  removed: 'success',
  applying: 'info',
  left: 'info',
  badColour: 'error',
  failed: 'error',
  noReplace: 'error',
  readOnly: 'error',
  updateFailed: 'error',
  replaced: 'error',
  metadataLost: 'error',
  timeout: 'error',
};

/** @param {string|null} key a data-* message: loading, standalone, missing go above the form */
const say = messenger({
  status, message, tones: TONES, fallback: 'warning',
});

const toId = (text) => `ss-${text.toLowerCase().replace(/[^0-9a-z]+/g, '-').replace(/^-|-$/g, '')}`;
const lowerCase = (value) => value.trim().toLowerCase();

/* ---- sheet ------------------------------------------------------------ */

/** @returns {Object} the JSON in a <script type="application/json" class="…"> of the page */
function readJson(className) {
  try {
    return JSON.parse($(`.${className}`)?.textContent || '{}');
  } catch {
    return {};
  }
}

/**
 * The cards the fields sit in (`.ss-plugin-layout` JSON in section.html), the configuration's
 * `cards` tab instead when it has rows for the Section view.
 */
let layoutCards = null;

/**
 * @param {Object[]} rows the section-metadata rows (normalized, shared/library.js)
 * @param {Object<string, string>} help the configuration's help texts for this view, by key
 * @returns {Object[]} one field per section-metadata row
 */
function parseFields(rows, help = {}) {
  const seen = new Set();
  const defaults = byKey(readJson('ss-plugin-descriptions'));
  Object.entries(help).forEach(([key, text]) => { defaults[key] = { ...defaults[key], '*': text }; });
  const layout = readJson('ss-plugin-layout');
  const labels = byKey(layout.labels);
  const groups = byKey(layout.groups);
  const hidden = byKey(layout.hidden);
  const more = (layout.more || []).map((k) => k.toLowerCase());
  return rows
    .filter((row) => row.key && row.type.toLowerCase() !== 'content')
    .filter((row) => !seen.has(row.key.toLowerCase()) && seen.add(row.key.toLowerCase()))
    .map((row) => {
      const key = row.key.toLowerCase();
      const choices = parseValues(row.values || '');
      const type = row.type.toLowerCase();
      const allHex = choices.length && choices.every((c) => HEX_COLOR.test(c.value));
      let kind = 'text';
      if (['colour', 'color'].includes(type) || allHex) kind = 'colour';
      else if (choices.length) kind = type === 'multi' ? 'multi' : 'select';
      const notOffered = (hidden[key] || []).map((v) => v.toLowerCase());
      const offered = choices.filter((c) => !notOffered.includes(c.value.toLowerCase()));
      return {
        key: row.key,
        label: labels[key] || row.label || row.key,
        kind,
        // a colour's sheet values become its named swatches
        choices: kind === 'colour' ? choices : offered,
        allChoices: choices, // hidden ones too, to name them when an edited table has them
        groups: groups[key] || [],
        more: more.includes(key),
        id: toId(row.key),
        descriptions: { ...defaults[key], ...parseDescriptions(row.description || '') },
        // an optional `when` cell: the field or a choice only shows, and only counts, while
        // one of those values is picked (`map-wide=center`: Map wide needs Center text)
        when: parseWhen(row.when || '', lowerCase),
      };
    });
}

async function loadFields(context, actions) {
  const { settings, tabs, site } = await loadConfig(actions, context);
  applySiteMessages(tabs, 'section');
  layoutCards = configCards(tabs, 'section');
  const json = await readSheet(actions, context, settings['library-sheet'], NO_STALE);
  try {
    return parseFields(buildLibrary(json, site.data).rowsFor(SECTION), configHelp(tabs, 'section'));
  } catch {
    return [];
  }
}

/** The page's saved DA source (null when it can't be read). */
const savedSource = () => readSaved(state.actions, state.context);

/** Reads the page metadata texts from the page's saved DA source (see readPageMetadata()). */
async function loadPageMetadata() {
  const source = await savedSource();
  if (source !== null) state.pageMetadata = readPageMetadata(source); // else keep the last one
}

/* ---- form ------------------------------------------------------------- */

/** The field's own help text under its label, or null. */
function helpText(field) {
  const text = field.descriptions['*'];
  if (!text) return null;
  const help = document.createElement('p');
  help.className = 'ss-plugin-help';
  help.id = `${field.id}-help`;
  help.textContent = text;
  return help;
}

function choiceInput(field, choice, type) {
  const option = document.createElement('div');
  option.className = 'ss-plugin-option';
  const label = document.createElement('label');
  label.className = `ss-plugin-choice ss-plugin-choice-${field.kind}`;
  const input = document.createElement('input');
  input.type = type;
  input.name = field.key;
  input.value = choice.value;
  label.append(input);
  option.append(label);
  const description = field.descriptions[input.value];
  if (description) {
    const mark = document.createElement('span');
    mark.className = 'ss-plugin-info';
    mark.setAttribute('aria-hidden', 'true');
    const tip = document.createElement('span');
    tip.className = 'ss-plugin-tip';
    tip.id = toId(`${field.key}-${input.value}-tip`);
    tip.setAttribute('role', 'tooltip');
    tip.textContent = description;
    input.setAttribute('aria-describedby', tip.id);
    option.append(mark, tip);
  }
  const text = document.createElement('span');
  text.textContent = choice.label;
  label.append(text);
  return option;
}

/**
 * The checkboxes of a multi field under group headings (layout JSON), in group order;
 * values in no group come last under "Other".
 */
function groupedChoices(field) {
  const list = document.createElement('div');
  list.className = 'ss-plugin-choices ss-plugin-choices-multi';
  const placed = new Set();
  const addGroup = (label, choices) => {
    if (!choices.length) return;
    const group = document.createElement('div');
    group.className = 'ss-plugin-group';
    group.setAttribute('role', 'group');
    const heading = document.createElement('p');
    heading.className = 'ss-plugin-group-label';
    heading.id = toId(`${field.key}-group-${label}`);
    heading.textContent = label;
    group.setAttribute('aria-labelledby', heading.id);
    group.append(heading, ...choices.map((c) => choiceInput(field, c, 'checkbox')));
    list.append(group);
  };
  field.groups.forEach(({ label, values = [] }) => {
    const wanted = values.map((v) => v.toLowerCase());
    const choices = field.choices.filter((c) => wanted.includes(c.value.toLowerCase()));
    choices.forEach((c) => placed.add(c));
    addGroup(label, choices);
  });
  const rest = field.choices.filter((c) => !placed.has(c));
  if (field.groups.length) addGroup(form.dataset.other, rest);
  else list.append(...rest.map((c) => choiceInput(field, c, 'checkbox')));
  return list;
}

/** Opens or closes a checkbox dropdown. */
function setOpen(dropdown, open) {
  dropdown.querySelector('.ss-plugin-toggle').setAttribute('aria-expanded', String(open));
  dropdown.querySelector('.ss-plugin-choices').hidden = !open;
}

/** A button that shows the picked labels and opens the checkbox list below it. */
function renderDropdown(field, list, legend) {
  const dropdown = document.createElement('div');
  dropdown.className = 'ss-plugin-dropdown';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ss-plugin-toggle';
  const text = document.createElement('span');
  text.className = 'ss-plugin-toggle-text';
  text.id = `${field.id}-picked`;
  toggle.append(text);
  toggle.setAttribute('aria-labelledby', `${legend.id} ${text.id}`);
  list.id = `${field.id}-list`;
  list.hidden = true;
  toggle.setAttribute('aria-controls', list.id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => setOpen(dropdown, list.hidden));
  dropdown.append(toggle, list);
  return dropdown;
}

/** Shows the picked labels (or the prompt) on each dropdown button. */
function updateDropdowns() {
  form.querySelectorAll('.ss-plugin-dropdown').forEach((dropdown) => {
    // a choice hidden by `when` keeps its tick but isn't applied, so it isn't named
    const picked = [...dropdown.querySelectorAll('input:checked')]
      .filter((input) => !input.closest('.ss-plugin-option')?.hidden)
      .map((input) => input.closest('label').textContent.trim());
    dropdown.querySelector('.ss-plugin-toggle-text').textContent = picked.join(' · ') || form.dataset.choose;
  });
}

/**
 * Shows the colour field's state: which swatch is picked (a valid code no swatch has is
 * Custom), the sample strip in the site's text colour on it, and the text colour note.
 * @param {HTMLElement} row the field's .ss-plugin-colour
 */
/** Marks the swatch of `hex` (or None, or Custom for a code no swatch has). */
function markSwatches(row, hex, value) {
  let picked = null;
  row.querySelectorAll('.ss-plugin-swatch[data-value]').forEach((swatch) => {
    const on = swatch.dataset.value === hex;
    swatch.setAttribute('aria-pressed', String(on));
    if (on) picked = swatch;
  });
  row.querySelector('.ss-plugin-swatch-none').setAttribute('aria-pressed', String(!value));
  const custom = row.querySelector('.ss-plugin-swatch-custom');
  custom.classList.toggle('is-picked', Boolean(hex) && !picked);
  if (hex && !picked) custom.style.setProperty('--chip', hex);
  else custom.style.removeProperty('--chip');
  if (hex) row.querySelector('.ss-plugin-colour-picker').value = hex;
}

/**
 * The note under the colour (and the sample strip in the text colour that reads best on it).
 * @returns {{key: string, tone: string}} the note's message and tone
 */
function colourNote(sample, hex, bad) {
  sample.hidden = !hex;
  if (bad) return { key: 'colourInvalid', tone: 'error' };
  if (!hex) return { key: 'colourNone', tone: '' };
  const { light, ratio } = textOn(hex);
  sample.style.backgroundColor = hex;
  sample.style.color = light ? '#fff' : '#333';
  if (ratio < 4.5) return { key: 'colourLow', tone: 'warning' };
  return { key: light ? 'colourLight' : 'colourDark', tone: 'success' };
}

function updateColour(row) {
  const text = row.querySelector('.ss-plugin-colour-hex');
  const note = row.querySelector('.ss-plugin-colour-note');
  const value = text.value.trim();
  const valid = HEX_COLOR.test(value);
  const bad = Boolean(value) && !valid;
  const hex = valid ? toLongHex(value) : '';
  text.setAttribute('aria-invalid', String(bad));
  markSwatches(row, hex, value);
  const { key, tone } = colourNote(row.querySelector('.ss-plugin-colour-sample'), hex, bad);
  note.textContent = form.dataset[key] || '';
  note.dataset.tone = tone;
}

/**
 * Any colour: None, the sheet's colours as named swatches, and Custom (the browser's
 * colour picker), plus the colour code field, which is the form value (empty = no colour).
 * A sample strip shows the text colour the site will use on it.
 */
function renderColourField(field, wrap) {
  const row = document.createElement('div');
  row.className = 'ss-plugin-colour';
  const text = document.createElement('input');
  const set = (value) => {
    text.value = value;
    text.dispatchEvent(new CustomEvent('input', { bubbles: true, detail: { byAuthor: true } }));
  };

  const swatches = document.createElement('div');
  swatches.className = 'ss-plugin-swatches';
  const none = swatchButton('ss-plugin-swatch-none', form.dataset.colourClear);
  none.addEventListener('click', () => set(''));
  swatches.append(none);
  field.choices.forEach((choice) => {
    const hex = toLongHex(choice.value);
    const swatch = swatchButton('', colourName(choice.label), hex);
    swatch.dataset.value = hex;
    swatch.title = `${colourName(choice.label)} ${hex}`;
    swatch.addEventListener('click', () => set(hex));
    swatches.append(swatch);
  });
  // Custom: the colour input fills the chip, so clicking it (or Enter on it) opens the picker
  const custom = document.createElement('label');
  custom.className = 'ss-plugin-swatch ss-plugin-swatch-custom';
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.className = 'ss-plugin-colour-picker';
  picker.value = '#ffffff';
  picker.defaultValue = picker.value; // form.reset() would otherwise blank it
  picker.addEventListener('input', () => set(picker.value));
  const chip = document.createElement('span');
  chip.className = 'ss-plugin-swatch-chip';
  chip.append(picker);
  const customName = document.createElement('span');
  customName.className = 'ss-plugin-swatch-name';
  customName.textContent = form.dataset.colourCustom;
  custom.append(chip, customName);
  swatches.append(custom);

  const code = document.createElement('div');
  code.className = 'ss-plugin-colour-code';
  const codeLabel = document.createElement('label');
  codeLabel.htmlFor = field.id;
  codeLabel.textContent = form.dataset.colourCode;
  text.type = 'text';
  text.id = field.id;
  text.name = field.key;
  text.className = 'ss-plugin-colour-hex';
  text.placeholder = form.dataset.colourEmpty;
  text.autocomplete = 'off';
  text.spellcheck = false;
  text.maxLength = 7;
  const note = document.createElement('p');
  note.className = 'ss-plugin-colour-note';
  note.id = `${field.id}-note`;
  note.setAttribute('aria-live', 'polite');
  const describedBy = field.descriptions['*'] ? [`${field.id}-help`, note.id] : [note.id];
  text.setAttribute('aria-describedby', describedBy.join(' '));
  text.addEventListener('input', () => updateColour(row));
  code.append(codeLabel, text);

  const sample = document.createElement('p');
  sample.className = 'ss-plugin-colour-sample';
  sample.setAttribute('aria-hidden', 'true'); // the note says the same in words
  sample.textContent = form.dataset.colourSample;

  row.append(swatches, code, sample, note);
  wrap.append(row);
  updateColour(row);
}

function renderField(field) {
  const wrap = document.createElement(['colour', 'multi'].includes(field.kind) ? 'fieldset' : 'div');
  wrap.className = 'ss-plugin-field';
  wrap.dataset.field = field.id;
  const help = helpText(field);
  if (wrap.tagName === 'FIELDSET') {
    const legend = document.createElement('legend');
    legend.className = 'ss-plugin-label';
    legend.id = `${field.id}-label`;
    legend.textContent = field.label;
    wrap.append(legend);
    if (help) {
      wrap.setAttribute('aria-describedby', help.id);
      wrap.append(help);
    }
    if (field.kind === 'colour') renderColourField(field, wrap);
    else wrap.append(renderDropdown(field, groupedChoices(field), legend));
    return wrap;
  }
  const label = document.createElement('label');
  label.className = 'ss-plugin-label';
  label.htmlFor = field.id;
  label.textContent = field.label;
  let control;
  if (field.kind === 'select') {
    control = document.createElement('select');
    control.append(new Option(form.dataset.choose, ''));
    field.choices.forEach((c) => {
      const option = new Option(c.label, c.value);
      // a native option can't hold a tooltip element; the browser shows its title
      if (field.descriptions[c.value]) option.title = field.descriptions[c.value];
      control.append(option);
    });
  } else {
    control = document.createElement('input');
    control.type = 'text';
    control.autocomplete = 'off';
    control.spellcheck = false;
  }
  control.id = field.id;
  control.name = field.key;
  wrap.append(label);
  if (help) {
    control.setAttribute('aria-describedby', help.id);
    wrap.append(help);
  }
  wrap.append(control);
  return wrap;
}

/**
 * What `when` allows: values picked in fields and choices without `when` turn on the others.
 * @returns {{shown: function(Object): boolean, allows: function(Object, string): boolean}}
 */
function whenRules(data = new FormData(form)) {
  const on = new Set(state.fields.filter((field) => !field.when.row.length)
    .flatMap((field) => data.getAll(field.key).map((v) => String(v).trim().toLowerCase())
      .filter((v) => v && !field.when.choice[v])));
  const met = (needs) => !needs?.length || needs.some((v) => on.has(v));
  return {
    shown: (field) => met(field.when.row),
    allows: (field, value) => met(field.when.choice[value.toLowerCase()]),
  };
}

/** Hides the fields and choices whose `when` isn't met (they keep their picks, unsent). */
function showWhen() {
  const { shown, allows } = whenRules();
  state.fields.forEach((field) => {
    const wrap = form.querySelector(`[data-field="${field.id}"]`);
    if (!wrap) return;
    wrap.hidden = !shown(field);
    wrap.querySelectorAll('.ss-plugin-option').forEach((option) => {
      option.hidden = !allows(field, option.querySelector('input').value);
    });
    wrap.querySelectorAll('option').forEach((option) => { option.hidden = !allows(field, option.value); });
  });
}

/** One collapsible card: its title, a line saying what is picked (updateSummaries()), fields. */
function sectionCard(label, fields) {
  const { card, body } = settingsCard(label);
  const wraps = fields.map(renderField);
  // a card's only field: its title already names it (the label stays for screen readers)
  if (wraps.length === 1) wraps[0].querySelector('.ss-plugin-label')?.classList.add('ss-plugin-visually-hidden');
  body.append(...wraps);
  return card;
}

/**
 * The fields in the layout's cards (the configuration's, else the layout JSON's `sections`), in
 * order; fields in none go in "Other settings".
 */
function renderSections(fields) {
  const placed = new Set();
  const cards = layoutCards || readJson('ss-plugin-layout').sections || [];
  const sections = cards.map(({ label, keys = [] }) => {
    const wanted = keys.map((k) => k.toLowerCase());
    const own = fields.filter((f) => wanted.includes(f.key.toLowerCase()));
    own.forEach((f) => placed.add(f));
    return { label, own };
  });
  sections.push({ label: form.dataset.otherSettings, own: fields.filter((f) => !placed.has(f)) });
  return sections.filter(({ own }) => own.length).map(({ label, own }) => sectionCard(label, own));
}

/** What one field is set to, in the author's words ('' when not set). */
function fieldSummary(wrap) {
  if (wrap.querySelector('.ss-plugin-colour')) {
    const swatch = wrap.querySelector('.ss-plugin-swatch[aria-pressed="true"]:not(.ss-plugin-swatch-none)');
    return swatch?.querySelector('.ss-plugin-swatch-name')?.textContent
      || wrap.querySelector('.ss-plugin-colour-hex')?.value.trim() || '';
  }
  const select = wrap.querySelector('select');
  if (select) return select.value ? select.selectedOptions[0].textContent : '';
  const dropdown = wrap.querySelector('.ss-plugin-toggle-text');
  if (dropdown) return dropdown.textContent === form.dataset.choose ? '' : dropdown.textContent;
  return wrap.querySelector('input[type="text"]')?.value.trim() || '';
}

/** "Blue", "Space above: Small": each card's title line says what its fields are set to. */
function updateSummaries() {
  form.querySelectorAll('.ss-plugin-section, .ss-plugin-more').forEach((card) => {
    const line = card.querySelector(':scope > summary .ss-plugin-section-sum');
    if (!line) return;
    const wraps = [...card.querySelectorAll('.ss-plugin-field:not([hidden])')];
    const named = wraps.length > 1;
    line.textContent = wraps.map((wrap) => {
      const value = fieldSummary(wrap);
      const label = wrap.querySelector('.ss-plugin-label')?.textContent.trim();
      return value && named && label ? `${label}: ${value}` : value;
    }).filter(Boolean).join(' · ') || form.dataset.notSet;
  });
}

/** @returns {[string, string][]} the picked [key, value] rows, in sheet order */
function readRows() {
  const data = new FormData(form);
  const { shown, allows } = whenRules(data);
  const extras = state.editing?.extras || { values: {}, fallback: {}, rows: [] };
  return [...state.fields.map((field) => {
    const key = field.key.toLowerCase();
    const values = shown(field) ? data.getAll(field.key).map((v) => String(v).trim())
      .filter((v) => v && allows(field, v)) : [];
    let value;
    // a colour that isn't a hex code yet is left out (its note says why)
    if (field.kind === 'colour') value = HEX_COLOR.test(values[0] || '') ? values[0].toLowerCase() : '';
    else value = [...values, ...(extras.values[key] || [])].join(', ');
    // an edited table's value the panel can't show stays while the field is left empty
    return [field.key, value || extras.fallback[key] || ''];
  }), ...extras.rows].filter(([, value]) => value);
}

/** @returns {HTMLInputElement|undefined} the first colour field whose text isn't a hex code */
const invalidColour = () => state.fields
  .filter((field) => field.kind === 'colour')
  .map((field) => form.querySelector(`#${field.id}`))
  .find((input) => input.value.trim() && !HEX_COLOR.test(input.value.trim()));

/* ---- result ----------------------------------------------------------- */

/** "Layout: Highlight band (blue)": a kept value under the names the author sees. */
function keptText(key, values) {
  const field = state.fields.find((f) => f.key.toLowerCase() === key.toLowerCase());
  const named = values.map((v) => field?.allChoices
    .find((c) => c.value.toLowerCase() === v.toLowerCase())?.label || v);
  return `${field?.label || key}: ${named.join(', ')}`;
}

/** Lists what a write keeps as it is: rows and values the panel has no control for. */
function updateKept() {
  const note = editingBox.querySelector('.ss-plugin-editing-kept');
  const extras = state.editing?.extras;
  const data = new FormData(form);
  const kept = extras ? [
    // a value a field can't show is kept only while that field is left empty
    ...Object.entries(extras.fallback)
      .filter(([k]) => !state.fields.some((f) => f.key.toLowerCase() === k && data.get(f.key)))
      .map(([k, v]) => keptText(k, [v])),
    ...Object.entries(extras.values).map(([k, v]) => keptText(k, v)),
    ...extras.rows.map(([k, v]) => keptText(k, [v])),
  ] : [];
  note.hidden = !kept.length;
  note.textContent = kept.length ? `${note.dataset.label} ${kept.join(' · ')}` : '';
}

/** Brings the dropdown labels, the "kept" note and the card summaries in step with the form. */
function refreshViews() {
  showWhen();
  updateKept();
  updateDropdowns();
  updateSummaries();
}

/* ---- the form and the table ------------------------------------------- */

const formInputs = (field) => [...form.elements].filter((el) => el.name === field.key);

/** Keeps the colour pickers and notes in step with their (re)set text fields. */
const syncColours = () => state.fields.filter((f) => f.kind === 'colour')
  .forEach((f) => form.querySelector(`#${f.id}`).dispatchEvent(new Event('input', { bubbles: true })));

/**
 * Fills the form from an existing table. Values the panel has no control for are kept in
 * `extras`: unknown rows, unknown style values, and values a field can't show.
 * @param {[string, string][]} rows the table's key/value rows
 */
function fillForm(rows) {
  const extras = { values: {}, fallback: {}, rows: [] };
  form.reset();
  rows.forEach(([rowKey, value]) => {
    const key = rowKey.toLowerCase();
    const field = state.fields.find((f) => f.key.toLowerCase() === key);
    if (!field) {
      extras.rows.push([rowKey, value]);
      return;
    }
    const inputs = formInputs(field);
    if (field.kind === 'multi') {
      value.split(',').map((v) => v.trim()).filter(Boolean).forEach((v) => {
        const box = inputs.find((input) => input.value.toLowerCase() === v.toLowerCase());
        if (box) {
          box.checked = true;
        } else {
          // e.g. a style not offered (the layout's `hidden` values)
          extras.values[key] ||= [];
          extras.values[key].push(v);
        }
      });
    } else if (field.kind === 'select') {
      const known = [...inputs[0].options]
        .find((o) => o.value && o.value.toLowerCase() === value.toLowerCase());
      if (known) inputs[0].value = known.value;
      else extras.fallback[key] = value;
    } else if (field.kind === 'colour' && !HEX_COLOR.test(value)) {
      extras.fallback[key] = value; // e.g. a named option such as section-blue-bg
    } else {
      inputs[0].value = value;
    }
  });
  syncColours();
  return extras;
}

/** `banner-stats-grid` → `Banner stats grid`: a block's name for people. */
const blockLabel = (name) => {
  const words = name.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * Turns the panel off while the page cursor is inside a block (DA's live selection names
 * the block): section settings can't go there.
 */
/** "Background: Blue · Layout: Center text": a section's settings in the author's words. */
function settingsText(rows) {
  return rows.map(([key, value]) => {
    const field = state.fields.find((f) => f.key.toLowerCase() === key.toLowerCase());
    if (field?.kind === 'colour') {
      const named = field.allChoices.find((c) => c.value.toLowerCase() === value.toLowerCase());
      return `${field.label}: ${named ? colourName(named.label) : value}`;
    }
    return keptText(key, field?.kind === 'multi' ? value.split(',').map((v) => v.trim()) : [value]);
  }).join(' · ');
}

function showBlocked() {
  const name = state.canEdit ? cursorBlock(state.live, state.blockIndex) : null;
  const blocked = name !== null;
  blockedBox.hidden = !blocked;
  if (blocked) {
    const title = blockedBox.querySelector('.ss-plugin-blocked-title');
    title.textContent = name ? title.dataset.text.replace('{block}', blockLabel(name)) : title.dataset.unnamed;
    // the cursor's block names its section: show what that section has
    const section = state.live?.blocks[state.blockIndex]?.section;
    const rows = Number.isInteger(section) ? sectionSettings(state.live, section) : [];
    const line = blockedBox.querySelector('.ss-plugin-blocked-settings');
    line.textContent = rows.length ? line.dataset.has.replace('{settings}', settingsText(rows)) : line.dataset.none;
  }
  form.classList.toggle('ss-plugin-is-blocked', blocked);
  [fieldsEl, moreBox, editingBox].forEach((el) => { el.inert = blocked || Boolean(state.busy); });
  submitButton.disabled = blocked || Boolean(state.busy);
}

/** Adding (nothing written yet), trying a table the panel just put there, or editing one. */
function showMode() {
  const { editing, trial, found } = state;
  const mode = (trial && 'trial') || (editing && 'edit') || 'insert';
  modeBadge.hidden = !state.canEdit;
  modeBadge.dataset.mode = mode;
  modeBadge.textContent = modeBadge.dataset[mode];
  editingBox.hidden = !editing;
  editingBox.querySelector('.ss-plugin-editing-title').textContent = editingBox.querySelector('.ss-plugin-editing-title').dataset[mode] || '';
  trialBox.hidden = !trial;
  removeButton.hidden = !editing || trial;
  // with the live document every pick is written; Apply is for an editor without it
  submitButton.hidden = state.canEdit;
  submitButton.textContent = submitButton.dataset[state.busy === 'adding' ? 'adding' : 'insert'];
  submitButton.classList.toggle('ss-plugin-is-busy', state.busy === 'adding');
  resetButton.textContent = resetButton.dataset[editing ? 'done' : 'clear'];
  resetButton.hidden = trial; // a trial ends with Add settings or Cancel
  form.setAttribute('aria-busy', String(Boolean(state.busy)));
  // a trial is still adding: its steps end with Add settings or Cancel
  document.querySelectorAll('.ss-plugin-steps li')
    .forEach((el) => { el.textContent = el.dataset[editing && !trial ? 'update' : 'insert']; });
  foundBox.hidden = !found?.unsure;
  refreshViews();
  showBlocked();
  notifyChange();
}

// what this panel is doing, for Page Studio's choice of view
registerView('section', () => {
  // the settings of the section holding the cursor's block, in words (Page Studio shows
  // them in the Block view, Phase 3): null when the cursor is in no block
  const section = state.live?.blocks[state.blockIndex]?.section;
  const rows = Number.isInteger(section) ? sectionSettings(state.live, section) : null;
  return {
    editing: Boolean(state.editing),
    trial: state.trial,
    busy: Boolean(state.busy),
    sections: state.editing?.sections || [],
    cursorSettings: rows && settingsText(rows),
    addCount: state.addCount,
  };
});

/** @returns {Promise<{where: string, rows?: [string, string][]}>} where the page selection is */
/** Where a selection (getSelection() HTML, null when nothing) lies in the page. */
const locateHtml = (html) => locateSelection(
  html,
  state.live || readDocument(''),
  state.blockIndex,
  state.pageMetadata,
);

async function locate() {
  let html = null;
  try {
    html = await state.actions.getSelection();
  } catch { /* nothing selected */ }
  return locateHtml(html);
}

/**
 * Opens a section's settings in the form: each pick is then written to its table.
 * @param {number[]} sections the sections that may hold it (one once a write showed which)
 * @param {Object} [how]
 * @param {boolean} [how.trial] the panel put the table there (Add settings / Cancel)
 * @param {boolean} [how.fill] fill the form from the rows: not after the panel's own write
 *   (the form already says it, and a pick made meanwhile stays)
 */
function startEdit(rows, sections, { trial = false, fill = !trial } = {}) {
  if (fill) pause.stop();
  const extras = fill ? fillForm(rows) : { values: {}, fallback: {}, rows: [] };
  state.editing = { rows, extras, sections };
  state.trial = trial;
  state.found = null;
  showMode();
}

/** Back to the panel as it opens: adding, an empty form. */
function resetForm() {
  pause.stop();
  state.editing = null;
  state.trial = false;
  state.found = null;
  form.reset();
  syncColours();
  showMode();
}

/**
 * The panel follows the cursor as far as DA tells it: DA reports a move into or out
 * of a block, in the Layout and the Content view alike, but not one between lines or into a
 * settings table. The cursor in a block ends what was open (settings being added count as
 * added) and shows that section's settings. While a write is on its way the panel waits, and
 * looks again as soon as it is done.
 */
function followCursor() {
  if (state.busy) return;
  if (state.editing && cursorBlock(state.live, state.blockIndex) !== null) {
    const { trial } = state;
    resetForm();
    say(trial ? 'added' : 'left');
  }
  showBlocked();
}

/** One look at what is highlighted in the page (see watchSelection()). */
/** One look at what is highlighted in the page (the shared watch, onSelection()). */
function lookAtSelection(html) {
  // a pick or a write is on its way: it wins
  if (state.busy || pause.waiting) return;
  const found = locateHtml(html);
  const { editing } = state;
  if (found.where === 'metadata') {
    const same = editing && sameRows(found.rows, editing.rows)
      && found.sections.some((s) => editing.sections.includes(s));
    if (!same) {
      startEdit(found.rows, found.sections);
      say(null);
    }
  } else if (found.where === 'ambiguous') {
    if (!state.found?.unsure) {
      state.found = { unsure: true };
      showMode();
    }
  } else if (found.where === 'text' && editing) {
    const { trial } = state;
    resetForm();
    say(trial ? 'added' : 'left');
  } else if (state.found) {
    state.found = null;
    showMode();
  }
}

/**
 * Looks at what is highlighted in the page: a section's settings table opens by itself, like
 * a properties panel; highlighted text elsewhere ends editing (the cursor left the table).
 * A plain caret, or a highlight of only an empty table's name, keeps what is open. An error
 * in one look doesn't stop the next.
 */
function watchSelection() {
  onSelection(state.actions, lookAtSelection, WATCH_MS);
}

/** Leaves editing (the page stays as it is) and clears the form. */
function startOver() {
  resetForm();
  say(null);
}

/* ---- writing to the page ---------------------------------------- */

const REPLACE_ERRORS = { unsupported: 'noReplace', READ_ONLY: 'readOnly', TIMEOUT: 'timeout' };

/** @returns {Promise<string|null>} the next live document other than `html`, or null after `ms` */
const nextLive = (html, ms) => liveFeed.next(html, ms);

/** Takes a live document as the panel's (a write's result, before DA's broadcast of it). */
function takeLive(html) {
  if (!html || html === state.liveHtml) return;
  state.liveHtml = html;
  state.live = readDocument(html);
}

/**
 * Replaces the top-level node at the cursor (no `expected`: a settings table isn't a block).
 * @returns {Promise<string|null>} the live document after it, or null when DA refused
 */
async function replaceAtCursor(html) {
  const { result, after } = await replaceNode({
    actions: state.actions, html, before: state.liveHtml, next: nextLive,
  });
  if (!after) {
    say(REPLACE_ERRORS[result?.error] || 'updateFailed');
    return null;
  }
  takeLive(after);
  return after;
}

/**
 * Some changes show only in the saved source, a moment later (the live document leaves the
 * page Metadata table out, and merges a section's tables): watch it for a while.
 * @param {number|null} metadataBefore the page Metadata tables before the write
 * @param {number|null} section a section that must not hold two settings tables
 */
let watching = 0; // the latest write's watch; an older one stops
async function watchSource(metadataBefore, section) {
  watching += 1;
  const mine = watching;
  await watchSaved(savedSource, (source) => {
    if (metadataBefore && metadataCount(source) < metadataBefore) {
      say('metadataLost');
      return true;
    }
    if (Number.isInteger(section) && settingsTables(source, section) > 1) {
      say('duplicate');
      return true;
    }
    return false;
  }, () => mine === watching);
}

/**
 * A write replaced a line it shouldn't have, and the cursor is now in the table it put there:
 * put that line back (a paragraph, heading or list it took the place of; another section's
 * settings as they were; else an empty line).
 * @returns {Promise<boolean>} the page is as it was
 */
async function putBack(before, after, section) {
  let html = removedNode(before, after);
  if (!html && Number.isInteger(section)) {
    const rows = sectionSettings(readDocument(before), section);
    html = rows.length ? settingsTable(rows) : '<p></p>';
  }
  if (!html) return false;
  const restored = await replaceAtCursor(html);
  return Boolean(restored) && pageSignature(restored) === pageSignature(before)
    && changedSections(before, restored)?.length === 0;
}

/**
 * Adding went into a section that has a settings table (the cursor is in the new table):
 * take the new table out again. An empty line in its place gives the page it had when the
 * cursor was on an empty line; if a section's settings went with it, the cursor was in that
 * section's table, which is written back as it was.
 * @returns {Promise<boolean>} the page is as it was
 */
async function takeBack(before) {
  const blank = await replaceAtCursor('<p></p>');
  if (!blank) return false;
  const [lost] = changedSections(before, blank) || [];
  if (lost === undefined) return pageSignature(blank) === pageSignature(before);
  const back = await replaceAtCursor(settingsTable(sectionSettings(readDocument(before), lost)));
  return Boolean(back) && pageSignature(back) === pageSignature(before)
    && changedSections(before, back)?.length === 0;
}

/** Before a write: DA's live document is here and, adding, no text is highlighted. */
async function canWrite(editing) {
  // the panel was opened a moment ago: wait for DA's first live document to compare with
  if (!state.liveHtml) await nextLive('');
  if (!state.liveHtml) {
    say('updateFailed');
    return false;
  }
  if (!editing) {
    // a highlight would be replaced by the table (an empty settings table's name may be)
    const found = await locate();
    if (found.where === 'text') {
      say('textSelected');
      return false;
    }
  }
  return true;
}

/** The cursor wasn't in the table (or, adding, on an empty line): put back what it replaced. */
async function wroteElsewhere(before, after, section, editing, metadata) {
  const ok = await putBack(before, after, section);
  if (editing) resetForm();
  say((ok && (editing ? 'moved' : 'restored')) || 'replaced');
  watchSource(await metadata, null);
}

/**
 * Adding: the new table is a trial in its section. Nothing showed (the section's own table
 * overrides the new one) or the section had settings: it went where a table is already.
 */
async function placedTable(rows, changed, live, before, metadata) {
  const [section] = changed;
  if (changed.length !== 1 || sectionSettings(live, section).length) {
    const ok = await takeBack(before);
    say(ok ? 'sectionHas' : 'replaced');
    watchSource(await metadata, null);
    return;
  }
  state.busy = null;
  startEdit(rows, [section], { trial: true });
  say('placed');
  watchSource(await metadata, section);
}

/** Editing: the table now holds the picked rows; a second table in the section shows as other settings. */
async function updatedTable(rows, changed, editing, metadata) {
  const at = changed.length ? changed[0] : editing.sections[0];
  editing.rows = rows;
  editing.sections = [at];
  say(sameRows(sectionSettings(state.live, at), rows) ? 'applied' : 'duplicate');
  watchSource(await metadata, at);
}

/**
 * Writes the picked rows to the page and checks what changed. Adding: the cursor's line
 * becomes the table (a trial). Editing: the table at the cursor is replaced. Only the target
 * section's settings may change; anything else is put back (or Undo is asked for).
 */
async function writeTable() {
  pause.done();
  if (!state.canEdit || cursorBlock(state.live, state.blockIndex) !== null) return;
  if (state.busy) {
    state.again = true;
    return;
  }
  const rows = readRows();
  const { editing } = state;
  if (!rows.length) {
    // every setting taken off: the table goes, and its line is ready for new settings
    // eslint-disable-next-line no-use-before-define
    if (editing) await removeTable('cleared');
    return; // else nothing picked yet
  }
  state.busy = 'writing';
  say('applying');
  showMode();
  try {
    if (!(await canWrite(editing))) return;
    const before = state.liveHtml;
    const live = state.live || readDocument(before);
    // the page Metadata table shows only in the saved source: count it before writing
    const metadata = savedSource().then((s) => (s === null ? null : metadataCount(s)));
    const after = await replaceAtCursor(settingsTable(rows));
    if (!after) return;
    const changed = changedSections(before, after);
    const [section] = changed || [];
    const elsewhere = !changed || changed.length > 1
      || (editing && changed.length === 1 && !editing.sections.includes(section));
    if (pageSignature(before) !== pageSignature(after) || elsewhere) {
      await wroteElsewhere(before, after, elsewhere ? section : null, editing, metadata);
    } else if (editing) {
      await updatedTable(rows, changed, editing, metadata);
    } else {
      await placedTable(rows, changed, live, before, metadata);
    }
  } catch {
    say('updateFailed');
  } finally {
    state.busy = null;
    showMode();
    followCursor(); // the cursor may have moved meanwhile
    if (state.again) {
      state.again = false;
      writeTable();
    }
  }
}

/** A change in the form: it reaches the page after a short pause (typing waits longer). */
function scheduleWrite(typing) {
  if (!state.canEdit) return;
  pause.start(typing);
}

/** Add settings: the table the panel put there stays, and the form is ready for another section. */
async function keepTrial() {
  // a pick still waiting goes in first
  if (pause.waiting) {
    pause.stop();
    await writeTable();
  }
  if (!state.trial) return; // the write found the cursor elsewhere, and said so
  // DA can't tell the panel when the cursor leaves the table, so it doesn't stay on it
  state.addCount += 1;
  resetForm();
  say('kept');
}

/** Remove (a trial, or an existing table): the table goes and an empty line takes its place. */
async function removeTable(doneKey = 'removed') {
  pause.stop();
  const { editing } = state;
  if (!editing || state.busy) return;
  state.busy = 'removing';
  showMode();
  try {
    const before = state.liveHtml;
    const metadata = savedSource().then((s) => (s === null ? null : metadataCount(s)));
    const after = await replaceAtCursor('<p></p>');
    if (!after) return;
    const changed = changedSections(before, after);
    const textSame = pageSignature(before) === pageSignature(after);
    const ok = textSame && changed?.length === 1 && editing.sections.includes(changed[0]);
    // the cursor had left the table: put back what the empty line took: nothing (it
    // was an empty line), a line of text, or another section's settings
    const back = ok || (textSame && changed?.length === 0)
      || await putBack(before, after, changed?.length === 1 ? changed[0] : null);
    state.busy = null;
    resetForm();
    say((ok && doneKey) || (back && 'moved') || 'replaced');
    watchSource(await metadata, null);
  } catch {
    say('updateFailed');
  } finally {
    state.busy = null;
    showMode();
    followCursor();
  }
}

/**
 * The live document changed by itself (the author typed in the page, or Undo): an open table
 * whose section's settings changed is read again; one that is gone ends editing.
 */
function followLive() {
  const { editing } = state;
  if (!editing || state.busy || pause.waiting || editing.sections.length !== 1) return;
  const rows = sectionSettings(state.live, editing.sections[0]);
  if (!rows.length) {
    resetForm();
    say('left');
  } else if (!sameRows(rows, editing.rows)) {
    startEdit(rows, editing.sections, { trial: state.trial, fill: true });
  }
}

/**
 * Without the live document (outside Experience Workspace): Apply inserts the table at the
 * cursor, as before.
 */
async function insertTable(rows) {
  const result = await state.actions.sendHTML(settingsTable(rows));
  // an editor without the live document may answer nothing; only a refusal is a failure
  if (result?.ok === false) {
    say(REPLACE_ERRORS[result.error] || 'failed');
    return;
  }
  state.addCount += 1; // before the reset, which tells Page Studio (notifyChange)
  resetForm();
  say('done');
}

/** Locks the form while Apply runs; the button says what is happening. */
function setBusy(key) {
  state.busy = key;
  showMode();
}

form.addEventListener('input', (e) => {
  // filling the form (fillForm(), syncColours()) sends untrusted events; the author's are trusted
  const byAuthor = e.isTrusted || e.detail?.byAuthor;
  const fallback = state.editing?.extras.fallback;
  if (byAuthor && fallback && e.target.name) delete fallback[e.target.name.toLowerCase()];
  refreshViews();
  if (!byAuthor) return;
  // an old result no longer applies once the author changes something
  if (message.dataset.tone !== 'error') say(null);
  // a colour code waits until it is one (its note says why)
  if (!invalidColour()) scheduleWrite(e.target.type === 'text');
});
form.addEventListener('change', refreshViews);
// Escape closes an open dropdown (focus back on its button) and hides the tooltips until
// another key is pressed or the pointer moves to another option; a click outside closes it
let quietOption = null;
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') {
    form.classList.remove('ss-plugin-tips-off');
    return;
  }
  form.classList.add('ss-plugin-tips-off');
  quietOption = form.querySelector('.ss-plugin-option:hover');
  const toggle = e.target.closest?.('.ss-plugin-dropdown')?.querySelector('.ss-plugin-toggle')
    || form.querySelector('.ss-plugin-toggle[aria-expanded="true"]');
  if (toggle?.getAttribute('aria-expanded') === 'true') {
    setOpen(toggle.parentElement, false);
    toggle.focus();
  }
});
document.addEventListener('mouseover', (e) => {
  if (e.target.closest?.('.ss-plugin-option') !== quietOption) form.classList.remove('ss-plugin-tips-off');
});
document.addEventListener('click', (e) => {
  form.querySelectorAll('.ss-plugin-dropdown').forEach((dropdown) => {
    if (!dropdown.contains(e.target)) setOpen(dropdown, false);
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.canEdit) return; // every pick is written as it is made
  const badColour = invalidColour();
  if (badColour) {
    say('badColour');
    badColour.focus();
    return;
  }
  const rows = readRows();
  if (!rows.length) { say('empty'); return; }
  if (!state.actions?.sendHTML) { say('standalone'); return; }
  setBusy('adding');
  try {
    await insertTable(rows);
  } catch {
    say('failed');
  } finally {
    setBusy(null);
  }
});

resetButton.addEventListener('click', startOver);
trialBox.querySelector('.ss-plugin-keep').addEventListener('click', keepTrial);
trialBox.querySelector('.ss-plugin-remove').addEventListener('click', () => removeTable());
removeButton.addEventListener('click', () => removeTable('takenOut'));

async function init() {
  say('loading');
  const sdk = await connect();
  if (!sdk) { say('standalone'); return; }

  const { context, actions, capabilities } = sdk;
  state.actions = trackCursor(actions, (index) => { state.blockIndex = index; });
  state.context = context;
  state.fields = await loadFields(context, actions);
  if (!state.fields.length) { say('missing'); return; }

  fieldsEl.append(...renderSections(state.fields.filter((f) => !f.more)));
  const more = state.fields.filter((f) => f.more);
  moreBox.querySelector('.ss-plugin-more-fields').append(...more.map(renderField));
  moreBox.hidden = !more.length;
  showWhen();
  updateDropdowns();
  updateSummaries();

  state.canEdit = canEditLive(capabilities, actions);
  if (state.canEdit) {
    loadPageMetadata();
    onLiveDocument(actions, ({ html, selection }) => {
      if (html !== state.liveHtml) {
        state.live = readDocument(html);
        state.liveHtml = html;
        liveFeed.notify(html);
        followLive();
      }
      state.blockIndex = selection?.blockIndex ?? null;
      followCursor();
      // the cursor's section settings (Page Studio's line under the path) may have changed:
      // say so now, not at the next look at the highlight
      notifyChange();
    });
    watchSelection();
  }
  showMode();
  form.hidden = false;
  say(null);
}

init();
