/*
 * Page Studio's connection to the DA editor, shared by its three views (Block, Button,
 * Section): the SDK, DA source addresses, the live document, the page's saved source, the
 * customer's configuration and the time limits on every DA call.
 */

export const DA_SOURCE = 'https://admin.da.live/source/';
export const DA_CONTENT = 'https://content.da.live/';
// DA sends sources without Cache-Control, so the browser may reuse an old copy for hours
// (heuristic freshness): revalidate, so a sheet edit shows at once
export const NO_STALE = { cache: 'no-cache' };

/** @returns {Promise<null>} resolves with null after `ms` */
export const timeout = (ms) => new Promise((resolve) => { setTimeout(() => resolve(null), ms); });

/** The DA App SDK, or null outside the DA editor (it only resolves there). */
async function loadSdk(ms) {
  let sdk = null;
  try {
    // eslint-disable-next-line import/no-unresolved -- remote DA App SDK
    const { default: DA_SDK } = await import('https://da.live/nx/utils/sdk.js');
    sdk = await Promise.race([DA_SDK, timeout(ms)]);
  } catch { /* not in DA */ }
  return sdk?.actions ? sdk : null;
}

/** Calls each listener; one that throws (e.g. a closed frame's) doesn't stop the others. */
const tell = (listeners, ...args) => [...listeners].map((fn) => {
  try {
    return fn(...args);
  } catch {
    return null;
  }
});

/**
 * One connection to the DA editor, shared by every panel that uses it: the SDK, one
 * live-document subscription and one look at the highlight every 0.7 s, each sent to all the
 * panels' listeners, plus the views' states and a change signal for Page Studio.
 */
function createHost() {
  let sdk = null;
  let last = null; // the latest live-document message, for a panel that subscribes later
  const live = new Set();
  const looks = new Set();
  const changes = new Set();
  const views = new Map();
  const memos = new Map();
  const commands = new Map();
  let subscribed = false;
  let polling = false;
  return {
    connect(ms) {
      sdk ||= loadSdk(ms);
      return sdk;
    },
    onLive(actions, fn) {
      live.add(fn);
      if (!subscribed) {
        subscribed = true;
        actions.subscribeLiveDocument((message) => {
          last = message;
          tell(live, message);
          tell(changes);
        });
      } else if (last) {
        setTimeout(() => fn(last), 0);
      }
    },
    onSelection(actions, fn, ms) {
      looks.add(fn);
      if (polling) return;
      polling = true;
      const look = async () => {
        try {
          if (!document.hidden) {
            let html = null;
            try {
              html = await Promise.race([actions.getSelection(), timeout(1000)]);
            } catch { /* nothing highlighted */ }
            await Promise.allSettled(tell(looks, html));
            tell(changes);
          }
        } catch { /* the next look tries again */ }
        setTimeout(look, ms);
      };
      setTimeout(look, ms);
    },
    onChange(fn) {
      changes.add(fn);
    },
    changed() {
      tell(changes);
    },
    register(name, status) {
      views.set(name, status);
    },
    command(name, fn) {
      commands.set(name, fn);
    },
    run(name, args) {
      const fn = commands.get(name);
      return fn ? fn(args) : undefined;
    },
    has: (name) => commands.has(name),
    views,
    lastLive: () => last,
    // one value per page for every view (e.g. the configuration sheet, read once)
    memo(key, make) {
      if (!memos.has(key)) memos.set(key, make());
      return memos.get(key);
    },
  };
}

/**
 * Page Studio (tools/plugins/style-builder) shows the three panels in frames of its own
 * page (same origin): a panel there uses its host, so DA sees one panel. A panel opened on
 * its own (its parent is DA, another origin) has its own host.
 */
function findHost() {
  try {
    const parent = window.parent !== window && window.parent.pageStudioHost;
    if (parent) return { host: parent, embedded: true };
  } catch { /* the parent is DA: another origin */ }
  window.pageStudioHost ||= createHost();
  return { host: window.pageStudioHost, embedded: false };
}

const { host, embedded } = findHost();

/** The panel is shown inside Page Studio (its own title is hidden there). */
export const isEmbedded = embedded;
if (embedded) document.documentElement.classList.add('sb-embedded');

/**
 * The DA App SDK, or null outside the DA editor (it only resolves there; after `ms` the panel
 * stops waiting). Shared: every panel of a Page Studio gets the same one.
 * @returns {Promise<Object|null>} { context, actions, capabilities, token }
 */
export const connect = (ms = 3000) => host.connect(ms);

