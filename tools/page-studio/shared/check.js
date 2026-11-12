/*
 * Check setup: what in a site's Page Studio setup can't work, or works differently from what it
 * says. Pure (no DOM, no fetch): the Check view (views/check/) runs it on what DA and the site's
 * code answer; tools/page-studio/cli/studio.mjs runs it on files (and also compares each style with
 * the block's CSS).
 *
 * Every finding is { level, area, code, params, text }: level `error` (it can't work), `warning`
 * (it works, not as written) or `info`; text is the English sentence (WORDS, a site may reword).
 */
import { parseValues, parseWhen } from './sheet.js';
import { HEX_COLOR } from './colour.js';
import {
  buildLibrary, resolveBlocks, tabRows, siteBlocks, toName, SECTION, BLOCK_NAME,
} from './library.js';

export const WORDS = {
  'setting-unknown': 'Unknown setting "{key}": it does nothing (see the README for the settings).',
  'setting-value': 'Setting "{key}" has a value that can\'t be used ({problem}): "{value}". The default stays.',
  'site-missing': 'No site file at {url}: blocks and buttons come from the sheets only.',
  'site-unreadable': 'The site file {url} can\'t be read from here (it doesn\'t exist, or the site doesn\'t allow this origin: CORS).',
  'site-invalid': 'The site file {url} isn\'t valid JSON of a site file.',
  'site-version': 'The site file is version {version}; this Page Studio reads version 1.',
  'capability-conflict': 'The sheet sets "{key}" to "{value}", but the site\'s code says "{code}". The sheet wins: check the site renders it.',
  'library-missing': 'No block library: the sheet {path} can\'t be read and there is no site file. The Block and Section views are empty.',
  'block-row-empty': 'Block list row {row} has no path: it is left out.',
  'block-duplicate': 'Block "{block}" is listed twice in the block list.',
  'block-no-code': 'Block "{block}" has no code in the site (/blocks/{block}/{block}.js): it isn\'t offered.',
  'option-no-blocks': 'Option "{key}" (row {row}) names no blocks: it shows nowhere.',
  'option-unknown-block': 'Option "{key}" (row {row}) is for "{block}", which isn\'t in the block library.',
  'option-unknown-group': 'Option "{key}" (row {row}) uses the group "{group}", which the groups tab doesn\'t have.',
  'option-type': 'Option "{key}" (row {row}) has the type "{type}", which Page Studio doesn\'t know: it is shown as a property.',
  'option-no-values': 'Option "{key}" of {block} is a style but has no values: it shows nothing.',
  'option-duplicate': 'Option "{key}" is listed twice for {block}.',
  'option-when': 'Option "{key}" of {block} waits for the style "{style}", which no style row of {block} offers.',
  'option-colour': 'Colour option "{key}" of {block} has a value that isn\'t a colour code: "{value}".',
  'option-not-in-code': '{block}: the sheet offers "{value}" for "{key}", which the block\'s own file (code) doesn\'t list.',
  'option-hidden-nothing': 'Option "{key}" of {block} is hidden, but the block\'s code has no such option.',
  'file-block-name': 'The site file has a block named "{block}": block names are lower case words joined by "-".',
  'file-option-key': 'The site file\'s block {block} has an option without a key.',
  'css-class-missing': '{block}: the style "{value}" ("{key}") isn\'t in the block\'s CSS or script, nor in the site\'s styles.',
};

const TYPES = ['', 'variant', 'variants', 'multi', 'content', 'colour', 'color', 'hidden', 'hide'];
const STYLE_TYPES = ['variant', 'variants'];

/** The finding's sentence: WORDS (or the site's) with {params} filled in. */
export function describe(finding, words = WORDS) {
  const template = words[finding.code] || WORDS[finding.code] || finding.code;
  return template.replace(/\{(\w+)\}/g, (all, name) => String(finding.params?.[name] ?? all));
}

function collector() {
  const findings = [];
  const add = (level, area, code, params = {}) => {
    const finding = {
      level, area, code, params,
    };
    finding.text = describe(finding);
    findings.push(finding);
  };
  return { findings, add };
}

const lower = (text) => String(text ?? '').trim().toLowerCase();

