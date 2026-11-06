# Accessibility Testing

Automated WCAG 2.2 AA testing using [axe-core](https://github.com/dequelabs/axe-core) and Playwright. Tests run from the command line and are enforced on every PR via a GitHub Action.

---

## Setup

No manual setup required. Running `npm install` installs all dependencies and downloads the Chromium browser binary automatically via the `postinstall` script — the same way ESLint and Stylelint are ready to use after install. Once complete, `npm run test:a11y` is available immediately.

---

## Tools

### `@axe-core/playwright` — accessibility rule engine

[axe-core](https://github.com/dequelabs/axe-core) is the industry-standard open-source accessibility engine maintained by Deque, and Adobe's primary tool per internal accessibility guidelines. It evaluates a rendered page against a configurable set of WCAG rules and returns violations grouped by impact level. `@axe-core/playwright` is the official Playwright integration — it injects axe into the browser page and returns structured results that the test runner then filters and reports.

### `@playwright/test` — browser automation and test runner

[Playwright](https://playwright.dev/) drives a real Chromium browser headlessly, ensuring axe-core sees the fully-rendered, JavaScript-decorated DOM — the same state a real user and assistive technology would encounter. Playwright's built-in test runner handles test lifecycle, timeouts, and exit codes without needing a separate framework (no Jest or Mocha).

### Chromium (headless)

The only browser used. Firefox and WebKit are not needed for WCAG compliance testing — rule outcomes are DOM-driven, not rendering-engine-specific. Using a single browser keeps CI install time and local setup minimal.

---

## Running Tests

### Mode 1 — All configured pages

```bash
npm run test:a11y
```

Tests every URL listed in `tests/a11y/a11y.config.js` against the local dev server (`http://localhost:3000` by default). Requires `aem up` to be running.

```bash
# Against a branch preview instead of localhost
A11Y_BASE_URL=https://main--ise-boilerplate--aemdemos.aem.page npm run test:a11y
```

### Mode 2 — One specific URL

```bash
npm run test:a11y <full-url>
```

Ignores the URL list in config entirely. Useful for spot-checking a single page locally or against a preview environment.

```bash
# Local page
npm run test:a11y http://localhost:3000/blocks/accordion

# Branch preview page
npm run test:a11y https://main--ise-boilerplate--aemdemos.aem.page/blocks/accordion
```

---

## Understanding Output

### Pass

```
  ✓  a11y: http://localhost:3000/

1 passed
```

### Fail — critical or serious violation

```
  ✘  a11y: http://localhost:3000/

✖ Violations on http://localhost:3000/:
  [serious] color-contrast: Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
  Help: https://dequeuniversity.com/rules/axe/4.11/color-contrast
    → <a href="/docs/">Read the docs</a>
     Error: Found 1 a11y violation(s) with impact [critical, serious] on http://localhost:3000/

1 failed
```

Exit code is non-zero — lint-equivalent behaviour.

### Warning — moderate or minor violation

```
⚠ Warnings on http://localhost:3000/ (not failing):
  [moderate] label: Ensure every form element has a label
    → <input type="text">
```

Warnings are logged but do not fail the run or change the exit code.

---

## Configuration

All test settings live in `tests/a11y/a11y.config.js`. This is the only file developers need to edit day-to-day.

```js
export default {
  wcagTags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
  failOnImpact: ['critical', 'serious'],
  urls: [
    '/',
    '/docs/library/blocks/accordion',
  ],
};
```

### `wcagTags`

Controls which axe-core rules are evaluated. The default set covers all Level A and AA criteria from WCAG 2.0 through 2.2. Level AAA is intentionally excluded — it is not legally required and cannot be fully satisfied for all content types.

### `failOnImpact`

Violation severity levels that cause a non-zero exit code. `moderate` and `minor` are always warnings and never cause failure, regardless of this setting.

| Impact | Default behaviour |
|--------|------------------|
| `critical` | Fails the run |
| `serious` | Fails the run |
| `moderate` | Warning only |
| `minor` | Warning only |

### `urls`

Relative paths tested in Mode 1. Combined with `A11Y_BASE_URL` at runtime.

**When to add a URL:**
- Add the demo page path for every new block in the same PR that introduces the block
- Add one entry per unique page template

```js
// ✅ DO — one entry per block demo page
urls: [
  '/',
  '/docs/library/blocks/accordion',
  '/docs/library/blocks/carousel',
]

// ❌ DON'T — full URLs or paths without a leading slash
urls: [
  'http://localhost:3000/',
  'docs/library/blocks/accordion',
]
```

---

## GitHub Action (PR Check)

Every pull request runs the a11y check automatically. The workflow extracts the **After URL** from the PR description's Test URLs section and runs Mode 2 against it — no extra input required.

```
- After: https://<branch>--ise-boilerplate--aemdemos.aem.page/
```

If no After URL is found in the PR description, the check fails immediately. This is consistent with the existing PSI check behaviour.

The check appears as `a11y` alongside `aem-psi-check` and `Build / build` in the PR status checks. It uses the same `wcagTags` and `failOnImpact` values from `a11y.config.js` as local runs.

---

## File Structure

```
tests/a11y/
├── a11y.config.js     ← Edit this: WCAG tags, fail threshold, URL list
├── a11y.test.js       ← Test runner (Mode 1 and Mode 2)
├── a11y.reporter.js   ← Custom reporter: clean terminal output
└── run.js             ← Entry point: node tests/a11y/run.js [url]
playwright.config.js   ← Playwright settings (Chromium, timeout, reporter)
.github/workflows/
└── a11y.yml           ← PR check: extracts After URL, runs Mode 2
```

---

## Checklist — Adding a New Block

- [ ] Block demo page is accessible at a stable path
- [ ] Path added to `urls` in `tests/a11y/a11y.config.js` in the same PR
- [ ] `npm run test:a11y` passes locally before opening the PR