/** Live-document messages ({ html, selection }); a later listener gets the latest at once. */
export const onLiveDocument = (actions, fn) => host.onLive(actions, fn);

/** What is highlighted (getSelection(), null when nothing), every `ms` while the page shows. */
export const onSelection = (actions, fn, ms = 700) => host.onSelection(actions, fn, ms);

/**
 * A panel's state for Page Studio's choice of view.
 * @param {string} name `section`, `block` or `button`
 * @param {function(): Object} status what the panel is doing now
 */
export const registerView = (name, status) => host.register(name, status);

/**
 * Something one panel can ask another to do inside Page Studio, e.g.
 * `button:edit` (the Buttons view opens a block's button).
 */
export const registerCommand = (name, fn) => host.command(name, fn);

/** @returns {*} the command's answer; undefined when no panel offers it (on its own) */
export function runCommand(name, args) {
  try {
    return host.run(name, args);
  } catch {
    return undefined;
  }
}

/** Does a panel of this page offer the command (Page Studio with that view)? */
export const hasCommand = (name) => host.has(name);

/** The panel's state changed (Page Studio looks again at which view to show). */
export const notifyChange = () => host.changed();

/** Page Studio: called after every live-document message, look at the highlight or change. */
export const onHostChange = (fn) => host.onChange(fn);

/** Page Studio: a panel's registerView() state ({} before the panel has loaded). */
export function viewStatus(name) {
  try {
    return host.views.get(name)?.() || {};
  } catch {
    return {};
  }
}

/** Page Studio: the latest live-document message ({ html, selection }), or null. */
export const lastLiveDocument = () => host.lastLive();

/** @returns {string} the DA source address of a path in the site (`/.da/library/blocks.json`) */
export const sourceUrl = (context, path) => `${DA_SOURCE}${context.org}/${context.repo}${path}`;

/**
 * The editor offers the live document and replace (Experience Workspace), so the page itself
 * can show each pick.
 */
export const canEditLive = (capabilities, actions) => capabilities?.liveDocument === 1
  && capabilities?.sendHTMLReplace === 1 && typeof actions.subscribeLiveDocument === 'function';

// how long a panel waits for DA's answer to a write, and to a look at the highlight; the
// configuration (`send-timeout-ms`, `look-timeout-ms`) may change them (setLimits())
const limits = { send: 10000, look: 2000 };

/** Sets the time limits on DA calls (positive whole milliseconds only). */
export function setLimits({ send, look } = {}) {
  if (Number.isInteger(send) && send > 0) limits.send = send;
  if (Number.isInteger(look) && look > 0) limits.look = look;
}

/**
 * The SDK actions, with a sendHTML that reports where the cursor is after a replace: DA's
 * answer says so before its next live message does, so a look at the cursor right after a
 * write isn't one step behind.
 * @param {function(number|null)} onBlockIndex gets the cursor's blockIndex
 */
export function trackCursor(actions, onBlockIndex) {
  return {
    ...actions,
    sendHTML: async (html, options) => {
      // DA may never answer (the editor reloaded, the view switched): a panel waiting on it
      // would stop following the cursor, so it stops waiting after limits.send
      const result = await Promise.race([
        actions.sendHTML(html, options),
        timeout(limits.send).then(() => ({ ok: false, error: 'TIMEOUT' })),
      ]);
      if (result?.ok && result.selection) onBlockIndex(result.selection.blockIndex ?? null);
      return result;
    },
    // nothing highlighted, or no answer in time: null, as "nothing selected"
    getSelection: () => Promise.race([actions.getSelection(), timeout(limits.look)]),
  };
}

/**
 * Reads a DA sheet of the site.
 * @returns {Promise<Object|null>} its JSON, or null when it can't be read
 */
export async function readSheet(actions, context, path, init) {
  try {
    const resp = await actions.daFetch(sourceUrl(context, path), init);
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  }
}

/** @returns {Promise<string|null>} the page's saved DA source, null when it can't be read */
export async function savedSource(actions, context) {
  try {
    const resp = await actions.daFetch(sourceUrl(context, `${context.path}.html`), NO_STALE);
    return resp.ok ? await resp.text() : null;
  } catch {
    return null;
  }
}

// after a write, how long to look for the page's saved source to catch up
const SOURCE_WAIT_MS = 8000;
const SOURCE_STEP_MS = 1000;

/**
 * Some changes show only in the saved source, a moment later (the live document leaves the
 * page Metadata table out, and merges a section's tables): reads it every second for 8 s.
 * @param {function(): Promise<string|null>} read reads the saved source
 * @param {function(string): boolean} check true when it found something (the watch ends)
 * @param {function(): boolean} [current] false once a newer watch has started (this one ends)
 */
