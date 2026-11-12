/*
 * Page Studio — the Button view (also opens on its own, as a DA library panel). Authors pick a
 * button design, set its text and link (and, where the site supports them, its colours, icon
 * and "Open in a new tab"), and insert it. Two-way: with DA's live document (Experience
 * Workspace) a highlight anywhere in a button opens that whole button (read from the live
 * document, button-doc.js) with every property set, and each change is written to the page
 * after a short pause; Done ends editing. Without the live document, a button selected when the
 * panel opens is pre-filled and Update replaces it.
 *
 * What it writes (the button contract, tools/page-studio/README.md):
 *   a link alone in its paragraph, wrapped in the design's marks. By default the boilerplate's
 *   decorateButtons(): bold → primary, italic → secondary, bold + italic → accent, none → a link.
 *   Only when the configuration allows it (the site must read them):
 *     `button-options`  colours, a design name and fixed extras as a trailing `[key="value", …]`
 *     `button-new-tab`  "Open in a new tab" as `#_blank` at the end of the link
 *     `button-icons`    an icon as `:name:` in the text (`text`) or as `icon="name"` (`option`)
 *
 * Designs come from the customer's buttons sheet (configuration `buttons-sheet`):
 *   `styles`  style, label, marks (strong, em, sub, sup, u joined by `+`), classes (for the
 *             preview), option (yes: written as `style="…"`), icons (yes / no)
 *   `presets` name, style, label, description, color, text-color, options (`key="value", …`)
 *   `options` key (color, text-color, icon), values (`Label=value | …`)
 * Without a sheet: the built-in designs in button.html (`.btn-plugin-defaults`).
 */

import {
  timeout, connect, readSheet, canEditLive, trackCursor, liveWaiter, onLiveDocument, onSelection,
  registerView, notifyChange, registerCommand, loadConfig, codeOrigin, NO_STALE,
} from '../../shared/da.js';
import { normalizeRow } from '../../shared/sheet.js';
import {
  escapeHtml, settingsTable, optionsSuffix, parseOptionPairs,
} from '../../shared/dom.js';
import { contrastText } from '../../shared/colour.js';
import {
  readDocument, sectionSettings, changedSections, removedNode,
} from '../section/live-doc.js';
import {
  selectionHint, findButton, currentButton, blockWrite, pageWrite, pageContent,
} from './button-doc.js';
import { pauseTimer, sendInBlock, replaceAtCursor } from '../../shared/write.js';

const NEW_TAB = '#_blank';
const WATCH_MS = 700; // how often the panel looks at what is highlighted in the page

// the marks a design may use: outside the link (strong, em) and inside it (sub, sup, u)
const OUTER_MARKS = ['strong', 'em'];
const INNER_MARKS = ['sub', 'sup', 'u'];
// option keys the panel writes itself; any other `key="value"` in a preset is a fixed extra
const OWN_KEYS = ['style', 'color', 'text-color', 'icon', 'icon-position', 'new-tab'];
// a `:name:` in a label (start, end or between spaces)
const ICON_TEXT = /(^|\s):([a-z0-9-]+):(?=\s|$)/i;
const ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const $ = (selector) => document.querySelector(selector);
const main = $('.btn-plugin');
const status = $('.btn-plugin-status');
const gallery = $('.btn-plugin-gallery');
const list = $('.btn-plugin-presets');
const editor = $('.btn-plugin-editor');
const editorStatus = $('.btn-plugin-editor-status');
const form = $('.btn-plugin-form');
const preview = $('.btn-plugin-preview');
const submit = $('.btn-plugin-submit');
const swatchSets = [...form.querySelectorAll('.btn-plugin-colors')];
const iconSelect = form.elements.icon;
const iconPreview = form.querySelector('.btn-plugin-select-icon');
const modeBadges = [...document.querySelectorAll('.btn-plugin-mode')];

/** The built-in designs and presets (button.html), used without a buttons sheet. */
const DEFAULTS = (() => {
  try {
    return JSON.parse($('.btn-plugin-defaults')?.textContent || '{}');
  } catch {
    return {};
  }
})();

const state = {
  actions: null,
  styles: [], // the site's designs: { id, label, marks, classes, option, icons }
  presets: [],
  options: {}, // color, text-color, icon choices
  features: { options: false, newTab: false, icons: 'no' }, // what the site reads (configuration)
  origin: window.location.origin, // the customer code address (previews, icons)
  iconPath: '/icons/',
  preset: null,
  message: status.textContent,
  canEdit: false, // DA offers the live document and replace (Experience Workspace)
  liveHtml: '',
  blockIndex: null, // the block holding the cursor (DA's live selection)
  // the page button being edited: findButton() (scope, where it is, its paragraph HTML)
  editing: null,
  busy: false, // a write is on its way
  again: false, // a change came in while writing
  inserting: false, // Insert / Update on its way
  addCount: 0, // buttons inserted: Page Studio goes home after each
  seen: null, // the latest highlight (getSelection() HTML)
  dismissed: null, // the highlight Done was chosen on: it doesn't open the button again
};
const liveFeed = liveWaiter(); // waits for the next live document
// a change reaches the page after a pause (shared/write.js)
// eslint-disable-next-line no-use-before-define -- writeButton() is below, with the writes
const pause = pauseTimer(() => writeButton());

const isOpen = () => editor.classList.contains('is-open');

// each message's tone, as in the other views' status line (no tone: a warning)
const TONES = {
  loading: 'info',
  defaults: 'info',
  standalone: 'info',
  edit: 'info',
  editLive: 'info',
  applying: 'info',
  left: 'info',
  done: 'success',
  applied: 'success',
  doneEditing: 'success',
  updated: 'success',
  failed: 'error',
  replaced: 'error',
  readOnly: 'error',
  noReplace: 'error',
  updateFailed: 'error',
  timeout: 'error',
};