function checkSettings(add, { settingsRows = [], settingProblem }) {
  settingsRows.forEach((row) => {
    const key = lower(row.key);
    const value = String(row.value ?? '').trim();
    if (!key || !value) return;
    const problem = settingProblem(key, value);
    if (problem === 'unknown') add('warning', 'settings', 'setting-unknown', { key });
    else if (problem) {
      add('error', 'settings', 'setting-value', { key, value, problem });
    }
  });
}

function checkSite(add, { site, settingsRows = [] }) {
  if (!site || site.status === 'off') return;
  const { url, data } = site;
  if (site.status === 'missing') add('info', 'site', 'site-missing', { url });
  else if (site.status === 'unreadable') add('warning', 'site', 'site-unreadable', { url });
  else if (site.status === 'invalid') add('error', 'site', 'site-invalid', { url });
  if (!data) return;
  if (data.version !== undefined && data.version !== 1) {
    add('warning', 'site', 'site-version', { version: data.version });
  }
  const capabilities = data.capabilities && typeof data.capabilities === 'object' ? data.capabilities : {};
  const said = Object.fromEntries(settingsRows.map((r) => [lower(r.key), lower(r.value)]));
  ['button-options', 'button-new-tab', 'button-icons'].forEach((key) => {
    if (!said[key] || !(key in capabilities)) return;
    const raw = capabilities[key];
    let code = lower(raw);
    if (typeof raw === 'boolean') code = raw ? 'yes' : 'no';
    const on = (v) => !['no', 'false', 'off', '0', ''].includes(v);
    if (on(said[key]) !== on(code) || (key === 'button-icons' && on(code) && said[key] !== code
      && ['text', 'option'].includes(said[key]))) {
      add('warning', 'settings', 'capability-conflict', { key, value: said[key], code });
    }
  });
  Object.keys(data.blocks && typeof data.blocks === 'object' ? data.blocks : {}).forEach((name) => {
    if (!BLOCK_NAME.test(name)) add('error', 'site', 'file-block-name', { block: name });
  });
  Object.entries(siteBlocks(data)).forEach(([name, def]) => {
    (Array.isArray(def?.options) ? def.options : []).forEach((option) => {
      if (!String(option?.key ?? '').trim()) add('error', 'site', 'file-option-key', { block: name });
    });
  });
}

function checkBlockList(add, json, codeBlocks) {
  const seen = new Set();
  tabRows(json, 'data').forEach((row, i) => {
    const name = toName(String(row.path || '').split('/').pop() || '');
    if (!name) { add('warning', 'library', 'block-row-empty', { row: i + 2 }); return; }
    if (seen.has(name)) add('warning', 'library', 'block-duplicate', { block: name });
    seen.add(name);
  });
  if (codeBlocks) {
    [...seen].filter((name) => name !== SECTION && !codeBlocks.has(name))
      .forEach((block) => add('warning', 'library', 'block-no-code', { block }));
  }
}

/** The options tab's own mistakes, row by row (the sheet's row number: the header is row 1). */
function checkOptionRows(add, json, library) {
  tabRows(json, 'options').forEach((row, i) => {
    if (!row.key) return;
    const at = { key: row.key, row: i + 2 };
    if (!row.blocks) { add('warning', 'library', 'option-no-blocks', at); return; }
    resolveBlocks(row.blocks, library.all, library.groups, (group) => {
      add('error', 'library', 'option-unknown-group', { ...at, group: group.slice(1) });
    });
    row.blocks.split(',').map((t) => t.trim().replace(/^[-!]/, '').trim())
      .filter((t) => t && t !== '*' && !t.startsWith('@'))
      .map(toName)
      .filter((name) => !library.all.includes(name))
      .forEach((block) => add('warning', 'library', 'option-unknown-block', { ...at, block }));
    if (!TYPES.includes(lower(row.type))) {
      add('warning', 'library', 'option-type', { ...at, type: row.type });
    }
  });
}

