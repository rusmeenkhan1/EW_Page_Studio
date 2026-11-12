# Page Studio

One Document Authoring (DA) / Experience Workspace extension to add and style **blocks**, **buttons** and
**section settings** on any Edge Delivery Services page, with the page itself as the preview. It follows the
cursor: click in a block, highlight a button or a section's settings, and the right view opens with every
property set; each change shows in the page as you make it.

Generic: nothing in the code is tied to one customer. Each site describes what its code supports (its blocks'
styles and options, its buttons) in a **site file** next to its code, and what its authors see (labels, help,
what to hide) in DA sheets (see [Configuration](#configuration)). Page Studio writes plain DA markup that the
site's code renders (see [What Page Studio writes](#what-page-studio-writes)).

| Part | Path |
|---|---|
| Page Studio (the panel DA opens) | `tools/page-studio/page-studio.html` |
| Block view (also a panel on its own) | `tools/page-studio/views/block/block.html` |
| Button view | `tools/page-studio/views/button/button.html` |
| Section view | `tools/page-studio/views/section/section.html` |
| Check view (Check setup) | `tools/page-studio/views/check/check.html` |
| Each page's words | `<page>.messages.js` next to it (see [Words](#words)) |
| Shared code and look | `tools/page-studio/shared/`: `da.js` (DA connection, configuration), `config.js` (settings and their checks), `library.js` (blocks and option rows: site file + sheet), `check.js` (Check setup), `write.js` (how views write to the page), `messages.js`, `sheet.js`, `dom.js`, `colour.js`, `ui.js`, `ui.css` |
| Command line (not served) | `tools/page-studio/cli/studio.mjs` (see [The site file](#the-site-file--what-the-sites-code-supports)) |
| Tests (not served) | `tests/page-studio/golden.mjs` + `fixtures/`, `tests/page-studio/library.test.mjs` |

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
6. **Check setup** (under the hints on the home) is for whoever sets the site up: it lists what in the settings,
   the block library and the site file can't work, or works differently from what it says. It changes nothing.

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

### 3. The site's code (recommended: the site file)

Nothing is needed for the boilerplate's own conventions (blocks, `section-metadata`, bold / italic buttons):
everything can come from the sheets, as before. Options that need the site to read them are off until the site
file or a setting turns them on (see [What Page Studio writes](#what-page-studio-writes)).

For more than a few blocks, describe them next to their code instead (see
[The site file](#the-site-file--what-the-sites-code-supports)): one small file per block, reviewed in the same pull
request as its CSS, and a sheet that only holds what authors change.

### 4. Check it

Open **Page Studio → Check setup** in Experience Workspace (or run `studio.mjs check` in the site's repository).
Fix what is under *To fix*; *To look at* works, but not as the setup says.

---

## Configuration

### Page Studio settings — `/.da/library/page-studio`, tab `settings`, columns `key` | `value`

Every row is optional; unknown keys and invalid values are ignored (the default stays) — **Check setup** lists
them. The button settings and `icon-path` / `preview-css` take the site file's `capabilities` when the sheet
leaves them empty; a value in the sheet always wins.

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
| `site-file` | `/page-studio.json` | the site file in the site's code (see [The site file](#the-site-file--what-the-sites-code-supports)); `no`: none |

The same sheet may have these tabs too (each optional):

| tab | columns | what it does |
|---|---|---|
| `cards` | `view` (`block` \| `section`), `label`, `keys` (comma-separated), `holds` (`styles` \| `properties`, Block view) | the cards a view groups its settings in, in order; rows for a view replace that view's own cards. A setting goes in the card listing its key, else (Block view) a style in the `styles` card and a property in the `properties` card; the rest under *More settings* |
| `help` | `key`, `text`, `view` (optional) | a setting's help line, when its option row has no `description` help |
| `messages` | `view` (`page-studio` \| `block` \| `button` \| `section` \| `check`), `element`, `message`, `text` | the site's own words for the panels (see [Words](#words)) |

### Block library — `library-sheet` (e.g. `/.da/library/blocks`)

- **`data` tab:** `name`, `path` (the block's library document, a DA content address such as
  `https://content.da.live/{org}/{site}/.da/library/blocks/cards`). The block name is the path's last part. Its
  library document gives the starting content of a new block (the example closest to the picked style). Blocks
  that only the site file lists are offered too (their library document: `<folder>/blocks/<name>`, next to the
  sheet).
- **`options` tab:** one row per setting. With a site file, only what authors change: see
  [The sheet over the site file](#the-sheet-over-the-site-file).
- **`groups` tab** (optional): `group`, `blocks` — named lists of blocks for the `blocks` column (`@group`).

| column | meaning |
|---|---|
| `key` | the setting (a variant group, a property, or a section-metadata key) |
| `blocks` | the blocks it is for, comma-separated: names, `*` (every block of the library but section-metadata), `@group` (a row of the `groups` tab), `-name` or `-@group` (not those); `section-metadata` for the Section view. e.g. `*, -fragment` |
| `values` | `Label=value \| Label=value` (a bare value is its own label) |
| `type` | blocks: `variant` (one style, chips with Default), `variants` (combinable options), `multi` (checkboxes), `content` (names for the Content fields), `hidden` (takes out a site-file option), empty (a `key \| value` property row). Sections: `multi`, `colour`, empty |
| `label` | the setting's name in the panel (else the key) |
| `description` | `value=text \| …` tooltips; a part without `=` is the setting's help line |
| `when` | show the row (`profile`) or a choice (`tall=split \| …`) only while one of those styles is picked |

A property row (`key | value` in the block) is only right for blocks whose code reads it; any other block renders
an extra row as content. Section options: any `section-metadata` row; values that are all `name=#hex` (or type
`colour`) become colour swatches with Custom and a colour code field, writing the hex.

A setting shared by many blocks is one row (`visibility` for `*, -fragment`), not one per block: a new block gets
it without a sheet edit.

Example rows for this boilerplate (the full sheet of the test site: `tests/page-studio/site/da/.da/library/blocks.json`):

| key | blocks | values | type | label | when |
|---|---|---|---|---|---|
| background-color | section-metadata | Light grey=#f8f8f8 \| Link blue=#3b63fb | colour | Background colour | |
| style | section-metadata | Light background=light \| Centre text=center \| Hide on mobile=hide-mobile | multi | Section style | |
| layout | cards | Two per row=two-up \| Three per row=three-up \| Four per row=four-up | variant | Cards per row | |
| card-options | cards | Shadow=shadow \| Rounded corners=rounded | variants | Card options | |
| image-side | hero | Image on the left=image-left | variants | Image side | split |
| title-size | section-title | XL=xl \| L=l \| M=m | | Title size | |

### Button designs — `buttons-sheet` (e.g. `/.da/library/buttons`)

| tab | columns |
|---|---|
| `styles` (optional) | `style` (id), `label`, `marks` (`strong`, `em`, `sub`, `sup`, `u` joined by `+`; empty = a plain link), `classes` (the classes the site gives it, for the preview), `option` (`yes`: written as `style="id"`; needs `button-options`), `icons` (`no`: never an icon) |
| `presets` | `name`, `style`, `label`, `description`, `color`, `text-color`, `options` (fixed `key="value", …` extras; `icon="name"`) |
| `options` | `key` = `color` \| `text-color` \| `icon`, `values` = `Label=value \| …` |

Without a `styles` tab the built-in designs are used: **Primary** (bold), **Secondary** (italic), **Accent** (bold +
italic), **Text link** — the boilerplate's `decorateButtons()`. Without the sheet, the built-in presets too.

### The site file — what the site's code supports

What a block's code supports changes with its code, so it is kept with its code, in the site's repository:

| File | Written by | Holds |
|---|---|---|
| `blocks/<name>/<name>.studio.json` | the developer of the block (draft: `studio.mjs draft`) | `label`, `options` (rows as in the sheet: `key`, `type`, `label`, `values` as `{ "class": "Label" }` or the sheet's text, `when`, `description`), `content` (`{ "image": "Card image", … }`) |
| `page-studio.site.json` | the site's developers | `capabilities` (`button-options`, `button-new-tab`: `true`/`false`; `button-icons`: `text` \| `option` \| `no`; `icon-path`; `preview-css`), `shared` (options for several blocks, each with a `blocks` cell: `*` = every block with a block file, `@group`, `-name`), `groups`, `section` (`options` for the Section view) |
| `page-studio.json` | `studio.mjs build` (commit it) | both, merged: the one file Page Studio reads (`site-file`) |

```json
{
  "label": "Cards",
  "options": [
    { "key": "layout", "type": "variant", "label": "Cards per row",
      "values": { "two-up": "Two per row", "three-up": "Three per row" } },
    { "key": "card-options", "type": "variants", "values": { "shadow": "Shadow", "rounded": "Rounded corners" } }
  ],
  "content": { "image": "Card image", "heading": "Card title" }
}
```

The command line (`node <Page Studio>/tools/page-studio/cli/studio.mjs <command> [--root <site repository>]`):

| Command | What it does |
|---|---|
| `draft [--force] [--block <name>]` | drafts block files from each block CSS's `/* ==== variants ==== */` part (each comment starts a group; one class: options, several: a style). Review the labels |
| `from-sheet <library-sheet.json> [--force]` | moves an existing site over: block files, `shared` and `section` from its DA library sheet (download it as JSON) |
| `build [--check]` | writes `page-studio.json` (`--check`: fails when it is out of date) |
| `check [--sheet <library.json>] [--settings <page-studio.json>] [--strict]` | Check setup on the files, plus each style against the block's CSS and script and the site's global styles (`--strict`: warnings fail too) |
| `sheet [--out <file>]` | the library sheet's `options` tab from the block files, for a site whose code Page Studio can't read (upload it to DA) |

In this repository: `npm run studio:build`, `npm run studio:check` (CI runs it).

**Reading the site file from another site.** Page Studio fetches `{code-origin}/page-studio.json`. When Page Studio is
served by the site itself, that just works; served from this repository's site (the absolute registration), the
site's code must allow it (an `access-control-allow-origin` header for `/page-studio.json`, in the site's
headers configuration). Until then Check setup says the file can't be read, and everything comes from the sheet;
`studio.mjs sheet` gives that sheet from the block files.

### The sheet over the site file

For a block in the site file, the library sheet's `options` rows change it, they don't repeat it:

- a row with the same `key` changes only the cells it fills (e.g. only `label` and `description`);
- type `hidden` takes the option out (for this site's authors);
- any other row adds an option after the site file's.

So the sheet holds what authors own — wording, help, order of extras, what to hide — and a developer adding a
style to a block's CSS adds it to the block file in the same pull request; nothing else needs an edit.

### Words

What the panels say (statuses, messages, the labels they build) is in each page's messages module
(`page-studio.messages.js`, `views/<view>/<view>.messages.js`): `element` (a CSS selector in the page;
`selector@n` the nth of several) → `{ message: text }`. A site rewords any of them in the settings sheet's
`messages` tab: `view`, `element` and `message` as in the module, `text` its own words (e.g. `block` |
`#bs-form` | `choose` | `Pick a block…`). Check setup's findings: view `check`, element `finding`, message the
finding's code (see `WORDS` in `shared/check.js`). The pages' fixed text (headings, field labels) is still in their
HTML.

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

- **One DA connection for every view.** `page-studio.html` holds the header (name, path, *All choices*), the
  *Add here* home and a same-origin frame per view (Block, Button, Section, Check). Its script creates the host
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
- **Writes to the page** (`shared/write.js`, the same for every view): a change waits for a pause (`pauseTimer()`:
  a pick 350 ms, typing 800 ms). DA's `sendHTML(html, { replace: true })` swaps the top-level node at the cursor;
  `sendInBlock()` adds `expected: { html, blockIndex }`, so DA refuses if the cursor left the block or the page
  changed (one retry on the newer page). A section-metadata table or a paragraph has no `blockIndex`
  (`replaceAtCursor()`), so those writes are checked afterwards (only the target changed) and whatever else they
  replaced is put back by the view, or the author is asked to Undo. The saved source is watched for 8 s for a lost
  page Metadata table (the live document leaves it out). A new view uses the same three and adds its form and
  what it reads and writes.
- **The library** (`shared/library.js`): the site file's blocks, then the sheet's rows over them (see
  [The sheet over the site file](#the-sheet-over-the-site-file)); `*`, `@group` and `-name` are resolved per block. The
  configuration reads the site file once (`loadConfig()`, with a 3 s limit) for all views.
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
  CSS and icon paths site paths; `code-origin` an `https://` host. The site file is read from `code-origin` only;
  its capabilities pass the same checks as the settings, its block names must be `a-z0-9-` words, and its texts are
  only ever set as text.
- The site's words (`messages` tab) are set as attribute values of elements the page already has, and only for
  messages the view has.
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

30 cases with a mocked DA SDK and a neutral demo customer (`tests/page-studio/fixtures/`): each view on its own and
inside Page Studio, adds, live edits, put-backs, the path, Button style, DA answering late, before its live
document, or not at all; a block from the site file (a case's `site` is served as `/page-studio.json`), Check
setup with and without a site file and from the home (its frame loads only when opened), and a site's own words. Options: `BASE_URL`, `ONLY=<part of a name>`,
`CHROMIUM_PATH`. `npm run lint` covers `tools/page-studio/` (ESLint and stylelint).

```sh
npm run test:studio     # the library's rules and Check setup, without a browser (node --test)
npm run studio:check    # this repository's block files: up to date, and each style in the block's code
```

Not covered by the harness — check in a signed-in Experience Workspace session before a release: a real DA's
answers and timing, image upload, the Layout view.

For that, the DA site **rusmeenkhan1/ew-page-studio** is a test site with this repository's blocks and their variants,
a block library with every kind of option row, button designs, every setting and pages to try each view on. Its
content is kept in [`tests/page-studio/site/`](../../tests/page-studio/site/README.md) (`upload.mjs --check` compares it
with DA).

---

## Known limits

- A plain cursor in text or in a settings table is invisible to an extension (DA reports only the cursor's block
  and the highlight); section settings open from a highlight.
- Fonts of another site may not load in button previews unless that site allows CORS for its fonts (previews fall
  back to a system font).
- `check-blocks: yes` from another origin needs the site to allow CORS; `auto` trusts the sheet there.
- The site file from another origin needs the site to allow it (see
  [Reading the site file from another site](#the-site-file--what-the-sites-code-supports)); without that, Page Studio
  uses the sheet only.
- The panels' messages can be reworded per site (`messages` tab); their fixed headings and field labels are in
  the HTML (one language).
