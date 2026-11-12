/*
 * Page Studio — one DA panel for buttons, blocks and sections. The three
 * panels (the Block view, Buttons, the Section view) run unchanged in frames of this page and
 * share its DA connection (shared/da.js: one SDK, one live-document subscription, one look at
 * the highlight every 0.7 s), so DA sees one panel. This page shows the view for what the
 * cursor is on:
 *   a button being edited (a highlight in a button)  → the Button view
 *   section settings being edited (a highlighted settings table, or a trial one)  → Section
 *   the cursor in a block (or a trial block)  → Block
 *   nothing of these  → the view the author chose under "Add here", else the Add here home
 * A view that is writing to the page stays shown until it is done. A path (Page › Section ›
 * Block › Button) says where the cursor is; each item opens its view until the
 * cursor moves on (another button, block or settings table). With the cursor in a block, a line
 * under the path gives that section's settings.
 */
import {
  connect, onHostChange, viewStatus, lastLiveDocument, runCommand, loadConfig,
} from './shared/da.js';
import { readDocument } from './views/section/live-doc.js';
import messages from './page-studio.messages.js';
import { applyMessages, applySiteMessages } from './shared/messages.js';

// the view's words (its messages module), on the page before anything reads them
applyMessages(messages);

const $ = (selector) => document.querySelector(selector);
const home = $('.sb-home');
const viewsEl = $('.sb-views');
const back = $('.sb-back');
const path = $('.sb-path');
const context = $('.sb-context');
const homeMessage = $('.sb-home-message');
const status = $('.sb-home .ss-plugin-status');
const frames = Object.fromEntries([...document.querySelectorAll('.sb-view')]
  .map((frame) => [frame.dataset.view, frame]));

const state = {
  pick: null, // the view chosen under "Add here" (block, button or section)
  shown: 'home',
  focus: null, // { view, key }: the view chosen from the path, while the context stays `key`
  drawnPath: '', // what the path shows now
  adds: {}, // each panel's addCount as last seen
};

/** What the cursor is on; it changes when another button, block or settings table opens. */
const contextKey = (views) => [
  views.button.editing, views.button.blockIndex, views.block.editing, views.block.index,
  views.section.editing, (views.section.sections || []).join(','),
].join('|');

/** The view the cursor's context asks for, without the path's choice. */
const contextView = (views) => (views.button.editing && 'button')
  || (views.section.editing && 'section') || (views.block.editing && 'block') || null;

/** The view to show, from what the three panels are doing (see the header comment). */
function choose(views) {
  const kept = views[state.shown];
  if (kept?.busy) return state.shown; // a write on its way: its view stays
  if (state.focus) {
    if (state.focus.key === contextKey(views)) return state.focus.view;
    state.focus = null; // the cursor moved on
  }
  return contextView(views) || state.pick || 'home';
}

function show(view) {
  state.shown = view;
  home.hidden = view !== 'home';
  viewsEl.hidden = view === 'home'; // else the empty frame area takes half the height
  Object.entries(frames).forEach(([name, frame]) => { frame.hidden = name !== view; });
  back.hidden = !state.pick || view !== state.pick;
}

/** The section the cursor is in (0-based), when the live document says so; else null. */
function cursorSection(views) {
  const { html } = lastLiveDocument() || {};
  const blockIndex = views.block.editing ? views.block.index : views.button.blockIndex;
  if (html && Number.isInteger(blockIndex)) {
    const section = readDocument(html).blocks[blockIndex]?.section;
    if (Number.isInteger(section)) return section;
  }
  const { sections = [] } = views.section;
  return views.section.editing && sections.length === 1 ? sections[0] : null;
}

/**
 * Page › Section 2 › Cards › Button: Join now. The item of the view shown is marked current;
 * the others are buttons that open their view.
 */