/** One block's merged rows: values, duplicates, `when`, colours, and the sheet against the code. */
function checkBlockRows(add, name, rows, fileRowsOf) {
  const block = name;
  const styles = new Set(rows.filter((r) => STYLE_TYPES.includes(lower(r.type)))
    .flatMap((r) => parseValues(r.values || '').map((c) => toName(c.value))));
  const keys = new Set();
  rows.forEach((row) => {
    const type = lower(row.type);
    const key = lower(row.key);
    if (type === 'content') return;
    const params = { key: row.key, block };
    if (keys.has(key)) add('warning', 'library', 'option-duplicate', params);
    keys.add(key);
    const choices = parseValues(row.values || '');
    if (STYLE_TYPES.includes(type) && !choices.length) add('error', 'library', 'option-no-values', params);
    if (['colour', 'color'].includes(type)) {
      choices.filter((c) => !HEX_COLOR.test(c.value))
        .forEach((c) => add('warning', 'library', 'option-colour', { ...params, value: c.value }));
    }
    const when = parseWhen(row.when || '', toName);
    if (name !== SECTION) {
      [...when.row, ...Object.values(when.choice).flat()].filter((style) => !styles.has(style))
        .forEach((style) => add('warning', 'library', 'option-when', { ...params, style }));
    }
    const own = fileRowsOf(name).find((r) => lower(r.key) === key);
    if (own && STYLE_TYPES.includes(type)) {
      const coded = new Set(parseValues(own.values || '').map((c) => toName(c.value)));
      choices.map((c) => toName(c.value)).filter((v) => coded.size && !coded.has(v))
        .forEach((value) => add('warning', 'library', 'option-not-in-code', { ...params, value }));
    }
  });
}

/** Sheet rows that hide an option the code doesn't have. */
function checkHidden(add, json, library, fileRowsOf) {
  tabRows(json, 'options').filter((row) => row.key && ['hidden', 'hide'].includes(lower(row.type)))
    .forEach((row) => {
      resolveBlocks(row.blocks, library.all, library.groups).forEach((block) => {
        if (!fileRowsOf(block).some((r) => lower(r.key) === lower(row.key))) {
          add('info', 'library', 'option-hidden-nothing', { key: row.key, block });
        }
      });
    });
}

/**
 * Does the site's code use the style? A `.value` (or `.block-value`) rule, or the value quoted in
 * the block's script (`classList.contains('autoplay')`).
 */
function usesStyle(code, block, value) {
  const name = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\.(?:${block}-)?${name}(?![\\w-])`).test(code)
    || new RegExp(`['"\`]${name}['"\`]`).test(code);
}

/**
 * Each style of a block's rows against the site's code (`code`: block name → the text to look in:
 * the block's CSS and script, and the site's global CSS for the utility classes).
 */
function checkCss(add, library, code) {
  Object.entries(code).forEach(([block, text]) => {
    if (typeof text !== 'string') return;
    library.rowsFor(block).filter((r) => STYLE_TYPES.includes(lower(r.type))).forEach((row) => {
      parseValues(row.values || '').map((c) => toName(c.value))
        .filter((value) => !usesStyle(text, block, value))
        .forEach((value) => add('warning', 'css', 'css-class-missing', { block, key: row.key, value }));
    });
  });
}

/**
 * @param {Object} input
 * @param {Object[]} [input.settingsRows] the configuration's settings tab as written
 * @param {function(string, string): string|null} input.settingProblem shared/da.js settingProblem
 * @param {{status: string, url: string, data: Object|null}} [input.site] readSiteFile()
 * @param {Object|null} [input.library] the library sheet JSON (null: it can't be read)
 * @param {string} [input.libraryPath] the library sheet's path, for the message
 * @param {Set<string>|null} [input.codeBlocks] blocks whose code exists, when known
 * @param {Object<string, string>} [input.css] block name → its CSS, when known (command line)
 * @returns {Object[]} the findings, errors first
 */
export function checkSetup(input) {
  const { add, findings } = collector();
  const json = input.library || null;
  const site = input.site?.data || null;
  checkSettings(add, input);
  checkSite(add, input);
  if (!json && !Object.keys(siteBlocks(site)).length) {
    add('error', 'library', 'library-missing', { path: input.libraryPath || '' });
  }
  const library = buildLibrary(json, site);
  const fileOnly = buildLibrary(null, site);
  const fileRowsOf = (name) => fileOnly.rowsFor(name);
  checkBlockList(add, json, input.codeBlocks || null);
  checkOptionRows(add, json, library);
  library.all.forEach((name) => checkBlockRows(add, name, library.rowsFor(name), fileRowsOf));
  checkHidden(add, json, library, fileRowsOf);
  if (input.css) checkCss(add, library, input.css);
  const order = { error: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => order[a.level] - order[b.level]);
}