export async function watchSaved(read, check, current = () => true) {
  for (let waited = 0; waited < SOURCE_WAIT_MS && current(); waited += SOURCE_STEP_MS) {
    await timeout(SOURCE_STEP_MS);
    if (!current()) return;
    const source = await read();
    if (source !== null && check(source)) return;
  }
}

/**
 * Waits for the live document to change: next() resolves with the next live document other
 * than `html` (null after `ms`); the panel's live-document listener calls notify().
 */
export function liveWaiter() {
  let waiting = null;
  return {
    next(html, ms = 3000) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiting = null;
          resolve(null);
        }, ms);
        waiting = (next) => {
          if (next === html) return;
          clearTimeout(timer);
          waiting = null;
          resolve(next);
        };
      });
    },
    notify(html) {
      waiting?.(html);
    },
  };
}

/* ---- the customer's configuration ------------------------------------------------- */

/** The configuration sheet, in the customer's DA (every row optional). */
export const CONFIG_PATH = '/.da/library/page-studio.json';

/**
 * The settings and their defaults (the configuration sheet's `settings` tab, `key` | `value`).
 * Every setting is optional; see tools/page-studio/README.md, "Configuration".
 */
export const DEFAULTS = {
  'library-sheet': '/.da/library/blocks.json', // blocks, variants and section options
  'buttons-sheet': '/.da/library/buttons.json', // button designs, colours, icons
  'code-ref': 'main', // the customer code branch previews and checks read
  'code-origin': '', // the customer code address, if not https://{code-ref}--{repo}--{org}.aem.page
  'preview-css': '/styles/styles.css', // comma-separated, from the customer code: button previews
  'check-blocks': 'auto', // offer only blocks with code: auto (when served by the same site), yes, no
  'button-options': 'no', // colours and design names as `[…]` after a button (the site must read them)
  'button-new-tab': 'no', // "Open in a new tab" as `#_blank` (the site must read it)
  'button-icons': 'no', // icons as `:name:` in the button text (the site must keep them in buttons)
  'icon-path': '/icons/', // where `:name:` icons are, in the customer code
  'send-timeout-ms': '10000',
  'look-timeout-ms': '2000',
};

const yes = (value) => ['yes', 'true', 'on', '1'].includes(String(value).trim().toLowerCase());

/** A sheet path must be a site path to a JSON sheet: no host, no `..`. */
const isSheetPath = (value) => /^\/[\w.-]+(?:\/[\w.-]+)*\.json$/.test(value) && !value.includes('..');

/** A customer code path: a site path, no host, no `..`. */
const isSitePath = (value) => /^\/[\w./-]*$/.test(value) && !value.includes('..');

/**
 * Reads the configuration once per page (all views share it). Unknown keys and invalid
 * values are ignored, with the default kept.
 * @returns {Promise<{settings: Object<string, string>, flag: function(string): boolean}>}
 */
export function loadConfig(actions, context) {
  return host.memo('config', async () => {
    const settings = { ...DEFAULTS };
    const json = await readSheet(actions, context, CONFIG_PATH, NO_STALE);
    const rows = json?.settings?.data || (Array.isArray(json?.data) ? json.data : []);
    rows.forEach((row) => {
      const key = String(row.key ?? '').trim().toLowerCase();
      const value = String(row.value ?? '').trim();
      if (!Object.hasOwn(DEFAULTS, key) || !value) return;
      if (key.endsWith('-sheet') && !isSheetPath(value)) return;
      if (['preview-css', 'icon-path'].includes(key)
        && !value.split(',').every((v) => isSitePath(v.trim()))) return;
      if (key === 'code-origin' && !/^https:\/\/[\w.-]+$/.test(value)) return;
      settings[key] = value;
    });
    setLimits({
      send: Number.parseInt(settings['send-timeout-ms'], 10),
      look: Number.parseInt(settings['look-timeout-ms'], 10),
    });
    return { settings, flag: (key) => yes(settings[key]) };
  });
}

/**
 * The customer's code address (its CSS, icons, blocks): the configured one, else
 * https://{code-ref}--{repo}--{org}.aem.page (EDS host names are lower case, `_` as `-`).
 */
export function codeOrigin(context, settings) {
  if (settings['code-origin']) return settings['code-origin'];
  const label = (text) => String(text).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return `https://${label(settings['code-ref'])}--${label(context.repo)}--${label(context.org)}.aem.page`;
}
