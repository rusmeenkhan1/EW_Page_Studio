#!/usr/bin/env node
/**
 * studio.mjs — Page Studio's command line, for a site's code repository (default: the current
 * folder; `--root <folder>` for another one). It keeps what the site's code supports next to the code:
 *
 *   blocks/<name>/<name>.studio.json   one per block: its styles, options, properties, content names
 *   page-studio.site.json              the site's capabilities (button options, new tab, icons…)
 *                                      and its section settings (`section`)
 *   page-studio.json                   built from the two above (`build`): the one file Page Studio
 *                                      reads from the site's code (setting `site-file`)
 *
 * Commands:
 *   draft [--force] [--block <name>]   draft block files from each block CSS's `==== variants ====`
 *                                      part (each comment starts a group); review them
 *   from-sheet <sheet.json> [--force]  block files (and the site file's `section`) from an existing
 *                                      DA library sheet (its `options` tab): to move a site over
 *   build [--check]                    write page-studio.json (`--check`: fail when it is out of date)
 *   check [--sheet <library.json>] [--settings <page-studio.json>]
 *                                      the setup checks of the Check view, plus each style against
 *                                      the block's CSS and page-studio.json being up to date
 *   sheet [--out <file>]               the DA library sheet's `options` tab from the block files, for a
 *                                      site whose code Page Studio can't read (no CORS): upload it to DA
 *
 * Writes only in the repository (never to DA); exit code 1 when a check fails.
 */
/* eslint-disable no-console -- a command-line tool */
import {
  readFileSync, writeFileSync, existsSync, readdirSync, statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { checkSetup } from '../shared/check.js';
import { settingProblem } from '../shared/config.js';
import { parseValues } from '../shared/sheet.js';
import {
  toName, tabRows, resolveBlocks, parseGroups, SECTION, BLOCK_NAME,
} from '../shared/library.js';

const args = process.argv.slice(2);
const command = args[0];
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at > 0 ? args[at + 1] : undefined;
};
const has = (name) => args.includes(`--${name}`);
const ROOT = resolve(option('root') || process.cwd());
const SITE_SOURCE = join(ROOT, 'page-studio.site.json');
const SITE_FILE = join(ROOT, 'page-studio.json');
const BLOCKS = join(ROOT, 'blocks');

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
const studioFile = (name) => join(BLOCKS, name, `${name}.studio.json`);
const title = (text) => text.replace(/[-_]+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());

/** The block folders (`blocks/<name>/` with `<name>.js`). */
function blockNames() {
  if (!existsSync(BLOCKS)) return [];
  return readdirSync(BLOCKS).filter((name) => BLOCK_NAME.test(name)
    && statSync(join(BLOCKS, name)).isDirectory() && existsSync(join(BLOCKS, name, `${name}.js`)))
    .sort();
}

/* ---- draft: from the CSS -------------------------------------------------- */

