# Page Studio test site

The content of the DA site **rusmeenkhan1/ew-page-studio** (`https://da.live/#/rusmeenkhan1/ew-page-studio`), kept here so it
can be reviewed, changed and put back. It lets every part of Page Studio be tried in Experience Workspace
against this repository's own blocks. `tests/` is in `.hlxignore`: none of it is served by the site.

| Path | What it is |
|---|---|
| `da/` | The DA files, at their DA paths (`da/index.html` is `/index`) |
| `config.json` | The site's DA config: the `library` rows (Page Studio, Blocks, the three views on their own) |
| `upload.mjs` | Compares DA with `da/`, or uploads `da/` (and the config) to DA |

## What is in it

- **Block library** (`/.da/library/`):
  - `blocks.json`: its `data` tab is the block list, for DA's Blocks panel and Page Studio. Its `options` tab has every
    kind of option row Page Studio reads: single-choice styles (`variant`), combinable ones (`variants`), `key | value`
    properties (Section title), `content` names, a `when` row (Hero *Image side*, only with *Image beside text*) and the
    section options (`multi`, `colour`, text).
  - `blocks/<block>.html`: one library document per block (from the ISE boilerplate's library, its images under
    `blocks/.<block>/`), each example named by a `library-metadata` table. Since 2026-11-12 it keeps every plain
    example and one example per content shape; examples that only showed a style class were taken out (Page Studio
    sets the classes from the block file, and starts a new block from the closest example). So DA's own Blocks panel
    lists fewer named variants; `/page-studio/variants` still shows every one. **Not uploaded yet**: DA still has the
    longer documents until `upload.mjs --upload --changed` is run.
  - The blocks' styles and options are also in this repository's block files (`blocks/<block>/<block>.studio.json`,
    made from this sheet with `studio.mjs from-sheet`) and its site file (`page-studio.json`). The sheet's `options`
    tab is left as it is, so the test site works whether or not Page Studio can read the site file; to try the
    sheet as overrides only, keep just the rows that change labels or hide options.
  - `buttons.json`: button designs (`styles`), `presets` and the `options` (colours, icon).
  - `page-studio.json`: every Page Studio setting, with a description column. `button-options` is `yes` so colours can be
    tried, although this site's code does not read `[…]` after a button (such a button shows as a link with that text).
    Check setup says so (the site file's capabilities say `button-options: false`): it is the example of a setting
    that doesn't match the code.
- **Pages:** `/` (how to test), `/page-studio/blocks` (every block, some with styles), `/page-studio/variants` (every
  variant of the main blocks), `/page-studio/buttons`, `/page-studio/sections`, `/page-studio/empty` (empty lines to add
  things), `/fragments/sample` (for the Fragment block), `/nav`, `/footer`.

The variants are the site's own: the `==== variants ====` part of each block's CSS (`blocks/<block>/<block>.css`, its
tokens in `<block>-tokens.css`).

| Block | Variants |
|---|---|
| Cards | `two-up`, `three-up`, `four-up`; `borderless`, `overlay`, `horizontal`; `shadow`, `rounded` |
| Card Carousel | `two-up`, `three-up`, `four-up` (cards in view); `borderless`, `overlay`; `shadow`, `rounded` |
| Columns | `boxed`, `divided`; `image-wide`, `text-wide`; `align-top`, `align-bottom` |
| Hero | `centered`, `split` (+ `image-left`); `short`, `tall`; `dark-overlay` |
| Quote | `large`, `boxed`, `bordered` |
| Accordion | `flush`; `compact`, `plus` |
| Tabs | `pills`, `underline`, `vertical` |
| Carousel | `light`, `content-below`; `compact` |
| Table | `striped`, `bordered`, `no-header` (the boilerplate's); `compact`, `first-column`, `centered`; `header-dark` |
| Video, Embed | `small`, `wide`; `rounded`, `shadow` (Video also `autoplay`) |
| Search | `minimal` (the boilerplate's); `large`, `rounded`; `list` |
| Section title | `underline`, `bordered`, `divider`; `subtitle-above`, `uppercase` (size, alignment and colour are its `key \| value` properties) |
| Fragment | `boxed`, `bordered`; `narrow` |

Two blocks needed code for their variants to survive: Embed kept only `embed embed-<kind>` once loaded (it now adds to
the classes), and a Fragment is replaced by its content, so `fragment.js` gives that content the variants as
`fragment-<variant>` (on the fragment's sections, or on its wrappers when it shares a section). For the same reason the
utility classes below don't apply to a Fragment.

Any other block also takes the site's utility classes: `center` / `left` / `right`, `center-mobile`, `center-desktop`,
`left-desktop`, `right-desktop`, `brand-primary`, `brand-secondary`, `hide-mobile`, `hide-desktop`.

## Changing it

Edit the files in `da/` (the HTML is DA's source form: `<body><header></header><main>…</main><footer></footer></body>`, a
block as `<div class="name variant">` with its rows as `div > div` cells, a picture that shares a cell with other content
inside a `<p>`), then:

```sh
node tests/page-studio/site/upload.mjs --check              # what differs from DA (reads only)
node tests/page-studio/site/upload.mjs --upload --changed   # write only what differs (source only, nothing is published)
node tests/page-studio/site/upload.mjs --upload             # write all of da/ to DA
node tests/page-studio/site/upload.mjs --upload --config    # ... and config.json as the site's DA config
```

Uploading is outward-facing: it replaces what authors see in DA. It needs a DA login with write access
(`DA_TOKEN`, an IMS access token, is sent when set). For another DA site (`SITE=<org>/<site>`), first replace
`rusmeenkhan1/ew-page-studio` in the image addresses and in `blocks.json`.
