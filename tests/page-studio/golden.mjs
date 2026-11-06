#!/usr/bin/env node
/**
 * golden.mjs — drives Page Studio (tools/page-studio: the shell and its Block, Button and Section
 * views) with a mocked DA SDK and records what each view shows and sends, so a change can prove
 * it changed nothing (or exactly what it meant to change).
 *
 *   node tests/page-studio/golden.mjs --save <dir>      record a baseline
 *   node tests/page-studio/golden.mjs --compare <dir>   fail on any difference from it
 *
 * Needs the dev server (BASE_URL, default http://localhost:3000); CHROMIUM_PATH picks a browser
 * when Playwright's own is not installed; ONLY=<part of a name> runs some cases. The mock SDK
 * answers daFetch() from tests/page-studio/fixtures/ (a neutral demo customer, demo-org /
 * demo-site), records sendHTML() and replies from a per-case queue (with DA's answer variants:
 * delay, liveFirst, broadcast, hang), and sends the case's live document to
 * subscribeLiveDocument(). getSelection() and the periodic saved-source reads are timing-
 * dependent, so they are not recorded in order (daFetch URLs are kept as a sorted set).
 *
 * AXE=1 also runs axe-core after each case's last step, with the rules of tests/a11y (WCAG 2.0–2.2
 * A + AA), and fails on critical or serious violations. Its result is not part of the baseline.
 */
/* eslint-disable no-console -- a command-line report */
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import a11y from '../a11y/a11y.config.js';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(HERE, 'fixtures', name), 'utf8');
const SOURCE = 'https://admin.da.live/source/demo-org/demo-site';
const CONTEXT = { org: 'demo-org', repo: 'demo-site', path: '/drafts/test' };
const LIVE = { liveDocument: 1, sendHTMLReplace: 1 };
const WAIT = 15000;

const FILES = {
  [`${SOURCE}/.da/library/blocks.json`]: fixture('library-blocks.json'),
  [`${SOURCE}/.da/library/buttons.json`]: fixture('buttons.json'),
  [`${SOURCE}/.da/library/blocks/cards.html`]: fixture('cards.html'),
  [`${SOURCE}/.da/library/blocks/hero.html`]: fixture('hero.html'),
  // the customer's configuration: colours, new tab and icons on (the default cases switch it off)
  [`${SOURCE}/.da/library/page-studio.json`]: fixture('page-studio.json'),
  [`${SOURCE}/drafts/test.html`]: '<body><header></header><main><div><p>Hello</p></div></main></body>',
};

// the SDK module the panels import; its settings come from window.mockConfig (addInitScript)
const SDK = `
const cfg = window.mockConfig;
const calls = [];
window.mockCalls = calls;
let listener = null;
const actions = {
  daFetch: async (url, opts = {}) => {
    calls.push(['daFetch', url, opts.method || 'GET']);
    const body = cfg.files[url];
    return new Response(body ?? '', { status: body === undefined ? 404 : 200 });
  },
  sendHTML: async (html, options) => {
    calls.push(['sendHTML', html, options ? JSON.stringify(options) : '']);
    // as in DA, a write collapses the highlight
    if (cfg.clearSelection) cfg.selection = '';
    const reply = cfg.replies.length ? cfg.replies.shift() : { ok: true };
    // DA's ways of answering (robustness, D-130): no answer at all; the live document before the
    // answer; a late answer; the live document broadcast after it
    const { hang, liveFirst, delay = 0, broadcast, ...answer } = reply;
    if (hang) return new Promise(() => {});
    const message = reply.live || (answer.html && { html: answer.html, selection: answer.selection });
    if (liveFirst && message && listener) listener(message);
    if (delay) await new Promise((resolve) => { setTimeout(resolve, delay); });
    if ((reply.live || broadcast) && !liveFirst && message && listener) {
      setTimeout(() => listener(message), 0);
    }
    delete answer.live;
    return answer;
  },
  getSelection: async () => cfg.selection,
};
if (cfg.capabilities) {
  actions.subscribeLiveDocument = (fn) => {
    listener = fn;
    if (cfg.live) setTimeout(() => fn(cfg.live), 0);
  };
}
window.pushLive = (message) => listener?.(message);
export default Promise.resolve(cfg.standalone ? {} : {
  context: cfg.context, actions, capabilities: cfg.capabilities, token: '',
});
`;

