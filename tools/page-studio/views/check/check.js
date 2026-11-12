/*
 * Page Studio — the Check view (also a DA panel on its own): runs shared/check.js on what this
 * site's DA and code answer — the configuration sheet, the block library sheet, the site file
 * (`site-file`) and, where Page Studio may ask the code (`check-blocks`), which blocks have code —
 * and lists what can't work, one card per area. It reads only; it changes nothing.
 */
import {
  connect, loadConfig, readSheet, codeOrigin, registerView, NO_STALE,
} from '../../shared/da.js';
import { settingProblem } from '../../shared/config.js';
import { checkSetup, WORDS } from '../../shared/check.js';
import { buildLibrary, SECTION } from '../../shared/library.js';
import { settingsCard } from '../../shared/ui.js';
import messages from './check.messages.js';
import { applyMessages, applySiteMessages } from '../../shared/messages.js';

// the view's words (its messages module), on the page before anything reads them
applyMessages(messages);

const $ = (selector) => document.querySelector(selector);
const status = $('.ss-plugin-status');
const summary = $('.ck-summary');
const results = $('.ck-results');
const sources = $('.ck-sources');
const again = $('.ck-again');
const AREAS = ['settings', 'site', 'library', 'css'];

const state = { sdk: null, running: false, count: 0 };

/** Which of the library's blocks have code (`/blocks/<name>/<name>.js`), or null when unknown. */
async function codeBlocks(names, context, settings) {
  const origin = codeOrigin(context, settings);
  const mode = settings['check-blocks'];
  const allowed = mode === 'yes' || (mode === 'auto' && origin === window.location.origin);
  if (!allowed) return null;
  const found = await Promise.all(names.map(async (name) => {
    try {
      const resp = await fetch(`${origin}/blocks/${name}/${name}.js`, { method: 'HEAD' });
      return resp.ok ? name : null;
    } catch {
      return null;
    }
  }));
  return new Set(found.filter(Boolean));
}

/**
 * The site's own words for the findings: the configuration's `messages` tab, rows of view `check`
 * and element `finding` (message: the finding's code, e.g. `site-missing`).
 */
function wordsOf(tabs) {
  const words = { ...WORDS };
  (tabs.messages || []).forEach((row) => {
    if (String(row.view || '').toLowerCase() === 'check' && row.element === 'finding'
      && WORDS[row.message] && row.text) {
      words[row.message] = row.text;
    }
  });
  return words;
}

function renderSources(rows) {
  sources.replaceChildren(...rows.flatMap(([term, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    return [dt, dd];
  }));
  sources.hidden = false;
}

function renderFindings(findings) {
  const { dataset } = results;
  const cards = AREAS.map((area) => [area, findings.filter((f) => f.area === area)])
    .filter(([, list]) => list.length)
    .map(([area, list]) => {
      const { card, body } = settingsCard(dataset[area] || area);
      card.querySelector('.ss-plugin-section-sum').textContent = String(list.length);
      const ul = document.createElement('ul');
      ul.className = 'ck-list';
      ul.append(...list.map((finding) => {
        const li = document.createElement('li');
        li.className = 'ck-item';
        li.dataset.level = finding.level;
        const level = document.createElement('span');
        level.className = 'ck-level';
        level.textContent = `${dataset[finding.level] || finding.level}:`;
        li.append(level, document.createTextNode(` ${finding.text}`));
        return li;
      }));
      body.append(ul);
      return card;
    });
  results.replaceChildren(...cards);
  results.hidden = cards.length === 0;
  const count = (level) => findings.filter((f) => f.level === level).length;
  const errors = count('error');
  const warnings = count('warning');
  summary.textContent = errors + warnings + count('info') === 0 ? summary.dataset.good
    : summary.dataset.found.replace('{errors}', errors).replace('{warnings}', warnings)
      .replace('{notes}', count('info'));
  let tone = 'success';
  if (errors) tone = 'error';
  else if (warnings) tone = 'warning';
  summary.dataset.tone = tone;
  summary.hidden = false;
}

async function run() {
  if (state.running || !state.sdk) return;
  state.running = true;
  again.disabled = true;
  status.textContent = status.dataset.loading;
  try {
    const { context, actions } = state.sdk;
    const config = await loadConfig(actions, context);
    applySiteMessages(config.tabs, 'check');
    const { settings } = config;
    const library = await readSheet(actions, context, settings['library-sheet'], NO_STALE);
    const names = buildLibrary(library, config.site.data).entries.map((b) => b.name)
      .filter((name) => name !== SECTION);
    const findings = checkSetup({
      settingsRows: config.rows,
      settingProblem,
      site: config.site,
      library,
      libraryPath: settings['library-sheet'],
      codeBlocks: await codeBlocks(names, context, settings),
    });
    const words = wordsOf(config.tabs);
    findings.forEach((f) => {
      if (words[f.code] !== WORDS[f.code]) {
        f.text = words[f.code].replace(/\{(\w+)\}/g, (all, k) => String(f.params?.[k] ?? all));
      }
    });
    renderFindings(findings);
    const { dataset } = sources;
    const { status: siteStatus, url } = config.site;
    const siteWord = dataset[`site${siteStatus[0].toUpperCase()}${siteStatus.slice(1)}`] || siteStatus;
    renderSources([
      [dataset.librarySheet, settings['library-sheet']],
      [dataset.siteFile, `${url || settings['site-file']} (${siteWord})`],
      [dataset.code, codeOrigin(context, settings)],
    ]);
    status.textContent = '';
    state.count += 1;
  } finally {
    state.running = false;
    again.disabled = false;
    again.hidden = false;
  }
}

again.addEventListener('click', run);

async function init() {
  registerView('check', () => ({ busy: state.running, checks: state.count }));
  state.sdk = await connect();
  if (!state.sdk) {
    status.textContent = status.dataset.standalone;
    return;
  }
  await run();
}

init();