/** Shows the current message in whichever view is visible (gallery or drawer). */
function showMessage() {
  const [shown, other] = isOpen() ? [editorStatus, status] : [status, editorStatus];
  shown.textContent = state.message;
  shown.dataset.tone = state.message ? TONES[state.messageKey] || 'warning' : '';
  other.textContent = '';
  other.dataset.tone = '';
}

/** @param {string|null} key a data-* message on the status element; null clears */
function say(key) {
  state.message = (key && status.dataset[key]) || '';
  state.messageKey = key;
  showMessage();
}

/* ---- validation ------------------------------------------------------ */

/**
 * A safe link: a path / anchor / query relative to the site, or an absolute
 * http(s), mailto or tel URL. Anything else (javascript:, data:, //host) → ''.
 * @param {string} value authored URL
 * @returns {string} the URL, or ''
 */
function cleanUrl(value) {
  const v = (value || '').trim();
  if (!v || /\s/.test(v)) return '';
  if (/^(?:\/(?!\/)|#|\?|\.\.?\/)/.test(v)) return v;
  try {
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(v).protocol) ? v : '';
  } catch {
    return '';
  }
}

/**
 * A CSS colour or a design-token name of the site (e.g. brand-orange). Restricted to
 * characters that can't break the `[…="…"]` syntax.
 * @param {string} value colour from the sheet / selection
 * @returns {string} the colour, or ''
 */
function cleanColor(value) {
  const v = (value || '').trim();
  if (!v || !/^[#\w(),.%\s-]+$/.test(v)) return '';
  if (CSS.supports('color', v)) return v;
  const token = v.replace(/^-+/, '');
  if (getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim()) return v;
  return '';
}

/** An icon file name (letters, digits, hyphens), or ''. */
const cleanIcon = (name) => {
  const n = String(name || '').trim().toLowerCase();
  return ICON_NAME.test(n) ? n : '';
};

/** `arrow-down` → `Arrow down`: an icon's name for people. */
const iconLabel = (icon) => icon.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/* ---- designs ----------------------------------------------------------- */

const yes = (value) => ['yes', 'true', '1'].includes(String(value ?? '').trim().toLowerCase());

/**
 * One design: its id, label, marks (outer strong / em, inner sub / sup / u), the classes the
 * site gives it (for the preview), whether it is written as `style="…"`, whether it takes icons.
 * @returns {Object|null} null when the row is not a valid design
 */
function parseStyle(row) {
  const id = String(row.style ?? row.id ?? '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return null;
  const marks = String(row.marks ?? '').toLowerCase().split(/[+,\s]+/).filter(Boolean);
  if (!marks.every((m) => OUTER_MARKS.includes(m) || INNER_MARKS.includes(m))) return null;
  const classes = String(row.classes ?? '').trim();
  if (!/^[\w\s-]*$/.test(classes)) return null;
  return {
    id,
    label: String(row.label ?? '').trim() || id,
    marks: [...new Set(marks)],
    classes,
    option: yes(row.option),
    icons: row.icons === undefined || row.icons === '' ? true : yes(row.icons),
  };
}

/** A design by id (the first design when the id is unknown). */
const styleInfo = (id) => state.styles.find((s) => s.id === String(id || '').toLowerCase())
  || null;

/**
 * The fixed extras of a preset or an edited button: `key="value"` pairs the panel doesn't write
 * itself, passed through as they are (validated: plain keys, safe values).
 * @param {string|Object} source the options text, or an object of options
 */
function parseExtra(source) {
  const pairs = typeof source === 'string'
    ? parseOptionPairs(source)
    : Object.entries(source || {});
  const extra = {};
  pairs.forEach(([key, value]) => {
    const v = String(value).trim();
    if (OWN_KEYS.includes(key) || !/^[a-z][a-z0-9-]*$/.test(key) || !v) return;
    if (key.endsWith('color')) {
      if (cleanColor(v)) extra[key] = cleanColor(v);
      return;
    }
    if (/^[\w#().,% -]+$/.test(v)) extra[key] = v;
  });
  return extra;
}

const extraText = (extra) => Object.entries(extra || {}).map(([k, v]) => `${k}="${v}"`).join(', ');

/**
 * @param {Object} json DA sheet JSON (single sheet, or multi-sheet with tabs)
 * @param {string} name tab name
 * @returns {Object[]|null} the tab's rows
 */
function sheetRows(json, name) {
  if (Array.isArray(json?.[name]?.data)) return json[name].data.map(normalizeRow);
  if (name === 'presets' && Array.isArray(json?.data)) return json.data.map(normalizeRow);
  return null;
}

function parsePresets(rows) {
  return (rows || [])
    .map((row) => ({
      name: String(row.name ?? '').trim(),
      style: String(row.style ?? '').trim().toLowerCase() || state.styles[0]?.id,
      color: cleanColor(row.color),
      textColor: cleanColor(row['text-color']),
      label: String(row.label ?? ''),
      description: String(row.description ?? ''),
      extra: parseExtra(row.options || ''),
      icon: cleanIcon(String(row.options || '').match(/icon="([^"]*)"/)?.[1]),
      iconBefore: /icon-position="(before|left)"/i.test(row.options || ''),
    }))
    .filter((p) => p.name && styleInfo(p.style));
}

/**
 * `values` cells look like `Brand blue=#0373f3 | Black=#000000` (a bare value is its own
 * label); key `icon`: icon file names (`Download=arrow-down | star`).
 */
function parseOptions(rows) {
  const options = {};
  (rows || []).forEach((row) => {
    const key = String(row.key || '').toLowerCase();
    if (!['color', 'text-color', 'icon'].includes(key)) return;
    options[key] = String(row.values || '').split('|').map((entry) => {
      const [label, value = label] = entry.split('=').map((s) => s.trim());
      if (key !== 'icon') return { label, value: cleanColor(value) };
      const icon = cleanIcon(value);
      return { label: entry.includes('=') ? label : icon && iconLabel(icon), value: icon };
    }).filter((o) => o.label && o.value);
  });
  return options;
}

/**
 * The designs, presets and choices: the customer's buttons sheet, else the built-in ones.
 * @returns {Promise<boolean>} the sheet was read
 */
/** The built-in designs and presets (button.html), until the sheet is read. */
function useDefaults() {
  state.styles = (DEFAULTS.styles || []).map(parseStyle).filter(Boolean);
  state.presets = parsePresets(DEFAULTS.presets);
  state.options = {};
}

async function loadSheet(context, actions, path) {
  useDefaults();
  const json = await readSheet(actions, context, path, NO_STALE);
  if (!json) return false;
  try {
    const styles = (sheetRows(json, 'styles') || []).map(parseStyle).filter(Boolean);
    if (styles.length) state.styles = styles;
    const presets = parsePresets(sheetRows(json, 'presets'));
    if (presets.length) state.presets = presets;
    state.options = parseOptions(sheetRows(json, 'options'));
    return Boolean(presets.length || styles.length);
  } catch {
    return false;
  }
}

/* ---- the site's CSS for the previews ------------------------------------ */

/**
 * Loads the customer's CSS (configuration `preview-css`) into a low cascade layer, so previews
 * are the site's real buttons while the panel keeps its own look: the panel's own rules are
 * outside any layer (they always win), and button.css's `reset` layer takes back what the
 * site's rules do to the panel's elements outside the previews.
 */
function loadPreviewCss(paths) {
  const style = document.createElement('style');
  const imports = paths.map((path) => `@import url("${new URL(path, state.origin).href}") layer(site);`);
  style.textContent = `@layer site, reset;\n${imports.join('\n')}`;
  document.head.prepend(style);
}

/* ---- preview ------------------------------------------------------------ */

function resolveColor(value) {
  const v = cleanColor(value);
  if (!v || CSS.supports('color', v)) return v;
  return `var(--${v.replace(/^-+/, '')})`;
}

/** The icon file's address in the customer code. */
const iconUrl = (icon) => new URL(`${state.iconPath}${icon}.svg`, state.origin).href;

/**
 * The button as the site renders it (inert: previews are not links), with the design's classes
 * and, when the site reads them, its colours (approximated inline) and icon.
 */
function renderButton({
  style, label, color, textColor, icon, iconBefore,
}) {
  const p = document.createElement('p');
  const a = document.createElement('a');
  a.href = '#';
  a.textContent = label || ' ';
  const design = styleInfo(style);
  if (design?.classes) {
    p.className = 'button-wrapper';
    a.className = design.classes;
  }
  if (state.features.options && design?.marks.length) {
    const bg = resolveColor(color);
    const fg = resolveColor(textColor);
    if (bg) {
      a.style.backgroundColor = bg;
      a.style.borderColor = bg;
    }
    if (fg || bg) a.style.color = fg || contrastText(bg);
  }
  const name = state.features.icons !== 'no' && design?.icons ? cleanIcon(icon) : '';
  if (name) {
    const img = document.createElement('img');
    img.src = iconUrl(name);
    img.alt = '';
    img.width = 16;
    img.height = 16;
    const span = document.createElement('span');
    span.className = `icon icon-${name}`;
    span.append(img);
    if (iconBefore) a.prepend(span, ' ');
    else a.append(' ', span);
  }
  p.append(a);
  return p;
}

/* ---- markup ------------------------------------------------------------ */

/**
 * @returns {string} the paragraph to insert, in the shape the site's decorateButtons() reads
 */
/** The label (escaped) in the design's marks: inner ones inside the link, outer ones round it. */
function wrapInMarks(design, text, href) {
  let html = text;
  INNER_MARKS.filter((m) => design.marks.includes(m)).forEach((tag) => { html = `<${tag}>${html}</${tag}>`; });
  html = `<a href="${escapeHtml(href)}">${html}</a>`;
  [...OUTER_MARKS].reverse().filter((m) => design.marks.includes(m))
    .forEach((tag) => { html = `<${tag}>${html}</${tag}>`; });
  return html;
}

/** The `key="value"` options the site reads (only what the configuration allows). */
function optionList(design, {
  color, textColor, extra, iconBefore,
}, name) {
  const { options: withOptions, icons: iconMode } = state.features;
  const marked = design.marks.length > 0;
  const options = withOptions ? [
    design.option && `style="${design.id}"`,
    marked && color && `color="${color}"`,
    marked && textColor && `text-color="${textColor}"`,
    Object.keys(extra || {}).length > 0 && extraText(extra),
  ].filter(Boolean) : [];
  if (name && iconMode === 'option') {
    options.push(`icon="${name}"`);
    if (iconBefore) options.push('icon-position="before"');
  }
  return options;
}

/**
 * @returns {string} the paragraph to insert, in the shape the site's decorateButtons() reads
 */
function buildHtml(values) {
  const {
    style, label, url, newTab, icon, iconBefore,
  } = values;
  const design = styleInfo(style) || { marks: [], id: style };
  const { newTab: withNewTab, icons: iconMode } = state.features;
  const href = withNewTab && newTab ? `${url}${NEW_TAB}` : url;
  const name = iconMode !== 'no' && design.icons ? cleanIcon(icon) : '';
  let text = escapeHtml(label);
  if (name && iconMode === 'text') text = iconBefore ? `:${name}: ${text}` : `${text} :${name}:`;
  let html = wrapInMarks(design, text, href);
  const options = optionList(design, values, name);
  if (options.length) html += ` [${escapeHtml(options.join(', '))}]`;
  return `<p>${html}</p>`;
}

/** The design whose marks are exactly these (else the one sharing the most, else a link). */
function styleForMarks(found) {
  const key = (marks) => [...marks].sort().join('+');
  const exact = state.styles.find((s) => !s.option && key(s.marks) === key(found));
  if (exact) return exact.id;
  const scored = state.styles.filter((s) => !s.option)
    .map((s) => ({ id: s.id, score: s.marks.filter((m) => found.includes(m)).length - s.marks.length }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.id || state.styles[0]?.id || '';
}

/**
 * A button's icon: a span.icon (when the selection comes back converted) or `:name:` in its
 * text, which is then taken out of the label.
 * @returns {{icon: string, iconBefore: boolean, label: string}}
 */
function readIcon(a, doc, text) {
  const span = a.querySelector('span.icon');
  if (span) {
    const range = doc.createRange();
    range.setStart(a, 0);
    range.setEndBefore(span);
    return {
      icon: cleanIcon([...span.classList].find((c) => c.startsWith('icon-'))?.slice(5)),
      iconBefore: !range.toString().trim(),
      label: text,
    };
  }
  const typed = text.match(ICON_TEXT);
  const icon = typed ? cleanIcon(typed[2]) : '';
  if (!icon) return { icon: '', iconBefore: false, label: text };
  return {
    icon,
    iconBefore: !text.slice(0, typed.index).trim(),
    label: `${text.slice(0, typed.index)}${text.slice(typed.index + typed[0].length)}`.replace(/\s+/g, ' ').trim(),
  };
}

/**
 * Reads a button back from its paragraph's HTML (edit mode).
 * DOMParser documents are inert: nothing in them runs or loads.
 * @param {string} html the button paragraph (or a selection)
 * @returns {Object|null} the button's fields, or null when there is no link
 */
function parseSelection(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const a = doc.querySelector('a[href]');
  if (!a) return null;
  const has = (tag) => Boolean(a.closest(tag) || a.querySelector(tag));
  const marks = [
    ...(has('strong') || has('b') ? ['strong'] : []),
    ...(has('em') || has('i') ? ['em'] : []),
    ...INNER_MARKS.filter((m) => has(m)),
  ];
  let style = styleForMarks(marks);

  // the `[key="value", …]` options at the end (the site's own, when it reads them)
  const options = {};
  const found = optionsSuffix(doc.body.textContent);
  const pairs = found && found.inner.includes('=') ? parseOptionPairs(found.inner) : [];
  pairs.forEach(([key, value]) => { options[key] = value.trim(); });
  if (styleInfo(options.style)) style = options.style.toLowerCase();

  let url = a.getAttribute('href');
  let newTab = ['true', 'yes', '1'].includes((options['new-tab'] || '').toLowerCase());
  if (url.endsWith(NEW_TAB)) {
    url = url.slice(0, -NEW_TAB.length);
    newTab = true;
  }
  const own = optionsSuffix(a.textContent);
  const text = (own?.inner.includes('=') ? a.textContent.slice(0, own.start) : a.textContent).trim();
  const read = readIcon(a, doc, text);
  const { label } = read;
  let { icon, iconBefore } = read;
  // the `icon="…"` option wins, as on the page
  if (cleanIcon(options.icon)) {
    icon = cleanIcon(options.icon);
    iconBefore = ['before', 'left'].includes((options['icon-position'] || '').toLowerCase());
  }
  return {
    style,
    url,
    newTab,
    icon,
    iconBefore,
    label,
    color: cleanColor(options.color),
    textColor: cleanColor(options['text-color']),
    extra: parseExtra(options),
  };
}

/* ---- UI ------------------------------------------------------------------ */

const same = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();

/**
 * Fills a colour fieldset with swatch radios: "Design default" first, then the
 * sheet's choices, then the current colour when it isn't one of them.
 * @param {HTMLElement} fieldset `.btn-plugin-colors` group (data-name, data-default)
 * @param {{label: string, value: string}[]} choices from the sheet
 * @param {string} [selected] the colour to check
 */
function fillSwatches(fieldset, choices, selected) {
  const choiceList = [{ label: fieldset.dataset.default, value: '' }, ...choices];
  if (selected && !choiceList.some((c) => same(c.value, selected))) {
    choiceList.push({ label: selected, value: selected });
  }
  const current = choiceList.find((c) => same(c.value, selected)) || choiceList[0];
  // the other views' round swatch with its name under it; the radio covers the chip
  fieldset.querySelector('.btn-plugin-swatches').replaceChildren(...choiceList.map((choice) => {
    const swatch = document.createElement('label');
    swatch.className = `ss-plugin-swatch btn-plugin-swatch${choice.value ? '' : ' ss-plugin-swatch-none'}`;
    swatch.title = choice.label;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = fieldset.dataset.name;
    input.value = choice.value;
    input.checked = choice === current;
    const chip = document.createElement('span');
    chip.className = 'ss-plugin-swatch-chip';
    chip.setAttribute('aria-hidden', 'true');
    if (choice.value) chip.style.setProperty('--chip', resolveColor(choice.value));
    const name = document.createElement('span');
    name.className = 'ss-plugin-swatch-name';
    name.textContent = choice.label;
    swatch.append(input, chip, name);
    return swatch;
  }));
}

/**
 * Fills the Icon dropdown: "No icon", then the sheet's `icon` row (options tab), then
 * the current icon when it isn't one of them.
 * @param {string} [selected] the icon to select
 */
function fillIcons(selected) {
  const current = cleanIcon(selected);
  const choices = state.options.icon || [];
  const missing = current && !choices.some((c) => c.value === current);
  iconSelect.replaceChildren(
    new Option(iconSelect.dataset.default, ''),
    ...choices.map((c) => new Option(c.label, c.value)),
    ...(missing ? [new Option(iconLabel(current), current)] : []),
  );
  iconSelect.value = current;
}

function readForm() {
  const data = new FormData(form);
  const url = String(data.get('url') || '').trim();
  const typedNewTab = url.endsWith(NEW_TAB);
  return {
    style: state.preset.style,
    extra: state.extra || state.preset.extra || {},
    label: String(data.get('label') || '').trim(),
    url: typedNewTab ? url.slice(0, -NEW_TAB.length) : url,
    color: cleanColor(data.get('color')),
    textColor: cleanColor(data.get('text-color')),
    newTab: data.get('new-tab') === 'on' || typedNewTab,
    icon: cleanIcon(data.get('icon')),
    iconBefore: data.get('icon-before') === 'on',
  };
}

function updatePreview() {
  const values = readForm();
  preview.replaceChildren(renderButton({ ...values, label: values.label || state.preset.label }));
  iconPreview.style.setProperty('--icon', values.icon ? `url("${iconUrl(values.icon)}")` : 'none');
  form.elements['icon-before'].disabled = !values.icon;
  // eslint-disable-next-line no-use-before-define
  updateSummaries(values);
}

/** The name of the colour picked in a swatch group, or '' for the design's own. */
function pickedColour(fieldset) {
  const input = fieldset.querySelector('input:checked');
  return input?.value ? input.closest('label').title : '';
}

/**
 * Each card's title line says what is set, as in the other views: "Primary button",
 * "Join now", "Orange · White text", "No icon", "Opens in a new tab".
 */
function updateSummaries(values = readForm()) {
  const { dataset } = form;
  const [colour, textColour] = swatchSets.map(pickedColour);
  const colours = [colour, textColour && dataset.textColour.replace('{colour}', textColour)]
    .filter(Boolean).join(' · ');
  const icon = values.icon ? iconSelect.selectedOptions[0]?.textContent : dataset.noIcon;
  const lines = {
    design: state.preset?.name || '',
    text: values.label,
    colours: colours || dataset.defaultColours,
    icon,
    options: values.newTab ? dataset.newTab : dataset.sameTab,
  };
  editor.querySelectorAll('[data-card]').forEach((card) => {
    card.querySelector(':scope > summary .ss-plugin-section-sum').textContent = lines[card.dataset.card] || '';
  });
}

function setError(input, show) {
  const error = document.getElementById(`${input.id}-error`);
  input.setAttribute('aria-invalid', String(show));
  error.textContent = show ? error.dataset.message : '';
}

/**
 * Slides the editor drawer in for one preset.
 * @param {Object} preset the chosen design
 * @param {Object} [values] current values (edit mode, or carried over)
 * @param {Object} [how]
 * @param {boolean} [how.focus] focus the text field (not when opened from a page highlight)
 */
function openEditor(preset, values = {}, { focus = true } = {}) {
  state.preset = preset;
  // an edited button keeps its own fixed extras; a picked design uses the preset's
  state.extra = values.extra && Object.keys(values.extra).length ? values.extra : null;
  // the cards for what this design and the site take: colours, icon, new tab
  const design = styleInfo(preset.style);
  const marked = Boolean(design?.marks.length || design?.option);
  editor.classList.toggle('is-link', !marked);
  editor.classList.toggle('has-colours', state.features.options && marked);
  editor.classList.toggle('has-icons', state.features.icons !== 'no' && Boolean(design?.icons));
  editor.classList.toggle('has-new-tab', state.features.newTab);
  $('#btn-plugin-editor-heading').textContent = preset.name;
  $('.btn-plugin-description').textContent = preset.description;
  form.elements.label.value = values.label ?? preset.label;
  form.elements.url.value = values.url ?? '';
  form.elements['new-tab'].checked = Boolean(values.newTab);
  fillIcons(values.icon ?? preset.icon);
  form.elements['icon-before'].checked = Boolean(values.icon ? values.iconBefore : preset.iconBefore);
  const [colorSet, textColorSet] = swatchSets;
  fillSwatches(colorSet, state.options.color || [], values.color ?? preset.color);
  fillSwatches(textColorSet, state.options['text-color'] || [], values.textColor ?? preset.textColor);
  [form.elements.label, form.elements.url].forEach((input) => setError(input, false));
  updatePreview();

  editor.inert = false;
  gallery.inert = true;
  editor.classList.add('is-open');
  main.classList.add('is-editing');
  editor.querySelector('.btn-plugin-editor-body').scrollTop = 0;
  showMessage();
  notifyChange();
  // a button opened from a highlight in the page leaves the focus there
  if (focus) form.elements.label.focus({ preventScroll: true });
}

/** Badges the design the drawer was last showing, so authors keep their place. */
function markCurrent() {
  list.querySelectorAll('.btn-plugin-card').forEach((card, i) => {
    const current = state.presets[i] === state.preset;
    card.classList.toggle('is-current', current);
    const pick = card.querySelector('.btn-plugin-pick');
    if (current) pick.setAttribute('aria-current', 'true');
    else pick.removeAttribute('aria-current');
    card.querySelector('.btn-plugin-badge')?.remove();
    if (current) {
      const badge = document.createElement('span');
      badge.className = 'btn-plugin-badge';
      badge.textContent = list.dataset.current;
      card.querySelector('.btn-plugin-sample').append(badge);
    }
  });
}

/**
 * Slides the drawer out, back to the designs.
 * @param {boolean} [focus] focus the design it showed (not when the page cursor moved away)
 */
function closeEditor(focus = true) {
  editor.classList.remove('is-open');
  main.classList.remove('is-editing');
  editor.inert = true;
  gallery.inert = false;
  markCurrent();
  showMessage();
  notifyChange();
  if (!focus) return;
  const index = state.presets.indexOf(state.preset);
  list.querySelectorAll('.btn-plugin-pick')[index]?.focus();
}

/**
 * Switching design keeps what the author already typed (text, link, new tab);
 * the colours follow the new design.
 */
function pickPreset(preset) {
  const values = {};
  if (state.preset) {
    const previous = readForm();
    if (previous.label && previous.label !== state.preset.label) values.label = previous.label;
    values.url = previous.url;
    values.newTab = previous.newTab;
  }
  say(state.actions ? null : 'standalone');
  openEditor(preset, values);
  // editing a page button: the new design reaches the page
  // eslint-disable-next-line no-use-before-define
  scheduleWrite(false);
}

function renderGallery() {
  list.replaceChildren(...state.presets.map((preset) => {
    const li = document.createElement('li');
    li.className = 'btn-plugin-card';
    const sample = document.createElement('div');
    sample.className = 'btn-plugin-sample';
    sample.inert = true;
    sample.append(renderButton(preset));
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'btn-plugin-pick';
    const name = document.createElement('span');
    name.className = 'btn-plugin-name';
    name.textContent = preset.name;
    pick.append(name);
    if (preset.description) {
      const description = document.createElement('span');
      description.className = 'btn-plugin-card-description';
      description.textContent = preset.description;
      pick.append(description);
    }
    const go = document.createElement('span');
    go.className = 'btn-plugin-go';
    go.setAttribute('aria-hidden', 'true');
    pick.append(go);
    pick.addEventListener('click', () => pickPreset(preset));
    li.append(sample, pick);
    return li;
  }));
  markCurrent();
}

/**
 * The preset an existing button most likely came from: same style and
 * colours, else same style, else an ad-hoc one for that style.
 */
function matchPreset(values) {
  const sameExtra = (p) => extraText(p.extra) === extraText(values.extra);
  return state.presets.find((p) => p.style === values.style && sameExtra(p)
      && same(p.color, values.color) && same(p.textColor, values.textColor))
    || state.presets.find((p) => p.style === values.style && sameExtra(p))
    || state.presets.find((p) => p.style === values.style)
    || {
      name: values.style, style: values.style, label: '', description: '',
    };
}

/* ---- two-way editing in the page --------------------------------- */

// what a write's problem says, and whether it ends editing (the cursor isn't on the button)
const OUTCOMES = {
  WRONG_SELECTION: { key: 'moved', stop: true },
  gone: { key: 'left', stop: true },
  restored: { key: 'restored', stop: true },
  replaced: { key: 'replaced', stop: true },
  STALE_LIVE: { key: 'stale' },
  READ_ONLY: { key: 'readOnly' },
  unsupported: { key: 'noReplace' },
  // DA didn't answer: whether the write happened isn't known, so editing stops
  TIMEOUT: { key: 'timeout', stop: true },
};

/** The mode badge and the footer button: editing a page button (live), or adding one. */
function showMode() {
  const live = Boolean(state.editing && state.canEdit);
  modeBadges.forEach((badge) => {
    badge.hidden = !state.canEdit;
    badge.dataset.mode = live ? 'edit' : 'insert';
    badge.textContent = badge.dataset[live ? 'edit' : 'insert'];
  });
  if (live) submit.textContent = submit.dataset.doneEditing;
  else if (state.canEdit || submit.textContent === submit.dataset.doneEditing) {
    submit.textContent = submit.dataset.insert;
  }
  form.setAttribute('aria-busy', String(state.busy));
  notifyChange();
}

// what this panel is doing, for Page Studio's choice of view
registerView('button', () => ({
  editing: Boolean(state.editing),
  busy: state.busy,
  open: isOpen(),
  label: state.editing ? (form.elements.label.value || '').trim() : '',
  blockIndex: state.editing?.scope === 'block' ? state.editing.blockIndex : null,
  addCount: state.addCount,
}));

/**
 * Opens a page button in the form, every property set from its whole paragraph.
 * @param {Object} found findButton()
 * @param {boolean} [refill] the same button changed in the page: refill the form only
 */
function startEdit(found, refill = false) {
  pause.stop();
  state.editing = found;
  const values = parseSelection(found.html);
  if (values) openEditor(matchPreset(values), values, { focus: false });
  if (!refill) say('editLive');
  showMode();
}

/**
 * Stops editing the page button (the page stays as it is); the drawer goes back to the designs.
 * @param {boolean} [focus] the author chose Done in the panel (else the focus stays in the page)
 */
function stopEdit(key, focus = false) {
  pause.stop();
  state.editing = null;
  showMode();
  if (isOpen()) closeEditor(focus);
  say(key);
}

/**
 * Page Studio: the Block view's **Button style** on a button of a block's
 * content opens it here, as a highlight in it would. The highlight in the page now (if any)
 * is set aside, as after Done, so it doesn't end editing at the next look.
 * @param {{blockIndex: number, position: number}} at the block and the button's index among its
 *   button paragraphs (button-doc.js)
 * @returns {boolean} the button is open
 */
function editBlockButton({ blockIndex, position }) {
  if (!state.canEdit || state.busy || !Number.isInteger(blockIndex)) return false;
  const where = { scope: 'block', blockIndex, position };
  const html = currentButton(state.liveHtml, where);
  if (!html) return false;
  state.dismissed = state.seen ?? '';
  startEdit({ ...where, html });
  return true;
}

/** Page Studio: the author went to the block or the section from the path (as Done). */
function finishEditing() {
  if (!state.editing) return;
  state.dismissed = state.seen ?? '';
  stopEdit('doneEditing');
}

registerCommand('button:edit', editBlockButton);
registerCommand('button:done', finishEditing);

/** The two places hold the same button (a highlight of the one already open). */
const sameButton = (a, b) => a.scope === b.scope && (a.scope === 'block'
  ? a.blockIndex === b.blockIndex && a.position === b.position
  : a.positions.some((i) => b.positions.includes(i)));

/**
 * One look at what is highlighted in the page: a highlight in a button opens it; one
 * elsewhere ends editing; a plain caret (getSelection() has nothing) keeps what is open, as
 * DA reports no caret position.
 */
function lookAtSelection(html) {
  if (state.busy || pause.waiting) return; // a change is on its way: it wins
  state.seen = html;
  // after Done the highlight is often still there: only a new one opens a button
  if (state.dismissed !== null) {
    if (html === state.dismissed) return;
    state.dismissed = null;
  }
  const hint = selectionHint(html);
  if (!hint) return;
  const found = findButton(state.liveHtml, state.blockIndex, hint);
  if (found?.ambiguous) {
    if (state.message !== status.dataset.ambiguous) say('ambiguous');
  } else if (found) {
    if (!state.editing || !sameButton(state.editing, found)) startEdit(found);
  } else if (state.editing) {
    stopEdit('left');
  }
}

/** Looks at the highlight every WATCH_MS while the page shows (the shared watch). */
function watchSelection() {
  onSelection(state.actions, lookAtSelection, WATCH_MS);
}

/**
 * The live document or the cursor's block changed. The cursor leaving the button's block (or
 * going into a block, for a button in default content) ends editing; the button changed in the
 * page (typed, Undo) refills the form; the button gone ends editing.
 */
function followLive() {
  const { editing } = state;
  if (!editing || state.busy || pause.waiting) return;
  const inBlock = Number.isInteger(state.blockIndex);
  if ((editing.scope === 'block' && state.blockIndex !== editing.blockIndex)
    || (editing.scope === 'page' && inBlock)) {
    stopEdit('left');
    return;
  }
  const now = currentButton(state.liveHtml, editing);
  if (!now) stopEdit('left');
  else if (now !== editing.html) startEdit({ ...editing, html: now }, true);
}

function onLive({ html, selection }) {
  if (html !== state.liveHtml) {
    state.liveHtml = html;
    liveFeed.notify(html);
  }
  state.blockIndex = selection?.blockIndex ?? null;
  followLive();
}

/** A button in a block: the block is rewritten with only that button changed. */
async function writeInBlock(html) {
  const { editing } = state;
  // retried once on the newer live document when the author typed in the page meanwhile
  const result = await sendInBlock({
    actions: state.actions,
    blockIndex: editing.blockIndex,
    html: () => blockWrite(state.liveHtml, editing, html) || null,
    live: () => state.liveHtml,
    setLive: (next) => { state.liveHtml = next; },
    next: (sent, ms) => liveFeed.next(sent, ms),
  });
  if (!result?.ok) return result?.error || 'failed';
  editing.html = currentButton(state.liveHtml, editing) || editing.html;
  return null;
}

/**
 * The write in default content replaced something other than the button (the cursor had
 * moved): the cursor is now in what the panel wrote, so put back what was there: a section's
 * settings table (the live document holds it as the section's attributes) or the node.
 * @returns {Promise<boolean>} the page is as it was
 */
async function putBack(before, after) {
  const changed = changedSections(before, after);
  let html = null;
  if (changed?.length === 1) {
    const rows = sectionSettings(readDocument(before), changed[0]);
    html = rows.length ? settingsTable(rows) : null;
  } else if (changed?.length === 0) {
    html = removedNode(before, after); // a paragraph, heading, list or picture
  }
  if (!html) return false;
  const { after: restored } = await replaceAtCursor({
    actions: state.actions, html, before: after, next: (h, ms) => liveFeed.next(h, ms), fallback: null,
  });
  if (restored) state.liveHtml = restored;
  return Boolean(restored) && pageContent(restored) === pageContent(before)
    && changedSections(before, restored)?.length === 0;
}

/** A button in default content: the node at the cursor is replaced, then checked. */
async function writeInPage(html) {
  const { editing } = state;
  const before = state.liveHtml;
  const { result, after } = await replaceAtCursor({
    actions: state.actions, html, before, next: (h, ms) => liveFeed.next(h, ms),
  });
  if (!after) return result?.error || 'failed';
  state.liveHtml = after;
  const check = pageWrite(before, after, editing.positions);
  if (check.ok) {
    if (check.position !== null) {
      editing.positions = [check.position];
      editing.html = currentButton(after, editing) || editing.html;
    }
    return null;
  }
  return (await putBack(before, after)) ? 'restored' : 'replaced';
}

/** One write, in a block or in default content: its problem, or null. */
async function tryWrite(editing, html) {
  try {
    return editing.scope === 'block' ? await writeInBlock(html) : await writeInPage(html);
  } catch {
    return 'failed';
  }
}

/** Writes the form to the page button being edited. */
async function writeButton() {
  pause.done();
  const { editing } = state;
  if (!editing || !state.canEdit) return;
  if (state.busy) {
    state.again = true;
    return;
  }
  const values = readForm();
  const url = cleanUrl(values.url);
  setError(form.elements.label, !values.label);
  setError(form.elements.url, !url);
  if (!values.label || !url) return; // the field says what is missing
  const html = buildHtml({ ...values, url });
  if (html === editing.html) return; // nothing to change
  state.busy = true;
  say('applying');
  showMode();
  const problem = await tryWrite(editing, html);
  state.busy = false;
  const outcome = problem && (OUTCOMES[problem] || { key: 'updateFailed' });
  if (!outcome) say('applied');
  else if (outcome.stop) stopEdit(outcome.key);
  else say(outcome.key);
  showMode();
  if (state.again) {
    state.again = false;
    writeButton();
  } else {
    followLive(); // the cursor may have moved meanwhile
  }
}

/** A change in the form: in edit mode it reaches the page after a short pause. */
function scheduleWrite(typing) {
  if (!state.editing || !state.canEdit) return;
  pause.start(typing);
}

form.addEventListener('input', (e) => {
  // a field's error clears as soon as the author edits it; submit re-checks
  if (e.target.getAttribute('aria-invalid') === 'true') setError(e.target, false);
  updatePreview();
  if (e.isTrusted) scheduleWrite(e.target.type === 'text');
});
form.addEventListener('change', updatePreview);
$('.btn-plugin-back').addEventListener('click', () => closeEditor());
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeEditor();
});
$('.btn-plugin-canvas').addEventListener('change', (e) => {
  preview.dataset.canvas = e.target.value;
});

/** Done (editing a page button): a change still waiting goes in first, then editing ends. */
async function doneEditing() {
  if (pause.waiting) {
    pause.stop();
    await writeButton();
  }
  for (let i = 0; i < 50 && state.busy; i += 1) {
    await timeout(100);
  }
  if (state.editing) {
    state.dismissed = state.seen ?? '';
    stopEdit('doneEditing', true);
  }
}

/**
 * Insert (or Update, in an editor without the live document): one at a time, then back to the
 * designs, ready for the next one. The panel stays open; the author closes it from DA.
 */
async function insertButton(values, url) {
  if (state.inserting) return; // a second click adds no second button
  state.inserting = true;
  submit.disabled = true;
  submit.classList.add('ss-plugin-is-busy');
  try {
    const result = await state.actions.sendHTML(buildHtml({ ...values, url }));
    // an insert may answer nothing (older editors); only a refusal is a failure
    if (result?.ok === false) {
      say(result.error === 'TIMEOUT' ? 'timeout' : 'failed');
      return;
    }
    const updated = submit.textContent === submit.dataset.update;
    // before closeEditor(), which tells Page Studio (it goes home after an add)
    if (!updated) state.addCount += 1;
    submit.textContent = submit.dataset.insert; // the next one is a new button
    closeEditor();
    say(updated ? 'updated' : 'done');
  } catch {
    say('failed');
  } finally {
    state.inserting = false;
    submit.disabled = false;
    submit.classList.remove('ss-plugin-is-busy');
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.editing && state.canEdit) {
    await doneEditing();
    return;
  }
  const values = readForm();
  const url = cleanUrl(values.url);
  setError(form.elements.label, !values.label);
  setError(form.elements.url, !url);
  if (!values.label) { form.elements.label.focus(); return; }
  if (!url) { form.elements.url.focus(); return; }
  if (!state.actions?.sendHTML) { say('standalone'); return; }
  await insertButton(values, url);
});

/**
 * What the site reads besides the marks (configuration): `[…]` options, `#_blank`, icons
 * (`text`: `:name:` in the label; `option`: `icon="name"`; `yes` means `text`).
 */
function readFeatures({ settings, flag }) {
  const icons = String(settings['button-icons']).trim().toLowerCase();
  let iconMode = 'no';
  if (['text', 'option'].includes(icons)) iconMode = icons;
  else if (flag('button-icons')) iconMode = 'text';
  return { options: flag('button-options'), newTab: flag('button-new-tab'), icons: iconMode };
}

async function init() {
  useDefaults();
  renderGallery();
  // the SDK only resolves inside the DA editor; stand alone, show the defaults
  const sdk = await connect();
  if (!sdk) {
    say('standalone');
    submit.disabled = true;
    return;
  }

  const { context, actions, capabilities } = sdk;
  state.actions = trackCursor(actions, (index) => { state.blockIndex = index; });
  const config = await loadConfig(actions, context);
  const { settings } = config;
  state.features = readFeatures(config);
  state.origin = codeOrigin(context, settings);
  state.iconPath = settings['icon-path'].endsWith('/') ? settings['icon-path'] : `${settings['icon-path']}/`;
  loadPreviewCss(settings['preview-css'].split(',').map((path) => path.trim()).filter(Boolean));
  const fromSheet = await loadSheet(context, actions, settings['buttons-sheet']);
  renderGallery();
  say(fromSheet ? null : 'defaults');

  state.canEdit = canEditLive(capabilities, actions) && typeof actions.getSelection === 'function';
  if (state.canEdit) {
    // two-way: the highlight opens a page button, each change is written to it
    onLiveDocument(actions, onLive);
    showMode();
    watchSelection();
    return;
  }

  // edit mode: a selected link opens straight on its design, pre-filled
  let selection = null;
  try {
    if (actions.getSelection) {
      selection = await Promise.race([actions.getSelection(), timeout(1500)]);
    }
  } catch { /* nothing selected */ }
  const values = typeof selection === 'string' ? parseSelection(selection) : null;
  if (values) {
    submit.textContent = submit.dataset.update;
    say('edit');
    openEditor(matchPreset(values), values);
  }
}

init();