const page2 = (html) => `<main>${html}</main>`;
// a Cards block with a button, in the page's second section
const CARDS = '<main><div><p>Intro</p></div><div><div class="cards news" data-block-index="0"><div><div><p>March 25, 2026</p><h3>News</h3><p><strong><em><a href="/join">Join now</a></em></strong></p></div></div></div></div></main>';
// the same block in a section with settings (a blue band, centred)
const CARDS_IN_BAND = '<main><div><p>Intro</p></div><div class="center" data-background="#e2f7ff"><div class="cards news" data-block-index="0"><div><div><p>March 25, 2026</p><h3>News</h3><p><strong><em><a href="/join">Join now</a></em></strong></p></div></div></div></div></main>';
// an accent button (bold + italic) with colours, opening in a new tab
const BUTTON = '<p><strong><em><a href="/give#_blank">Give</a></em></strong> [color=&#34;#e87722&#34;, text-color=&#34;#ffffff&#34;]</p>';

/** @returns {Promise<string[]>} the critical / serious axe violations on the page */
async function axeViolations(page) {
  let builder = new AxeBuilder({ page }).withTags(a11y.wcagTags);
  (a11y.excludeSelectors || []).forEach((selector) => { builder = builder.exclude(selector); });
  const rules = Object.fromEntries(Object.entries(a11y.disabledRules || {})
    .map(([id, enabled]) => [id, { enabled }]));
  const { violations } = await builder.options({ rules }).analyze();
  return violations.filter((v) => a11y.failOnImpact.includes(v.impact))
    .map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.help}`);
}

/** Waits until the panel has sent `n` sendHTML calls, then lets it settle. */
async function sent(page, n) {
  await page.waitForFunction((count) => window.mockCalls
    .filter((c) => c[0] === 'sendHTML').length >= count, n, { timeout: WAIT });
  await page.waitForTimeout(600);
}

/** What the panel shows and sent so far. */
function capture(page) {
  return page.evaluate(() => {
    const calls = window.mockCalls || [];
    const read = (doc) => {
      // attributes sorted: the order an element's attributes were set in doesn't matter
      const body = doc.body.cloneNode(true);
      body.querySelectorAll('*').forEach((el) => {
        const attrs = [...el.attributes].map((a) => [a.name, a.value])
          .sort(([a], [b]) => a.localeCompare(b));
        attrs.forEach(([name]) => el.removeAttribute(name));
        attrs.forEach(([name, value]) => el.setAttribute(name, value));
      });
      return {
        html: body.innerHTML.replace(/\s+/g, ' '),
        values: [...doc.querySelectorAll('input, select, textarea')].map((el) => [
          el.name || el.id, el.type, el.value, el.checked, el.disabled,
          Boolean(el.closest('[hidden]')),
        ].join('|')),
      };
    };
    const result = {
      ...read(document),
      sendHTML: calls.filter((c) => c[0] === 'sendHTML').map((c) => c.slice(1)),
      daFetch: [...new Set(calls.filter((c) => c[0] === 'daFetch').map((c) => `${c[2]} ${c[1]}`))].sort(),
    };
    // Page Studio: each panel frame too (same origin)
    const frames = [...document.querySelectorAll('iframe.sb-view')];
    if (frames.length) {
      result.frames = Object.fromEntries(frames.map((frame) => [frame.dataset.view,
        frame.contentDocument?.body ? read(frame.contentDocument) : null]));
    }
    return result;
  });
}

/** Waits until Page Studio shows `view`. */
const shows = (page, view) => page.waitForFunction((v) => (document.querySelector('.sb-home').hidden
  ? document.querySelector('.sb-view:not([hidden])')?.dataset.view : 'home') === v, view, { timeout: WAIT });

/**
 * Waits until Page Studio's three panels have loaded (their forms out, the designs drawn): a
 * hidden frame that is still loading would make the first capture timing-dependent.
 */
async function framesReady(page) {
  // eslint-disable-next-line no-use-before-define
  const frame = (view) => frameOf(page, view);
  await frame('block').locator('#bs-form:not([hidden])').waitFor({ state: 'attached', timeout: WAIT });
  await frame('section').locator('.ss-plugin-form:not([hidden])').waitFor({ state: 'attached', timeout: WAIT });
  await frame('button').locator('.btn-plugin-card').first().waitFor({ state: 'attached', timeout: WAIT });
}

/** A panel frame of Page Studio, to click and type in. */
const frameOf = (page, view) => page.frameLocator(`iframe.sb-view[data-view="${view}"]`);

/** Each scenario: the panel, the mock's settings, and the steps (each followed by a capture). */
const SCENARIOS = [
  {
    name: 'section-standalone-insert',
    panel: 'views/section/section.html',
    mock: {},
    steps: [
      ['ready', (p) => p.waitForSelector('.ss-plugin-form:not([hidden])', { timeout: WAIT })],
      ['picked', async (p) => {
        await p.click('.ss-plugin-swatch[data-value="#e2f7ff"]');
        await p.click('.ss-plugin-toggle');
        await p.click('input[name="style"][value="center"]');
        await p.click('.ss-plugin-toggle');
      }],
      ['applied', async (p) => {
        await p.click('.ss-plugin-submit');
        await sent(p, 1);
      }],
    ],
  },
  {
    name: 'section-live-trial',
    panel: 'views/section/section.html',
    mock: {
      capabilities: LIVE,
      live: { html: page2('<div><p>Hello</p><p></p></div><div><p>Two</p></div>'), selection: { blockIndex: null } },
      replies: [{
        ok: true,
        html: page2('<div data-background="#e2f7ff"><p>Hello</p></div><div><p>Two</p></div>'),
        selection: { blockIndex: null },
      }],
    },
    steps: [
      ['ready', (p) => p.waitForSelector('.ss-plugin-form:not([hidden])', { timeout: WAIT })],
      ['placed', async (p) => {
        await p.click('.ss-plugin-swatch[data-value="#e2f7ff"]');
        await sent(p, 1);
      }],
      ['kept', async (p) => {
        await p.click('.ss-plugin-keep');
      }],
    ],
  },
  {
    name: 'section-live-edit',
    panel: 'views/section/section.html',
    mock: {
      capabilities: LIVE,
      selection: '<table><tr><td>style</td><td>center</td></tr></table>',
      live: { html: page2('<div class="center" data-background="#e2f7ff"><p>Hello</p></div><div><p>Two</p></div>'), selection: { blockIndex: null } },
      replies: [{
        ok: true,
        html: page2('<div class="center narrow" data-background="#e2f7ff"><p>Hello</p></div><div><p>Two</p></div>'),
        selection: { blockIndex: null },
      }],
    },
    steps: [
      ['ready', (p) => p.waitForSelector('.ss-plugin-form:not([hidden])', { timeout: WAIT })],
      ['opened', (p) => p.waitForSelector('.ss-plugin-mode[data-mode="edit"]', { timeout: WAIT })],
      ['edited', async (p) => {
        await p.click('.ss-plugin-toggle');
        await p.click('input[name="style"][value="narrow"]');
        await sent(p, 1);
      }],
    ],
  },
  {
    name: 'section-in-block',
    panel: 'views/section/section.html',
    mock: {
      capabilities: LIVE,
      live: { html: page2('<div class="center"><div class="cards" data-block-index="0"><div><div><p>A</p></div></div></div></div>'), selection: { blockIndex: 0 } },
    },
    steps: [
      ['blocked', (p) => p.waitForSelector('.ss-plugin-blocked:not([hidden])', { timeout: WAIT })],
    ],
  },
  {
    name: 'block-standalone-insert',
    panel: 'views/block/block.html',
    mock: {},
    steps: [
      ['ready', (p) => p.waitForSelector('#bs-form:not([hidden])', { timeout: WAIT })],
      ['chosen', async (p) => {
        await p.selectOption('#bs-block', 'cards');
        await p.waitForSelector('.bs-content:not([hidden])', { timeout: WAIT });
      }],
      ['styled', async (p) => {
        await p.click('input[name="bs-variant-variant"][value="news"]');
        await p.click('input[name="bs-visibility-variants"][value="hide-mobile"]');
      }],
      ['inserted', async (p) => {
        await p.click('.ss-plugin-submit');
        await sent(p, 1);
      }],
    ],
  },
  {
    name: 'block-live-edit',
    panel: 'views/block/block.html',
    mock: {
      capabilities: LIVE,
      live: { html: page2('<div><div class="cards news" data-block-index="0"><div><div><p>Card one</p></div></div></div></div>'), selection: { blockIndex: 0 } },
      replies: [{
        ok: true,
        html: page2('<div><div class="cards profile" data-block-index="0"><div><div><p>Card one</p></div></div></div></div>'),
        selection: { blockIndex: 0 },
      }],
    },
    steps: [
      ['editing', (p) => p.waitForSelector('.bs-mode[data-mode="edit"]', { timeout: WAIT })],
      ['applied', async (p) => {
        await p.click('input[name="bs-variant-variant"][value="profile"]');
        await sent(p, 1);
      }],
    ],
  },
  {
    name: 'block-live-trial',
    panel: 'views/block/block.html',
    mock: {
      capabilities: LIVE,
      selection: '',
      live: { html: page2('<div><p>Hello</p><p></p></div>'), selection: { blockIndex: null } },
      replies: [
        {
          ok: true,
          html: page2('<div><p>Hello</p><div class="hero banner" data-block-index="0"><div><div><h1>Hero heading</h1><p>Hero text</p></div></div></div></div>'),
          selection: { blockIndex: 0 },
        },
        { ok: true, html: page2('<div><p>Hello</p><p></p></div>'), selection: { blockIndex: null } },
      ],
    },
    steps: [
      ['ready', (p) => p.waitForSelector('#bs-form:not([hidden])', { timeout: WAIT })],
      ['placed', async (p) => {
        await p.selectOption('#bs-block', 'hero');
        await p.waitForSelector('.bs-mode[data-mode="trial"]', { timeout: WAIT });
      }],
      ['cancelled', async (p) => {
        await p.click('.bs-trial-remove');
        await sent(p, 2);
      }],
    ],
  },
  {
    name: 'buttons-standalone',
    panel: 'views/button/button.html',
    mock: { standalone: true },
    steps: [
      ['gallery', (p) => p.waitForFunction(() => document.querySelector('.btn-plugin-status')?.textContent.trim(), null, { timeout: WAIT })],
      ['editor', async (p) => {
        await p.click('.btn-plugin-pick >> nth=0');
      }],
    ],
  },
  {
    name: 'buttons-insert',
    panel: 'views/button/button.html',
    mock: { selection: '' },
    steps: [
      ['gallery', (p) => p.waitForFunction(() => document.querySelectorAll('.btn-plugin-card').length === 3, null, { timeout: WAIT })],
      ['editor', async (p) => {
        await p.click('.btn-plugin-pick >> nth=1');
        await p.fill('input[name="label"]', 'Give now');
        await p.fill('input[name="url"]', '/donate');
        await p.click('input[name="new-tab"]');
      }],
      ['inserted', async (p) => {
        await p.click('.btn-plugin-submit');
        await sent(p, 1);
      }],
    ],
  },
  {
    name: 'buttons-live-page',
    panel: 'views/button/button.html',
    mock: {
      capabilities: LIVE,
      clearSelection: true,
      // one word of the label highlighted: no options, part of the text
      selection: '<p><strong><em><a href="/give#_blank">Gi</a></em></strong></p>',
      live: { html: page2(`<div><p>Intro</p>${BUTTON}</div>`), selection: { blockIndex: null } },
      replies: [{
        ok: true,
        html: page2('<div><p>Intro</p><p><strong><em><a href="/give#_blank">Give</a></em></strong> [color=&#34;#0373f3&#34;, text-color=&#34;#ffffff&#34;]</p></div>'),
        selection: { blockIndex: null },
      }, {
        ok: true,
        html: page2('<div><p>Intro</p><p><strong><em><a href="/give#_blank">Give</a></em></strong> [color=&#34;#e87722&#34;]</p></div>'),
        selection: { blockIndex: null },
      }],
    },
    steps: [
      ['opened', (p) => p.waitForSelector('.btn-plugin-editor .btn-plugin-mode[data-mode="edit"]', { timeout: WAIT })],
      ['applied', async (p) => {
        await p.click('label.btn-plugin-swatch:has(input[name="color"][value="#0373f3"])');
        await sent(p, 1);
      }],
      ['redesigned', async (p) => {
        // back to the designs, then another one: it reaches the page button
        await p.click('.btn-plugin-back');
        await p.click('.btn-plugin-pick >> nth=1');
        await sent(p, 2);
      }],
      ['done', async (p) => {
        await p.click('.btn-plugin-submit');
        await p.waitForSelector('.btn-plugin-editor:not(.is-open)', { state: 'attached', timeout: WAIT });
      }],
    ],
  },
  {
    name: 'buttons-live-block',
    panel: 'views/button/button.html',
    mock: {
      capabilities: LIVE,
      clearSelection: true,
      // in a block cell, DA returns the highlight in its table
      selection: '<table><tr><td><p><strong><em><a href="/join">Join</a></em></strong></p></td></tr></table>',
      live: {
        html: page2('<div><div class="cards" data-block-index="0"><div><div><h3>Card</h3><p><strong><em><a href="/join">Join now</a></em></strong> [color=&#34;#cfff05&#34;]</p></div></div></div></div>'),
        selection: { blockIndex: 0 },
      },
      replies: [{
        ok: true,
        html: page2('<div><div class="cards" data-block-index="0"><div><div><h3>Card</h3><p><strong><em><a href="/join">Join today</a></em></strong> [color=&#34;#cfff05&#34;]</p></div></div></div></div>'),
        selection: { blockIndex: 0 },
      }],
    },
    steps: [
      ['opened', (p) => p.waitForSelector('.btn-plugin-editor .btn-plugin-mode[data-mode="edit"]', { timeout: WAIT })],
      ['applied', async (p) => {
        await p.fill('input[name="label"]', 'Join today');
        await sent(p, 1);
      }],
    ],
  },
  {
    name: 'buttons-live-put-back',
    panel: 'views/button/button.html',
    mock: {
      capabilities: LIVE,
      clearSelection: true,
      selection: '<p><strong><em><a href="/give#_blank">Give</a></em></strong></p>',
      live: { html: page2(`<div><p>Intro</p>${BUTTON}</div>`), selection: { blockIndex: null } },
      replies: [
        // the cursor had moved to the line above: that line became the button
        {
          ok: true,
          html: page2('<div><p><strong><em><a href="/give#_blank">Give</a></em></strong> [color=&#34;#0373f3&#34;, text-color=&#34;#ffffff&#34;]</p>'
            + `${BUTTON}</div>`),
          selection: { blockIndex: null },
        },
        { ok: true, html: page2(`<div><p>Intro</p>${BUTTON}</div>`), selection: { blockIndex: null } },
      ],
    },
    steps: [
      ['opened', (p) => p.waitForSelector('.btn-plugin-editor .btn-plugin-mode[data-mode="edit"]', { timeout: WAIT })],
      ['put-back', async (p) => {
        await p.click('label.btn-plugin-swatch:has(input[name="color"][value="#0373f3"])');
        await sent(p, 2);
      }],
    ],
  },
  {
    name: 'shell-standalone',
    panel: 'page-studio.html',
    mock: { standalone: true },
    steps: [
      ['home', (p) => p.waitForFunction(() => document.querySelector('.sb-home .ss-plugin-status')?.textContent.trim(), null, { timeout: WAIT })],
    ],
  },
  {
    name: 'shell-add-block',
    panel: 'page-studio.html',
    mock: {
      capabilities: LIVE,
      live: { html: page2('<div><p>Hello</p><p></p></div>'), selection: { blockIndex: null } },
      replies: [
        {
          ok: true,
          html: page2('<div><p>Hello</p><div class="hero banner" data-block-index="0"><div><div><h1>Hero heading</h1><p>Hero text</p></div></div></div></div>'),
          selection: { blockIndex: 0 },
        },
        { ok: true, html: page2('<div><p>Hello</p><p></p></div>'), selection: { blockIndex: null } },
      ],
    },
    steps: [
      ['home', async (p) => {
        await framesReady(p);
        await shows(p, 'home');
        await frameOf(p, 'block').locator('#bs-form:not([hidden])').waitFor({ state: 'attached', timeout: WAIT });
      }],
      ['picked', async (p) => {
        await p.click('.sb-choice[data-view="block"]');
        await shows(p, 'block');
      }],
      ['placed', async (p) => {
        await frameOf(p, 'block').locator('#bs-block').selectOption('hero');
        await frameOf(p, 'block').locator('.bs-mode[data-mode="trial"]').waitFor({ timeout: WAIT });
        await shows(p, 'block');
      }],
      ['cancelled', async (p) => {
        await frameOf(p, 'block').locator('.bs-trial-remove').click();
        await sent(p, 2);
        await shows(p, 'block');
      }],
      ['back', async (p) => {
        await p.click('.sb-back');
        await shows(p, 'home');
      }],
    ],
  },
  {
    name: 'shell-follow',
    panel: 'page-studio.html',
    mock: {
      capabilities: LIVE,
      live: { html: CARDS, selection: { blockIndex: null } },
    },
    steps: [
      ['home', async (p) => {
        await framesReady(p);
        await shows(p, 'home');
        await frameOf(p, 'button').locator('.btn-plugin-card').first().waitFor({ state: 'attached', timeout: WAIT });
      }],
      ['in-block', async (p) => {
        await p.evaluate((html) => window.pushLive({ html, selection: { blockIndex: 0 } }), CARDS);
        await shows(p, 'block');
        await p.waitForTimeout(400);
      }],
      ['button', async (p) => {
        await p.evaluate(() => { window.mockConfig.selection = '<table><tr><td><p><strong><em><a href="/join">Join</a></em></strong></p></td></tr></table>'; });
        await shows(p, 'button');
        await p.waitForTimeout(400);
      }],
      ['done', async (p) => {
        await frameOf(p, 'button').locator('.btn-plugin-submit').click();
        await shows(p, 'block');
        // the highlight is still there: the next looks must not open the button again
        await p.waitForTimeout(1600);
      }],
      ['left-block', async (p) => {
        await p.evaluate(
          (html) => window.pushLive({ html, selection: { blockIndex: null } }),
          CARDS,
        );
        await shows(p, 'home');
        await p.waitForTimeout(400);
      }],
    ],
  },
  {
    name: 'shell-section',
    panel: 'page-studio.html',
    mock: {
      capabilities: LIVE,
      selection: '<table><tr><td>style</td><td>center</td></tr></table>',
      live: { html: page2('<div class="center" data-background="#e2f7ff"><p>Hello</p></div><div><p>Two</p></div>'), selection: { blockIndex: null } },
    },
    steps: [
      ['opened', async (p) => {
        await framesReady(p);
        await shows(p, 'section');
        await p.waitForTimeout(400);
      }],
    ],
  },
  {
    name: 'shell-button-style',
    panel: 'page-studio.html',
    mock: {
      capabilities: LIVE,
      live: { html: CARDS_IN_BAND, selection: { blockIndex: 0 } },
      replies: [{
        ok: true,
        html: CARDS_IN_BAND.replace('</a></em></strong></p>', '</a></em></strong> [color=&#34;#0373f3&#34;]</p>'),
        selection: { blockIndex: 0 },
      }],
    },
    steps: [
      ['in-block', async (p) => {
        await framesReady(p);
        await shows(p, 'block');
        await frameOf(p, 'block').locator('.bs-button-style').waitFor({ state: 'attached', timeout: WAIT });
        await p.waitForTimeout(400);
      }],
      ['button-style', async (p) => {
        await frameOf(p, 'block').locator('.bs-button-style').first().click();
        await shows(p, 'button');
        await p.waitForTimeout(400);
      }],
      ['applied', async (p) => {
        await frameOf(p, 'button').locator('label.btn-plugin-swatch:has(input[name="color"][value="#0373f3"])').click();
        await sent(p, 1);
      }],
      ['path-block', async (p) => {
        await p.click('.sb-path-link[data-view="block"]');
        await shows(p, 'block');
        await p.waitForTimeout(400);
      }],
    ],
  },
  {
    name: 'shell-path',
    panel: 'page-studio.html',
    mock: {
      capabilities: LIVE,
      live: { html: CARDS_IN_BAND, selection: { blockIndex: 0 } },
    },
    steps: [
      ['in-block', async (p) => {
        await framesReady(p);
        await shows(p, 'block');
        await p.waitForTimeout(400);
      }],
      ['path-section', async (p) => {
        await p.click('.sb-path-link[data-view="section"]');
        await shows(p, 'section');
        await p.waitForTimeout(400);
      }],
      ['path-page', async (p) => {
        await p.click('.sb-path-link[data-view="home"]');
        await shows(p, 'home');
        await p.waitForTimeout(400);
      }],
      ['path-block', async (p) => {
        await p.click('.sb-path-link[data-view="block"]');
        await shows(p, 'block');
        await p.waitForTimeout(400);
      }],
      ['cursor-out', async (p) => {
        const out = (html) => window.pushLive({ html, selection: { blockIndex: null } });
        await p.evaluate(out, CARDS_IN_BAND);
        await shows(p, 'home');
        await p.waitForTimeout(400);
      }],
    ],
  },
  {
    name: 'shell-add-button',
    panel: 'page-studio.html',
    mock: {
      capabilities: LIVE,
      live: { html: page2('<div><p>Hello</p><p></p></div>'), selection: { blockIndex: null } },
      // a late answer: a second click on Insert meanwhile must not add a second button
      replies: [{ ok: true, delay: 400 }],
    },
    steps: [
      ['home', async (p) => {
        await framesReady(p);
        await shows(p, 'home');
      }],
      ['editor', async (p) => {
        await p.click('.sb-choice[data-view="button"]');
        await shows(p, 'button');
        await frameOf(p, 'button').locator('.btn-plugin-pick').first().click();
        await frameOf(p, 'button').locator('input[name="label"]').fill('Give now');
        await frameOf(p, 'button').locator('input[name="url"]').fill('/donate');
      }],
      ['inserted', async (p) => {
        const submit = frameOf(p, 'button').locator('.btn-plugin-submit');
        await submit.click();
        await submit.click({ force: true }).catch(() => {});
        await sent(p, 1);
        await shows(p, 'home');
        await p.waitForTimeout(500);
      }],
    ],
  },
  {
    name: 'shell-add-block-kept',
    panel: 'page-studio.html',
    mock: {
      capabilities: LIVE,
      live: { html: page2('<div><p>Hello</p><p></p></div>'), selection: { blockIndex: null } },
      // the live document arrives before DA's answer to the placement
      replies: [{
        ok: true, liveFirst: true, html: page2('<div><p>Hello</p><div class="hero banner" data-block-index="0"><div><div><h1>Hero heading</h1><p>Hero text</p></div></div></div></div>'), selection: { blockIndex: 0 },
      }],
    },
    steps: [
      ['home', async (p) => {
        await framesReady(p);
        await shows(p, 'home');
      }],
      ['placed', async (p) => {
        await p.click('.sb-choice[data-view="block"]');
        await frameOf(p, 'block').locator('#bs-block').selectOption('hero');
        await frameOf(p, 'block').locator('.bs-mode[data-mode="trial"]').waitFor({ timeout: WAIT });
        await shows(p, 'block');
      }],
      ['kept', async (p) => {
        await frameOf(p, 'block').locator('.bs-trial-keep').click();
        await shows(p, 'home');
        await p.waitForTimeout(600);
      }],
    ],
  },
  {
    name: 'shell-add-section',
    panel: 'page-studio.html',
    mock: {
      capabilities: LIVE,
      live: { html: page2('<div><p>Hello</p><p></p></div><div><p>Two</p></div>'), selection: { blockIndex: null } },
      replies: [{
        ok: true,
        broadcast: true,
        html: page2('<div data-background="#e2f7ff"><p>Hello</p></div><div><p>Two</p></div>'),
        selection: { blockIndex: null },
      }],
    },
    steps: [
      ['home', async (p) => {
        await framesReady(p);
        await shows(p, 'home');
      }],
      ['placed', async (p) => {
        await p.click('.sb-choice[data-view="section"]');
        await frameOf(p, 'section').locator('.ss-plugin-swatch[data-value="#e2f7ff"]').click();
        await sent(p, 1);
        await shows(p, 'section');
      }],
      ['kept', async (p) => {
        await frameOf(p, 'section').locator('.ss-plugin-keep').click();
        await shows(p, 'home');
        await p.waitForTimeout(600);
      }],
    ],
  },
  {
    name: 'block-no-answer',
    panel: 'views/block/block.html',
    mock: {
      capabilities: LIVE,
      live: { html: page2('<div><div class="cards news" data-block-index="0"><div><div><p>Card one</p></div></div></div></div>'), selection: { blockIndex: 0 } },
      replies: [{ hang: true }],
    },
    steps: [
      ['editing', (p) => p.waitForSelector('.bs-mode[data-mode="edit"]', { timeout: WAIT })],
      ['timed-out', async (p) => {
        await p.click('input[name="bs-variant-variant"][value="profile"]');
        await sent(p, 1);
        // the panel stops waiting after 10 s and says so
        await p.waitForFunction(() => document.querySelector('.ss-plugin-message')?.dataset.tone === 'error', null, { timeout: 15000 });
      }],
      ['follows', async (p) => {
        // and follows the cursor again
        await p.evaluate(() => window.pushLive({ html: '<main><div><p>Text</p></div></main>', selection: { blockIndex: null } }));
        await p.waitForSelector('.bs-mode[data-mode="insert"]', { timeout: WAIT });
      }],
    ],
  },
  {
    name: 'buttons-no-answer',
    panel: 'views/button/button.html',
    mock: {
      capabilities: LIVE,
      clearSelection: true,
      selection: '<p><strong><em><a href="/give#_blank">Gi</a></em></strong></p>',
      live: { html: page2(`<div><p>Intro</p>${BUTTON}</div>`), selection: { blockIndex: null } },
      replies: [{ hang: true }],
    },
    steps: [
      ['opened', (p) => p.waitForSelector('.btn-plugin-editor .btn-plugin-mode[data-mode="edit"]', { timeout: WAIT })],
      ['timed-out', async (p) => {
        await p.click('label.btn-plugin-swatch:has(input[name="color"][value="#0373f3"])');
        await sent(p, 1);
        // editing stops (whether the change happened isn't known), the designs show again
        await p.waitForSelector('.btn-plugin-editor:not(.is-open)', { state: 'attached', timeout: 15000 });
        await p.waitForTimeout(400);
      }],
    ],
  },
  {
    name: 'buttons-default',
    panel: 'views/button/button.html',
    mock: {
      capabilities: LIVE,
      files: { [`${SOURCE}/.da/library/page-studio.json`]: null, [`${SOURCE}/.da/library/buttons.json`]: null },
      live: { html: page2('<div><p>Hello</p><p></p></div>'), selection: { blockIndex: null } },
    },
    steps: [
      ['gallery', (p) => p.waitForFunction(() => document.querySelectorAll('.btn-plugin-card').length === 4, null, { timeout: WAIT })],
      ['editor', async (p) => {
        await p.click('.btn-plugin-pick >> nth=2');
        await p.fill('input[name="label"]', 'Get started');
        await p.fill('input[name="url"]', '/start');
      }],
      ['inserted', async (p) => {
        await p.click('.btn-plugin-submit');
        await sent(p, 1);
      }],
    ],
  },
  {
    name: 'buttons-edit',
    panel: 'views/button/button.html',
    mock: { selection: '<p><strong><em><a href="/give#_blank">Give</a></em></strong> [color="#e87722", text-color="#ffffff"]</p>' },
    steps: [
      ['opened', (p) => p.waitForSelector('.btn-plugin-editor.is-open', { timeout: WAIT })],
      ['updated', async (p) => {
        await p.click('.btn-plugin-submit');
        await sent(p, 1);
      }],
    ],
  },
];

async function run(scenario, browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(WAIT);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await context.route('https://da.live/nx/utils/sdk.js', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript', body: SDK,
  }));
  // a case may change the files: a value of null takes one away (e.g. the configuration)
  const files = Object.fromEntries(Object.entries({ ...FILES, ...scenario.mock.files })
    .filter(([, body]) => body !== null));
  const mock = {
    context: CONTEXT,
    selection: '',
    replies: [],
    capabilities: null,
    ...scenario.mock,
    files,
  };
  await context.addInitScript((cfg) => { window.mockConfig = cfg; }, mock);
  const result = { steps: {} };
  try {
    await page.goto(`${BASE}/tools/page-studio/${scenario.panel}`, { timeout: WAIT });
    // eslint-disable-next-line no-restricted-syntax
    for (const [label, step] of scenario.steps) {
      // eslint-disable-next-line no-await-in-loop -- steps run in order
      await step(page);
      // eslint-disable-next-line no-await-in-loop
      result.steps[label] = await capture(page);
    }
    if (process.env.AXE) result.axe = await axeViolations(page);
  } catch (e) {
    [result.failed] = String(e.message).split('\n');
  }
  result.errors = errors;
  await context.close();
  return result;
}

function firstDiff(a, b, path = '') {
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) return `${path}: type`;
  if (a && typeof a === 'object') {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    // eslint-disable-next-line no-restricted-syntax
    for (const k of keys) {
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
    return null;
  }
  if (a === b) return null;
  const s = String(a);
  const t = String(b);
  let i = 0;
  while (s[i] === t[i]) i += 1;
  return `${path} @${i}\n  was: …${s.slice(Math.max(0, i - 80), i + 120)}\n  now: …${t.slice(Math.max(0, i - 80), i + 120)}`;
}

async function main() {
  const [mode, dir] = process.argv.slice(2);
  if (!['--save', '--compare'].includes(mode) || !dir) {
    console.error('usage: panels-golden.mjs --save|--compare <dir>');
    process.exit(2);
  }
  const only = process.env.ONLY;
  // CHROMIUM_PATH: a Chromium build when Playwright's own download is missing
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let failures = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const scenario of SCENARIOS.filter((s) => !only || s.name.includes(only))) {
    // eslint-disable-next-line no-await-in-loop -- one page at a time
    const result = await run(scenario, browser);
    const { axe } = result;
    delete result.axe;
    if (axe) {
      if (axe.length) failures += 1;
      console.log(`${axe.length ? '✗' : '✓'} ${scenario.name} axe: ${axe.length ? axe.join('; ') : '0 critical / serious'}`);
    }
    const file = join(dir, `${scenario.name}.json`);
    const problem = result.failed || (result.errors.length && result.errors.join('; '));
    if (mode === '--save') {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, `${JSON.stringify(result, null, 1)}\n`);
      console.log(`${problem ? '!' : '✓'} ${scenario.name} saved${problem ? ` (${problem})` : ''}`);
    } else if (!existsSync(file)) {
      failures += 1;
      console.log(`✗ ${scenario.name}: no baseline`);
    } else {
      const diff = firstDiff(JSON.parse(readFileSync(file, 'utf8')), result);
      if (diff) failures += 1;
      console.log(diff ? `✗ ${scenario.name}${diff}` : `✓ ${scenario.name} unchanged`);
    }
  }
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main();
