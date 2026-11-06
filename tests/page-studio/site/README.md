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
    `blocks/.<block>/`), with one example per variant, each named by a `library-metadata` table, so DA's Blocks panel
    lists every variant.
  - `buttons.json`: button designs (`styles`), `presets` and the `options` (colours, icon).
  - `page-studio.json`: every Page Studio setting, with a description column. `button-options` is `yes` so colours can be
    tried, although this site's code does not read `[…]` after a button (such a button shows as a link with that text).
- **Pages:** `/` (how to test), `/page-studio/blocks` (every block, some with styles), `/page-studio/variants` (every
  variant of the main blocks), `/page-studio/buttons`, `/page-studio/sections`, `/page-studio/empty` (empty lines to add
  things), `/fragments/sample` (for the Fragment block), `/nav`, `/footer`.

The variants are the site's own: the `==== variants ====` part of `blocks/{cards,columns,hero,quote,accordion,tabs,carousel}/*.css`.

| Block | Variants |
|---|---|
| Cards | `two-up`, `three-up`, `four-up`; `borderless`, `overlay`, `horizontal`; `shadow`, `rounded` |
| Columns | `boxed`, `divided`; `image-wide`, `text-wide`; `align-top`, `align-bottom` |
| Hero | `centered`, `split` (+ `image-left`); `short`, `tall`; `dark-overlay` |
| Quote | `large`, `boxed`, `bordered` |
| Accordion | `flush`; `compact`, `plus` |
| Tabs | `pills`, `underline`, `vertical` |
| Carousel | `light`, `content-below`; `compact` |

Any block also takes the site's utility classes: `center` / `left` / `right`, `center-mobile`, `center-desktop`,
`left-desktop`, `right-desktop`, `brand-primary`, `brand-secondary`, `hide-mobile`, `hide-desktop`.

## Changing it

Edit the files in `da/` (the HTML is DA's source form: `<body><header></header><main>…</main><footer></footer></body>`, a
block as `<div class="name variant">` with its rows as `div > div` cells, a picture that shares a cell with other content
inside a `<p>`), then:

```sh
node tests/page-studio/site/upload.mjs --check              # what differs from DA (reads only)
node tests/page-studio/site/upload.mjs --upload             # write da/ to DA (source only, nothing is published)
node tests/page-studio/site/upload.mjs --upload --config    # ... and config.json as the site's DA config
```

Uploading is outward-facing: it replaces what authors see in DA. It needs a DA login with write access
(`DA_TOKEN`, an IMS access token, is sent when set). For another DA site (`SITE=<org>/<site>`), first replace
`rusmeenkhan1/ew-page-studio` in the image addresses and in `blocks.json`.
