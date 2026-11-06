# Page Studio

One Document Authoring (DA) / Experience Workspace extension to add and style **blocks**, **buttons** and
**section settings** on any Edge Delivery Services page, with the page itself as the preview. It follows the
cursor: click in a block, highlight a button or a section's settings, and the right view opens with every
property set; each change shows in the page as you make it.

Generic: nothing in the code is tied to one customer. Each site describes its own blocks, button designs and
section options in DA sheets (see [Configuration](#configuration)), and Page Studio writes plain DA markup that the
site's code renders (see [What Page Studio writes](#what-page-studio-writes)).

| Part | Path |
|---|---|
| Page Studio (the panel DA opens) | `tools/page-studio/page-studio.html` |
| Block view (also a panel on its own) | `tools/page-studio/views/block/block.html` |
| Button view | `tools/page-studio/views/button/button.html` |
| Section view | `tools/page-studio/views/section/section.html` |
| Shared code and look | `tools/page-studio/shared/` (`da.js`, `sheet.js`, `dom.js`, `colour.js`, `ui.js`, `ui.css`) |
| Regression check | `tests/page-studio/golden.mjs` + `fixtures/` (not served) |

---

## For authors

1. In Experience Workspace, open **Page Studio** from the library (Extensions).
2. **Add something:** click an empty line in the page, then choose **Block**, **Button** or **Section settings**
   under *Add here*. A block is placed in the page to try (**Add block** or **Cancel**); section settings are
   written as you pick (**Add settings** or **Cancel**); a button is set up, then **Insert button**. After each
   add, Page Studio comes back to *Add here* with a ✓.
3. **Change something on the page:**
   - click in a block → the **Block** view: style, options, layout, visibility, properties and its content (texts,
     images, buttons, items); under a button of the content, **Button style** opens it in the Button view;
   - highlight any part of a button's text → the **Button** view, with its design, text, link (and colours, icon
     and new tab where the site supports them); **Done** ends editing;
   - highlight a value in a section's settings table → the **Section** view.
4. The path under the name says where the cursor is (**Page › Section 2 › Cards › Button: Join now**); its items
   are links to their view. With a block shown, the line under the path gives its section's settings.
5. Undo (Ctrl+Z or ⌘Z) steps back through every change, as for any edit.

DA tells an extension only which block holds the cursor and what is highlighted, not where a plain cursor is in
text or in a settings table: to change a section's settings, highlight one of its values.

---

## Setup (once per site — outward-facing, done by the site owner)

### 1. Register the extension in DA

DA config of the site (`https://da.live/config#/{org}/{site}/`) → `library` sheet → add a row:

| title | path | icon (optional, shown by the classic editor's menu) |
|---|---|---|
| Page Studio | `https://main--ew-page-studio--rusmeenkhan1.aem.live/tools/page-studio/page-studio.html` | `https://main--ew-page-studio--rusmeenkhan1.aem.live/tools/page-studio/page-studio.svg` |

- **Any site** uses the absolute address above (Page Studio is served from this repository's site; a later
  version can be pinned with a release branch, e.g. `https://v1--ew-page-studio--rusmeenkhan1.aem.live/…`).
- **This repository's own site** may use the relative path `/tools/page-studio/page-studio.html` (then
  `?ref=<branch>` in DA picks the branch).
- The three views can be registered on their own too (`…/views/block/block.html`, etc.), e.g. while authors
  move over.

### 2. The sheets (in the site's DA)

| Sheet | Needed for | Default path |
|---|---|---|
| Block library | the Block and Section views | `/.da/library/blocks` (setting `library-sheet`) |
| Button designs | the Button view (optional: built-in designs without it) | `/.da/library/buttons` (setting `buttons-sheet`) |
| Page Studio settings | everything else (optional: defaults without it) | `/.da/library/page-studio` |

The sheets are DA sheets (saved; they don't need publishing). Page Studio reads them with the author's own DA
login.

### 3. The site's code

Nothing is needed for the boilerplate's own conventions (blocks, `section-metadata`, bold / italic buttons).
Options that need the site to read them are off until a setting turns them on (see
[What Page Studio writes](#what-page-studio-writes)).

---

## Configuration

### Page Studio settings — `/.da/library/page-studio`, tab `settings`, columns `key` | `value`

Every row is optional; unknown keys and invalid values are ignored (the default stays).

| key | default | what it does |
|---|---|---|
| `library-sheet` | `/.da/library/blocks.json` | the block library sheet (blocks, variants, section options), a DA path |
| `buttons-sheet` | `/.da/library/buttons.json` | the button designs sheet |
| `code-ref` | `main` | the branch of the site's code that previews and checks read |
| `code-origin` | `https://{code-ref}--{site}--{org}.aem.page` | the site's code address, if not that one (`https://…` only) |
| `preview-css` | `/styles/styles.css` | the site's CSS for button previews, comma-separated site paths (e.g. `/styles/styles.css, /styles/fonts.css`) |
| `check-blocks` | `auto` | offer only blocks whose code exists: `auto` (checked when Page Studio is served by the site itself), `yes` (always; the site must allow CORS), `no` (trust the sheet) |
| `button-options` | `no` | `yes`: colours, a design's name and fixed extras are written as `[key="value", …]` after the button (the site must read them) |
| `button-new-tab` | `no` | `yes`: "Open in a new tab" is offered and written as `#_blank` at the end of the link (the site must read it) |
| `button-icons` | `no` | `text`: an icon is written as `:name:` in the button text; `option`: as `icon="name"` (the site must keep icons in buttons) |
| `icon-path` | `/icons/` | where the site's icons are (for the Icon picker preview) |
| `send-timeout-ms` | `10000` | how long a view waits for DA to answer a write before it says so and goes on |
| `look-timeout-ms` | `2000` | how long a look at the highlight may take |

### Block library — `library-sheet` (e.g. `/.da/library/blocks`)

- **`data` tab:** `name`, `path` (the block's library document, a DA content address such as
  `https://content.da.live/{org}/{site}/.da/library/blocks/cards`). The block name is the path's last part. Its
  library document gives the starting content of a new block (the example closest to the picked style).
- **`options` tab:** one row per setting.

| column | meaning |
|---|---|
| `key` | the setting (a variant group, a property, or a section-metadata key) |
| `blocks` | comma-separated block names it is for; `section-metadata` for the Section view |
| `values` | `Label=value \| Label=value` (a bare value is its own label) |
| `type` | blocks: `variant` (one style, chips with Default), `variants` (combinable options), `multi` (checkboxes), `content` (names for the Content fields), empty (a `key \| value` property row). Sections: `multi`, `colour`, empty |
| `label` | the setting's name in the panel (else the key) |
| `description` | `value=text \| …` tooltips; a part without `=` is the setting's help line |
| `when` | show the row (`profile`) or a choice (`tall=split \| …`) only while one of those styles is picked |

A property row (`key | value` in the block) is only right for blocks whose code reads it; any other block renders
an extra row as content. Section options: any `section-metadata` row; values that are all `name=#hex` (or type
`colour`) become colour swatches with Custom and a colour code field, writing the hex.

Example rows for this boilerplate:

| key | blocks | values | type | label |
|---|---|---|---|---|
| background-color | section-metadata | Light=#f2f4f7 \| Brand=#e2f7ff | colour | Background colour |
| style | section-metadata | Side by side=flex \| Hide on mobile=hide-mobile \| Hide on desktop=hide-desktop | multi | Section style |
| variant | cards | Grid=grid \| List=list | variant | Card style |

### Button designs — `buttons-sheet` (e.g. `/.da/library/buttons`)

| tab | columns |
|---|---|
| `styles` (optional) | `style` (id), `label`, `marks` (`strong`, `em`, `sub`, `sup`, `u` joined by `+`; empty = a plain link), `classes` (the classes the site gives it, for the preview), `option` (`yes`: written as `style="id"`; needs `button-options`), `icons` (`no`: never an icon) |
| `presets` | `name`, `style`, `label`, `description`, `color`, `text-color`, `options` (fixed `key="value", …` extras; `icon="name"`) |
| `options` | `key` = `color` \| `text-color` \| `icon`, `values` = `Label=value \| …` |

Without a `styles` tab the built-in designs are used: **Primary** (bold), **Secondary** (italic), **Accent** (bold +
italic), **Text link** — the boilerplate's `decorateButtons()`. Without the sheet, the built-in presets too.

---

## What Page Studio writes

The contract between Page Studio and the site's code. It only changes with a new major version.

- **Blocks:** a DA table, its name row `name (variant, variant)` and its rows as authored; property rows
  `key | value`. Variant classes are the site's own (from the sheet).
- **Section settings:** a `section-metadata` table, `key | value` rows from the sheet's keys (a colour as its hex
  code, a `multi` field as comma-separated values).
- **Buttons:** a link alone in its paragraph, wrapped in its design's marks — by default bold, italic or both (the
  boilerplate's primary, secondary, accent). Only with the matching setting on:
  - `button-options`: `[style="id", color="#…", text-color="#…", key="value"]` after the link;
  - `button-new-tab`: `#_blank` at the end of the href;
  - `button-icons`: `:name:` in the text (`text`) or `icon="name"` (`option`).
  Never strikethrough (DA stores `<del>` as text). Links are site paths, `#…`, `?…`, `http(s):`, `mailto:` or `tel:`
  only; colours must be CSS colours or a site token name; all text is escaped.

---

## How it works

- **One DA connection for three views.** `page-studio.html` holds the header (name, path, *All choices*), the
  *Add here* home and three same-origin frames with the views. Its script creates the host
  (`window.pageStudioHost`, `shared/da.js`) before setting the frames' `src`; a view finds the host on its parent
  and uses its SDK, its one `subscribeLiveDocument()` (each message to every view; a later one gets the latest at
  once) and its one look at the highlight every 0.7 s. Opened on its own (its parent is DA, another origin) a view
  makes its own host. (The DA SDK answers only the frame DA opened, so nested frames can't connect themselves.)
- **The view shown** (`choose()` in `page-studio.js`): a button being edited → Button; section settings being
  edited → Section; the cursor in a block → Block; else the *Add here* choice, else the home. A view that is writing
  stays shown. Path items hold their view until the cursor's context changes. Each view reports its state
  (`registerView()`), says when it changed (`notifyChange()`) and counts its adds (`addCount`, after which the home
  shows). Views ask each other through host commands (`registerCommand()` / `runCommand()`: `button:edit`,
  `button:done`).
- **Writes to the page:** DA's `sendHTML(html, { replace: true })` swaps the top-level node at the cursor; with
  `expected: { html, blockIndex }` DA refuses if the cursor left the block or the page changed (one retry on the newer
  page). A section-metadata table or a paragraph has no `blockIndex`, so those writes are checked afterwards (only the
  target changed) and whatever else they replaced is put back, or the author is asked to Undo. The saved source is
  watched for 8 s for a lost page Metadata table (the live document leaves it out).
- **Reading the page:** the live document is DA's `prose2aem()` output: blocks are `div.<name>.<variant>` with
  `data-block-index`; section-metadata is applied to `main > div` attributes and removed. A highlight
  (`getSelection()`) is only the highlighted part, so the whole button is read from the live document.
- **Limits:** every write has `send-timeout-ms`, every highlight look `look-timeout-ms`; after that the view says
  DA didn't answer and follows the cursor again.
- **Look:** `shared/ui.css` (tokens `--ss-*`, cards, fields, swatches, badge, footer) for all views. The Button view
  loads the site's CSS (`preview-css`) at run time into the cascade layer `site`; a `reset` layer rolls the site's
  rules back for everything outside the two preview areas, and the panel's own rules (outside any layer) win — so
  previews are the site's real buttons and the panel looks the same on every site.

---

## Security

- All page writes are built from escaped text; DA HTML is parsed with `DOMParser` (inert) or built as elements —
  no `innerHTML` with outside text, no `eval`.
- Links and colours are validated (see the contract). Sheet paths must be site paths ending in `.json`; preview
  CSS and icon paths site paths; `code-origin` an `https://` host.
- Images in the Content area are fetched with the author's DA token only from `content.da.live`; uploads go next
  to the page (`/{folder}/.{page}/{name}-{stamp}.{ext}`) with the author's own access.
- Nothing is previewed or published by Page Studio.

---

## Testing

```sh
npx -y @adobe/aem-cli up --no-open            # the dev server
node tests/page-studio/golden.mjs --save /tmp/ps-baseline       # before a change
node tests/page-studio/golden.mjs --compare /tmp/ps-baseline    # after it: ✗ shows the first difference
AXE=1 node tests/page-studio/golden.mjs --compare /tmp/ps-baseline   # with the tests/a11y axe rules
```

25 cases with a mocked DA SDK and a neutral demo customer (`tests/page-studio/fixtures/`): each view on its own and
inside Page Studio, adds, live edits, put-backs, the path, Button style, DA answering late, before its live
document, or not at all. Options: `BASE_URL`, `ONLY=<part of a name>`, `CHROMIUM_PATH`. `npm run lint` covers
`tools/page-studio/` (ESLint and stylelint).

Not covered by the harness — check in a signed-in Experience Workspace session before a release: a real DA's
answers and timing, image upload, the Layout view.

---

## Known limits

- A plain cursor in text or in a settings table is invisible to an extension (DA reports only the cursor's block
  and the highlight); section settings open from a highlight.
- Fonts of another site may not load in button previews unless that site allows CORS for its fonts (previews fall
  back to a system font).
- `check-blocks: yes` from another origin needs the site to allow CORS; `auto` trusts the sheet there.
- The view's own words are in each HTML page's `data-*` attributes (one language); the sheets' labels and
  descriptions are the site's.