function renderPath(views) {
  const { dataset } = path;
  const items = [{ text: dataset.page, view: 'home' }];
  const section = cursorSection(views);
  const sectionName = Number.isInteger(section) ? dataset.section.replace('{n}', section + 1)
    : dataset.sectionAny;
  if (Number.isInteger(section) || views.section.editing) {
    items.push({ text: sectionName, view: 'section' });
  }
  const inBlock = views.block.editing || Number.isInteger(views.button.blockIndex);
  if (inBlock && views.block.label) items.push({ text: views.block.label, view: 'block' });
  if (views.button.editing) {
    items.push({
      text: views.button.label ? dataset.button.replace('{label}', views.button.label)
        : dataset.buttonAny,
      view: 'button',
    });
  }
  const current = items.some((item) => item.view === state.shown) ? state.shown
    : items[items.length - 1].view;
  // rebuilt only when it changes (it is asked every 0.7 s): a focused link keeps its focus
  const drawn = JSON.stringify([items, current]);
  if (drawn !== state.drawnPath) {
    state.drawnPath = drawn;
    path.querySelector('ol').replaceChildren(...items.map(({ text, view }) => {
      const li = document.createElement('li');
      if (view === current) {
        li.textContent = text;
        li.setAttribute('aria-current', 'location');
      } else {
        const go = document.createElement('button');
        go.type = 'button';
        go.className = 'sb-path-link';
        go.dataset.view = view;
        go.textContent = text;
        li.append(go);
      }
      return li;
    }));
  }
  // the cursor's section settings, while a block (or its button) is shown
  const settings = views.section.cursorSettings;
  const showLine = ['block', 'button'].includes(state.shown) && typeof settings === 'string'
    && Number.isInteger(section);
  context.hidden = !showLine;
  if (showLine) {
    context.textContent = (settings ? context.dataset.has : context.dataset.none)
      .replace('{section}', sectionName).replace('{settings}', settings);
  }
}

/** A path item: its view, held until the cursor moves on; leaving a button ends editing it. */
function goTo(view) {
  if (view !== 'button' && viewStatus('button').editing) runCommand('button:done');
  if (view === 'home') state.pick = null;
  const views = {
    block: viewStatus('block'), button: viewStatus('button'), section: viewStatus('section'),
  };
  state.focus = view === contextView(views) ? null : { view, key: contextKey(views) };
  // eslint-disable-next-line no-use-before-define
  route();
}

/**
 * After an add (a block kept or inserted, a button inserted, settings added), back to the home,
 * ready for the next thing, with a ✓. The first count seen is only noted.
 */
function followAdds(views) {
  Object.entries(views).forEach(([name, view]) => {
    const count = view.addCount;
    if (!Number.isInteger(count)) return;
    const seen = state.adds[name];
    state.adds[name] = count;
    if (!Number.isInteger(seen) || count <= seen) return;
    state.pick = null;
    state.focus = null;
    homeMessage.textContent = homeMessage.dataset[`added${name[0].toUpperCase()}${name.slice(1)}`] || '';
  });
}

function route() {
  const views = {
    block: viewStatus('block'), button: viewStatus('button'), section: viewStatus('section'),
  };
  followAdds(views);
  const view = choose(views);
  if (view !== 'home') homeMessage.textContent = ''; // the ✓ is for the home just after an add
  show(view);
  renderPath(views);
}

// the panels report often (every live message and look): one route per turn of the event loop
let queued = false;
function scheduleRoute() {
  if (queued) return;
  queued = true;
  setTimeout(() => {
    queued = false;
    route();
  }, 0);
}

/** A frame's view loads now (a `data-lazy` one, e.g. Check setup, only once it is picked). */
function load(frame) {
  if (frame && !frame.getAttribute('src')) frame.src = frame.dataset.src;
}

// the Add here choices, and Check setup (a view picked the same way)
document.querySelectorAll('.sb-choice, .sb-tool').forEach((choice) => {
  choice.addEventListener('click', () => {
    homeMessage.textContent = '';
    state.pick = choice.dataset.view;
    load(frames[state.pick]);
    route();
    frames[state.pick]?.focus();
  });
});
path.addEventListener('click', (e) => {
  const link = e.target.closest('.sb-path-link');
  if (link) goTo(link.dataset.view);
});
back.addEventListener('click', () => {
  state.pick = null;
  route();
  $('.sb-choice')?.focus();
});

async function init() {
  onHostChange(scheduleRoute);
  // this page's DA connection exists now (shared/da.js), so the panels loading in the frames use it;
  // a view only some open (Check setup) waits until it is picked, so it doesn't slow the others
  Object.values(frames).filter((frame) => !('lazy' in frame.dataset)).forEach(load);
  route();
  const sdk = await connect();
  if (!sdk) {
    status.textContent = status.dataset.standalone;
    return;
  }
  // the site's own words for this page (its views take theirs)
  const { tabs } = await loadConfig(sdk.actions, sdk.context);
  applySiteMessages(tabs, 'page-studio');
}

init();