/** The `==== variants ====` part of a block's CSS (to the next `==== … ====` marker), or ''. */
function variantsPart(css) {
  const start = css.search(/\/\*\s*=+\s*variants\s*=+\s*\*\//i);
  if (start < 0) return '';
  const rest = css.slice(start).replace(/^\/\*[\s\S]*?\*\//, '');
  const end = rest.search(/\/\*\s*=+\s*[\w -]+=+\s*\*\//);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * Groups of a block's variant classes: each comment in the variants part starts a group,
 * named by the comment's text before `:` (else its first words); the classes of `.name.class`
 * selectors up to the next comment are its values. One class: options (checkboxes); more: a style.
 */
export function draftFromCss(name, css) {
  const part = variantsPart(css);
  if (!part) return null;
  const groups = [];
  let current = null;
  const seen = new Set();
  const pattern = new RegExp(`\\/\\*([\\s\\S]*?)\\*\\/|\\.${name}\\.([a-z0-9-]+)`, 'g');
  [...part.matchAll(pattern)].forEach(([, comment, cls]) => {
    if (comment !== undefined) {
      const text = comment.trim();
      const head = (text.split(':')[0] || text).split(/[(,.;]/)[0].trim();
      current = { key: toName(head).split('-').slice(0, 3).join('-') || 'style', label: title(head), values: [] };
      groups.push(current);
      return;
    }
    if (seen.has(cls)) return;
    seen.add(cls);
    if (!current) {
      current = { key: 'style', label: 'Style', values: [] };
      groups.push(current);
    }
    current.values.push(cls);
  });
  const keys = new Set();
  const options = groups.filter((g) => g.values.length).map((g) => {
    let { key } = g;
    for (let n = 2; keys.has(key); n += 1) key = `${g.key}-${n}`;
    keys.add(key);
    return {
      key,
      type: g.values.length > 1 ? 'variant' : 'variants',
      label: g.label,
      values: Object.fromEntries(g.values.map((v) => [v, title(v)])),
    };
  });
  return options.length ? { label: title(name), options } : null;
}

function draft() {
  const only = option('block');
  let written = 0;
  blockNames().filter((name) => !only || name === only).forEach((name) => {
    const cssFile = join(BLOCKS, name, `${name}.css`);
    if (!existsSync(cssFile)) return;
    const file = studioFile(name);
    if (existsSync(file) && !has('force')) {
      console.log(`· ${name}: ${name}.studio.json exists (--force to replace)`);
      return;
    }
    const def = draftFromCss(name, readFileSync(cssFile, 'utf8'));
    if (!def) {
      console.log(`· ${name}: no "==== variants ====" part in its CSS`);
      return;
    }
    writeJson(file, def);
    written += 1;
    console.log(`✓ ${name}: ${def.options.length} option rows drafted — review the labels`);
  });
  console.log(`${written} block file(s) written. Next: review them, then \`build\`.`);
}

/* ---- from-sheet: from an existing library sheet ------------------------------ */

/** A sheet row as a block file's option (values as `{ value: label }`, other cells as written). */
function optionOf(row) {
  const out = { key: row.key };
  if (row.type) out.type = row.type;
  if (row.label) out.label = row.label;
  const choices = parseValues(row.values || '');
  const example = choices.length === 1 && choices[0].label === choices[0].value
    && !['variant', 'variants'].includes(row.type.toLowerCase());
  if (choices.length && !example) {
    out.values = Object.fromEntries(choices.map(({ label, value }) => [value, label]));
  } else if (row.values) {
    out.values = row.values; // one example text: kept as written
  }
  if (row.when) out.when = row.when;
  if (row.description) out.description = row.description;
  return out;
}

function fromSheet() {
  const sheetFile = args[1];
  if (!sheetFile || !existsSync(sheetFile)) {
    console.error('usage: studio.mjs from-sheet <library-sheet.json> [--force]');
    process.exit(2);
  }
  const json = readJson(sheetFile);
  const names = [...new Set([...blockNames(), ...tabRows(json, 'data')
    .map((row) => toName(String(row.path || '').split('/').pop() || '')).filter(Boolean)])];
  const all = [...new Set([...names, SECTION])];
  const groups = parseGroups(json);
  const labels = Object.fromEntries(tabRows(json, 'data')
    .map((row) => [toName(String(row.path || '').split('/').pop() || ''), row.name]));
  const defs = {};
  const shared = [];
  tabRows(json, 'options').filter((row) => row.key).forEach((row) => {
    const targets = resolveBlocks(row.blocks, all, groups);
    // a row for several blocks stays one row: the site file's `shared` (build expands it)
    if (targets.size > 1 && !targets.has(SECTION) && row.type.toLowerCase() !== 'content') {
      shared.push({ blocks: row.blocks, ...optionOf(row) });
      targets.forEach((name) => { defs[name] ||= { label: labels[name] || title(name), options: [] }; });
      return;
    }
    targets.forEach((name) => {
      defs[name] ||= { label: labels[name] || title(name), options: [] };
      if (row.type.toLowerCase() === 'content') {
        defs[name].content = {
          ...defs[name].content,
          ...Object.fromEntries(parseValues(row.values || '').map(({ label, value }) => [label, value])),
        };
      } else {
        defs[name].options.push(optionOf(row));
      }
    });
  });
  Object.entries(defs).forEach(([name, def]) => {
    if (name === SECTION) return;
    const file = studioFile(name);
    if (!existsSync(join(BLOCKS, name))) {
      console.log(`· ${name}: no blocks/${name}/ folder in this repository (skipped)`);
      return;
    }
    if (existsSync(file) && !has('force')) {
      console.log(`· ${name}: ${name}.studio.json exists (--force to replace)`);
      return;
    }
    writeJson(file, def);
    console.log(`✓ ${name}: ${def.options.length} option rows${def.content ? ' + content names' : ''}`);
  });
  const site = existsSync(SITE_SOURCE) ? readJson(SITE_SOURCE) : { version: 1, capabilities: {} };
  const parts = [
    ['section', defs[SECTION] && { options: defs[SECTION].options }],
    ['shared', shared.length && shared],
    ['groups', Object.keys(groups).length && groups],
  ];
  let changed = false;
  parts.filter(([, value]) => value).forEach(([part, value]) => {
    if (site[part] && !has('force')) {
      console.log(`· ${part}: page-studio.site.json has one (--force to replace)`);
      return;
    }
    site[part] = value;
    changed = true;
    console.log(`✓ ${part} in page-studio.site.json`);
  });
  if (changed) writeJson(SITE_SOURCE, site);
  console.log('Next: `build`, then keep in the sheet only what authors change (labels, help, hidden rows).');
}

/* ---- build: the site file --------------------------------------------------- */

/**
 * page-studio.json from the block files and page-studio.site.json. The site source's `shared`
 * options (each with a `blocks` cell: names, `*` = every block with a block file, `@group` from
 * its `groups`, `-name`) go first into each block they are for.
 */
function siteFile() {
  const source = existsSync(SITE_SOURCE) ? readJson(SITE_SOURCE) : {};
  const blocks = {};
  blockNames().forEach((name) => {
    if (existsSync(studioFile(name))) blocks[name] = readJson(studioFile(name));
  });
  const names = Object.keys(blocks);
  const groups = source.groups && typeof source.groups === 'object' ? source.groups : {};
  const sharedFor = (name) => (Array.isArray(source.shared) ? source.shared : [])
    .filter((o) => resolveBlocks(o.blocks, names, groups).has(name))
    .map(({ blocks: cell, ...o }) => o);
  names.forEach((name) => {
    const own = Array.isArray(blocks[name].options) ? blocks[name].options : [];
    blocks[name] = { ...blocks[name], options: [...sharedFor(name), ...own] };
  });
  if (source.section) blocks[SECTION] = source.section;
  return {
    version: 1,
    generated: 'by tools/page-studio/cli/studio.mjs build — edit blocks/*/*.studio.json and page-studio.site.json',
    capabilities: source.capabilities || {},
    blocks,
  };
}

const stale = () => !existsSync(SITE_FILE)
  || JSON.stringify(readJson(SITE_FILE)) !== JSON.stringify(siteFile());

function build() {
  if (has('check')) {
    if (stale()) {
      console.log('✗ page-studio.json is out of date: run `studio.mjs build`');
      process.exit(1);
    }
    console.log('✓ page-studio.json is up to date');
    return;
  }
  const data = siteFile();
  writeJson(SITE_FILE, data);
  console.log(`✓ page-studio.json: ${Object.keys(data.blocks).length} block(s), capabilities ${JSON.stringify(data.capabilities)}`);
}

/* ---- check ---------------------------------------------------------------- */

function check() {
  const sheet = option('sheet');
  const settings = option('settings');
  const library = sheet ? readJson(sheet) : null;
  const config = settings ? readJson(settings) : null;
  const settingsRows = config?.settings?.data || (Array.isArray(config?.data) ? config.data : []);
  const names = blockNames();
  // where a style can be: the block's CSS and script, and the site's global styles (utilities)
  const styles = join(ROOT, 'styles');
  const global = existsSync(styles) ? readdirSync(styles).filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(join(styles, f), 'utf8')).join('\n') : '';
  const own = (n, ext) => (existsSync(join(BLOCKS, n, `${n}.${ext}`))
    ? readFileSync(join(BLOCKS, n, `${n}.${ext}`), 'utf8') : '');
  const css = Object.fromEntries(names.map((n) => [n, `${own(n, 'css')}\n${own(n, 'js')}\n${global}`]));
  const findings = checkSetup({
    settingsRows,
    settingProblem,
    site: { status: 'ok', url: 'page-studio.json', data: siteFile() },
    library,
    libraryPath: sheet || '(no --sheet given)',
    codeBlocks: library ? new Set(names) : null,
    css,
  }).filter((f) => sheet || f.code !== 'library-missing');
  if (stale()) {
    findings.unshift({ level: 'error', text: 'page-studio.json is out of date: run `studio.mjs build`.' });
  }
  const mark = { error: '✗', warning: '!', info: '·' };
  findings.forEach((f) => console.log(`${mark[f.level]} ${f.text}`));
  const errors = findings.filter((f) => f.level === 'error').length;
  const warnings = findings.filter((f) => f.level === 'warning').length;
  console.log(`${errors} error(s), ${warnings} warning(s)`);
  process.exit(errors || (has('strict') && warnings) ? 1 : 0);
}

/* ---- sheet: the options tab for DA -------------------------------------------- */

function sheetTab() {
  const data = siteFile();
  const cell = (v) => {
    if (!v) return '';
    if (typeof v === 'string') return v;
    return Object.entries(v).map(([value, label]) => (label === value ? value : `${label}=${value}`)).join(' | ');
  };
  const rows = Object.entries(data.blocks).flatMap(([name, def]) => [
    ...(def.options || []).map((o) => ({
      key: o.key,
      blocks: name,
      values: cell(o.values),
      type: o.type || '',
      label: o.label || '',
      when: typeof o.when === 'string' ? o.when : '',
      description: typeof o.description === 'string' ? o.description : '',
    })),
    ...(def.content ? [{
      key: 'content', blocks: name, values: cell(Object.fromEntries(Object.entries(def.content).map(([part, n]) => [n, part]))), type: 'content', label: '', when: '', description: '',
    }] : []),
  ]);
  const out = option('out') || 'library-options.json';
  writeJson(out, {
    options: {
      total: rows.length, offset: 0, limit: rows.length, data: rows,
    },
    ':names': ['options'],
    ':version': 3,
    ':type': 'multi-sheet',
  });
  console.log(`✓ ${out}: ${rows.length} option rows (the library sheet's options tab)`);
}

const COMMANDS = {
  draft, 'from-sheet': fromSheet, build, check, sheet: sheetTab,
};
if (!COMMANDS[command]) {
  console.error('usage: studio.mjs draft | from-sheet <sheet.json> | build [--check] | check [--sheet f] [--settings f] [--strict] | sheet [--out f]   [--root <repo>]');
  process.exit(2);
}
COMMANDS[command]();
