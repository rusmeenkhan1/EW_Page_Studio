/*
 * Page Studio's settings: their defaults and the check of each value. Pure (no DOM): the panels
 * (shared/da.js loadConfig()), the Check view and the command line (cli/studio.mjs) share it.
 */

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
  'site-file': '/page-studio.json', // what the site's code supports (its blocks, its buttons); `no`: none
};

/** Settings the site file may set (`capabilities`); a value in the sheet still wins. */
export const CAPABILITIES = ['button-options', 'button-new-tab', 'button-icons', 'icon-path', 'preview-css'];

export const yes = (value) => ['yes', 'true', 'on', '1'].includes(String(value).trim().toLowerCase());
const YES_NO = ['yes', 'no', 'true', 'false', 'on', 'off', '1', '0'];

/** A sheet path must be a site path to a JSON sheet: no host, no `..`. */
const isSheetPath = (value) => /^\/[\w.-]+(?:\/[\w.-]+)*\.json$/.test(value) && !value.includes('..');

/** A customer code path: a site path, no host, no `..`. */
const isSitePath = (value) => /^\/[\w./-]*$/.test(value) && !value.includes('..');

const oneOf = (...choices) => (value) => choices.includes(value.toLowerCase());
const sitePaths = (value) => value.split(',').every((v) => isSitePath(v.trim()));
const wholeMs = (value) => /^[1-9]\d*$/.test(value);

/** Each setting's check (a value that fails it can't be used) and what Check setup calls it. */
const CHECKS = {
  'library-sheet': [isSheetPath, 'sheet-path'],
  'buttons-sheet': [isSheetPath, 'sheet-path'],
  'site-file': [(v) => v === 'no' || isSheetPath(v), 'sheet-path'],
  'preview-css': [sitePaths, 'site-path'],
  'icon-path': [sitePaths, 'site-path'],
  'code-origin': [(v) => /^https:\/\/[\w.-]+$/.test(v), 'origin'],
  'send-timeout-ms': [wholeMs, 'number'],
  'look-timeout-ms': [wholeMs, 'number'],
  'check-blocks': [oneOf('auto', 'yes', 'no'), 'choice'],
  'button-icons': [oneOf('text', 'option', ...YES_NO), 'choice'],
  'button-options': [oneOf(...YES_NO), 'choice'],
  'button-new-tab': [oneOf(...YES_NO), 'choice'],
};

/**
 * Why a setting's value can't be used (Check setup says so; loadConfig() keeps the default).
 * @returns {string|null} `unknown`, `sheet-path`, `site-path`, `origin`, `number`, `choice`, or null
 */
export function settingProblem(key, value) {
  if (!Object.hasOwn(DEFAULTS, key)) return 'unknown';
  const [valid, problem] = CHECKS[key] || [() => true];
  return valid(value) ? null : problem;
}
