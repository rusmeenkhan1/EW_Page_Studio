# About this example file
This file came from Timothee Maret. He met with one of the largest agency users where she used this file to customize the EMA workflow to her own. Apparently, these instructions reduce bulk migration time by almost an order of magnitude.

# Edge Delivery Services Migration — Agent Instructions

This file **complements** `AGENTS.md` with project-specific migration and authoring rules for the Microsoft EDS migration. It is written entirely for agents (Experience Modernization Agent, Cursor, Composer) executing user prompts on this project.

**Relationship to other docs:**
- **AGENTS.md** — Product-provided (AEM author-kit). General EDS conventions, setup, block patterns. Do not modify.
- **PROJECT.md** — Single source of truth for blocks, tokens, templates, parsers, transformers, and import infrastructure. Keep it up-to-date when creating or modifying blocks, variants, section styles, tokens, or import infrastructure.
- **INSTRUCTIONS.md** — This file. Project-specific rules, constraints, and workflows.

---

## Session Start / Warm-Up

**When the user asks to "warm up by reading the project documentation," or at the start of every session:** Read `INSTRUCTIONS.md` and `PROJECT.md` before proceeding with any tasks. This loads project context, block library, and migration rules.

---

## Migration Workflow

**Do NOT follow the standard 7-step migration process.** Follow our 5-step process:

### Step 1: Template Planning

**Quick-start rule:** If the user provides a single URL with no other context:

1. **Check for child pages** — Navigate to the URL and look for links to sub-pages under the same path (e.g., `/teams/teams-free` might have `/teams/teams-free/features`, `/teams/teams-free/pricing`). If child pages exist, ask the user: "I found [N] child pages under this URL. Do you want to migrate just this page, or include the children too?"
2. **If no children (or user confirms single page):**
   - Scope = single page
   - Templates = 1 new template (name derived from URL path, e.g., `/microsoft-teams/teams-free` → `teams-free`)
   - Check `PROJECT.md` for existing templates that might already cover it
   - Skip directly to Step 2 and present the section inventory for confirmation

Only ask Step 1 questions when the answer isn't obvious (multiple URLs, ambiguous page type, etc.)

**When answers aren't obvious, decide these 4 things with the user:**

1. **Scope** — Single page or multiple pages? If multiple, which URLs?
2. **How many templates?** — Analyze the page patterns and recommend how many distinct templates are needed. Pages with the same structure share a template.
3. **Template name(s)** — Kebab-case, descriptive (e.g., `teams-free`, `blog-article`, `surface-landing`)
4. **Existing or new?** — Does a template already exist in the repo that covers this page type? Check `PROJECT.md`.

### Step 2: Section Inventory & Block Planning

**Section Inventory (do this BEFORE block decisions):**
1. Navigate to the source page at desktop width (≥1400px)
2. List every visual section top-to-bottom and present in this format:

| # | Section | Content | Decision | Block |
|---|---------|---------|----------|-------|
| 1 | Hero | H1 + description + CTA + image | Reuse | `hero` |
| 2 | Features | H2 + 4 tabs with content | Reuse | `advanced-tabs` |
| 3 | Pricing | H2 + plan cards | Reuse | `pricing-cards` |
| 4 | Social | Social icon links | Default | — |

3. Wait for user confirmation before proceeding

**Block Planning (after inventory is confirmed):**

Check for available blocks in this order of priority:
1. **This branch first** — Check `/blocks/` in the current repo for existing blocks
2. **External block repos** — If no local block fits, check these repos for blocks that could be pulled in:
   - https://github.com/aemsites/author-kit
   - https://github.com/aemsites/da-block-collection
   - https://github.com/adobe/aem-boilerplate

Then for each section:
- For `Reuse`: identify which existing local block and variant
- For `Pull from repo`: list the block, which repo it's from, and note it can be copied into this project
- For `New block`: name it, describe its structure, confirm with user
- For `Skip/placeholder`: note what will go there (e.g., "placeholder for JS widget")
- **Template code vs reusable block** — Ask the user. They may know if other pages will need the same block.

**Decision tree for each section:**
```
Section identified
    ↓
Is it just text, headings, links, images?
    ├─ YES → Default content (no block needed)
    └─ NO → Does an existing block handle it?
              ├─ YES → Reuse (or create variant)
              ├─ SIMILAR → Create variant of existing block
              ├─ NO → Create new block
              └─ DYNAMIC/JS → Skip with placeholder
```

**Metadata fields** — Every page gets these in the Metadata block:
- `Title` — Page title
- `Description` — Meta description
- `Template` — Template name (e.g., `teams-free`)
- `Robots` — Index/follow directives (default: blank = index,follow)

Authors can add additional metadata fields later in DA.

### Step 3: Design Tokens & Styles

**Global vs Template — where do styles go?**

| Put in `styles/styles.css` (global) | Put in `templates/{name}/{name}.css` (template) |
|--------------------------------------|--------------------------------------------------|
| Font families | Template-specific brand accent color |
| Color palette (neutrals, grays, site-wide brand colors) | Heading size overrides for that template |
| Spacing scale | Section padding overrides |
| Border radius tokens | Hero layout overrides |
| Button base styles | Block styling overrides scoped to template class |
| Card base styles (shadow, border) | Any style only used by this one template |
| Body/heading base sizes and line-heights | |

**Decision question:** "Would another template on this site use this same value?" If yes → global. If no → template.

**Extract source design tokens FIRST (before writing any CSS):**
1. Navigate to the source page at 1440px viewport
2. Check existing global tokens in `styles/styles.css` — reuse what already matches
3. Capture key measurements that DIFFER from existing tokens:
   - H1/H2/H3 font sizes (mobile + desktop)
   - Body font, heading font, font weights
   - Primary colors (brand, text, link, background, accent)
   - Section padding/spacing patterns
   - Border radius, shadows, line-heights
   - CTA/button styling (colors, padding, border-radius)

**Write CSS and JS:**
- Template styles (`templates/{name}/{name}.css`) — new tokens go here as CSS custom properties
- Template JS (`templates/{name}/{name}.js`) — always create this file; leave empty if no dynamic behavior needed
- New block code (CSS + JS) for any blocks identified in Step 2
- Section styles if needed (added to `section-metadata.css`)

**Commit and push** — Code must be on `main` and synced before Step 4 works (`.aem.page` serves from git).

**Style target:** Don't aim for pixel-perfect — aim for "same feel and proportions"

### Step 4: Migrate to DA

1. **Get DA token** — Ask the user for their DA.live authentication token (if not already provided). Instructions for the user: "Open https://da.live, sign in, open browser DevTools (F12) → Application → Cookies → `https://da.live` → copy the value of the `auth_token` cookie."
2. **Build content** — Generate the HTML content for the page(s) using a migration script that constructs each page following the content format and uploads via the DA Admin API (`PUT https://admin.da.live/source/{org}/{site}/{path}.html`)
3. **Upload test page** — Upload one page to DA
4. **Preview in DA** — Tell the user to open the page in DA editor (`da.live/edit#/{org}/{site}/{path}`) and click Preview. This makes the page available on `.aem.page`.
5. **Provide preview URL** — After the user previews in DA, give them the branch preview URL: `https://{branch}--{repo}--{owner}.aem.page/{path}`
6. **User verifies** — User checks the rendered preview. If issues, iterate CSS/JS → push → re-verify
7. **Bulk migrate** — Once the test page is approved, upload remaining pages to DA

### Step 5: Verify & Fit & Finish

**Verification checklist:**
1. **Open in DA editor** — Open at least one migrated page in DA (`da.live/edit#/{org}/{site}/{path}`). Confirm:
   - Content is visible and editable (not blank)
   - Author can modify text, headings, links
   - Author can swap/add images
   - Block tables are recognizable and structured correctly
   - Metadata block is present with correct fields
2. **Preview on `.aem.page`** — Open the preview URL. Confirm:
   - Page loads without console errors
   - All sections render with content
   - Blocks are decorated (not raw div tables)
   - Images load correctly
3. **Report** — Summarize: pages migrated, blocks used, preview URLs, any issues found

**Fit & Finish (ask the developer):**

After verification, ask: "Would you like to do a fit & finish pass on the styles?"

If yes, this is a responsive style refinement pass:
- **Desktop (1440px)** — Check spacing, font sizes, layout alignment against the source
- **Tablet (768px)** — Check section stacking, card grid columns, padding
- **Mobile (375px)** — Check readability, touch targets, image scaling, no horizontal overflow
- Compare each section against the source site at the same viewport
- Fix CSS issues iteratively: push → verify on `.aem.page` → repeat until clean

**What "done" looks like:**
- [ ] At least one page opens and is editable in DA
- [ ] Preview renders all sections with correct content
- [ ] No console errors on preview
- [ ] Fit & finish completed (or explicitly declined)
- [ ] Code committed and pushed to `main`
- [ ] Preview URLs provided to the user

---

## CRITICAL RULES

1. **Always read files before editing** — Never modify code without reading it first.
2. **Use `box-sizing: border-box`** — When setting explicit width/height on elements with padding.
3. **REUSE existing blocks** — Always check the Block Reference in `PROJECT.md` before creating new blocks or variants.
4. **Keep `PROJECT.md` up-to-date** — Update it when creating/modifying/deleting blocks, variants, section styles, tokens, or import infrastructure.
5. **Create variants, not new blocks** — When a content pattern is similar to an existing block but needs different styling, create a VARIANT of that block (not a new block).
6. **Never import all-caps content as-is** — Convert to Title Case or Sentence case in HTML; apply `text-transform: uppercase` via CSS.
7. **Don't rely on bold/strong for block-wide styling** — Apply `font-weight: 700` via CSS. Reserve `<strong>` only for inline emphasis.
8. **NEVER push HTML content via Git** — Content lives in the CMS (DA), code lives in Git. Never add `.html` files to Git.
9. **Get approval before committing** — Before committing code to Git, show the user what changes will be committed and get their approval.
10. **Code must be compatible with DA markup** — DA wraps inline content in `<p>` tags. Block JS and CSS must handle this with flexible selectors.
11. **Content lives in DA** — All content is authored and stored in DA (Document Authoring). There are no local content files in git. Verify rendering on `.aem.page` preview URLs.
12. **Fragment files (nav, footer)** — Must NOT have `<header>` or `<footer>` tags.
13. **Merge similar items into collection blocks** — Collection blocks designed for multiple items (e.g., `cards`) should use multi-row tables where each row is one item. This only applies to blocks whose JS iterates over all rows.
14. **Use section grid for multi-column layouts** — Never use the `columns` block or multi-row block tables to achieve side-by-side layouts. Use section-metadata `Grid` key instead (e.g., `Grid: 2`, `Grid: 3`). Single-item blocks (`card`, `teaser`, `hero`, etc.) must each be their own block instance, arranged by the section grid.
15. **One row = one block instance for single-item blocks** — If a block's JS processes only `:scope > div` (one inner div), each item must be a separate block.

---

## Image URL Rules

### Microsoft Dynamic Media URLs (`cdn-dynmedia-1.microsoft.com`)

- **Keep Dynamic Media query params intact** — Microsoft Dynamic Media URLs use query params like `resMode`, `op_usm`, `wid`, `hei`, `qlt`, and `fit` for server-side image optimization. Always preserve these params as they control image quality and dimensions.
- **Two CDN sources in this project** — `cdn-dynmedia-1.microsoft.com/is/image/microsoftcorp/` (Dynamic Media images) and `cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/` (static content assets like icons). Keep images at their original CDN path.
- **Wrap images in `<picture>` with `<source>`** — All content images should use `<picture><source type="image/webp" srcset="URL"><img loading="lazy" alt="..." src="URL"></picture>` format.

---

## Block Reuse Guidelines

**IMPORTANT**: When importing new pages or content, ALWAYS prioritize reusing existing blocks and their variants.

### Before Creating a New Block

1. **Check the Block Reference in `PROJECT.md`** — Review all existing blocks and their variants
2. **Analyze if existing blocks can work** — Consider variants, section styles, or new variants
3. **Only create new blocks when** — No existing block can accommodate the content, structure is fundamentally different, or a variant would require >50% new code

### Decision Tree for Content Mapping

```
New content section identified
    ↓
Does it match an existing block's purpose?
    ├─ YES → Use that block (or variant, or section style)
    └─ NO → Is it similar to any existing block?
              ├─ YES → Create new VARIANT of that block
              └─ NO → Create new BLOCK (document it immediately in PROJECT.md!)
```

### Variant Naming Convention

- **Block-specific variants**: Prefix with block name (e.g., `carousel-hero`, `cards-featured`)
- **Generic variants**: Standalone name, reusable across blocks (e.g., `highlight`)

---

## Migration Rules

### Wide Viewport for Content Extraction

**Always set the browser viewport to wide desktop (≥1400px width) before extracting content from source pages.** Responsive images, background images, and some content (mega menus, "Show More") are only correct at desktop widths.

### Variant-First Approach

1. Identify the closest existing block
2. Create a variant class in that block's `.css` file, scoped under the block class (e.g., `.card.dark { ... }`)
3. In the content `.plain.html`, add the variant as a space-separated class after the block name: `<div class="card dark">`
4. Update JS only if the variant requires different DOM decoration
5. Update `PROJECT.md` block variant table

**How block variants work in content:**
```
<!-- Default block -->
<div class="card">...</div>

<!-- Block with style variant -->
<div class="card dark">...</div>

<!-- Block with multiple variants -->
<div class="card dark compact">...</div>
```

In `.plain.html`, use space-separated class names. The parentheses notation (e.g., `Card (dark)`) is for the DA editor block table headers — DA converts those to space-separated classes in the output HTML. Your CSS targets `.card.dark { ... }`.

**How to add variant styles in the block's CSS file:**
```css
/* Default card styles */
.card {
  background: #fff;
  color: #000;
}

/* Dark variant */
.card.dark {
  background: #1b1b1b;
  color: #fff;
}

/* Compact variant */
.card.compact {
  padding: 8px;
  gap: 4px;
}
```

**Key rules:**
- All variant styles live in the **same block's CSS file** — never in a separate file
- Variant classnames are **space-separated** in `.plain.html`: `class="block variant1 variant2"`
- In the DA editor, variants appear in parentheses in block table headers: `Block (variant1, variant2)`
- Variants are for **visual style differences** of the same block structure
- If the DOM structure needs to be fundamentally different, create a new block instead

### Content Format (for DA upload)

Content uploaded via the DA source API (`PUT https://admin.da.live/source/...`) must use this structure:

```html
<body>
  <header></header>
  <main>
    <div><!-- Section 1 -->
      <div class="block-name"><div><div><p>cell 1</p></div><div><p>cell 2</p></div></div></div>
      <p>Default content paragraph</p>
    </div>
    <div><!-- Section 2 -->
      ...
    </div>
    <div><!-- Metadata section (last) -->
      <div class="metadata"><div><div><p>Title</p></div><div><p>Page Title Here</p></div></div></div>
    </div>
  </main>
  <footer></footer>
</body>
```

**Key rules:**
- **Page shell required** — `<body><header></header><main>...</main><footer></footer></body>`
- **Sections** — Each `<div>` directly inside `<main>` is one section
- **Blocks** — `<div class="block-name">` with rows as nested `<div><div>..cells..</div></div>`
- **Cell content wrapped in `<p>`** — Every text, link, or image inside a block cell must be in a `<p>` tag
- **Images in `<p>`** — `<p><picture><source ...><img ...></picture></p>`
- **Section metadata cells in `<p>`** — `<div><div><p>Key</p></div><div><p>Value</p></div></div>`
- **Default content** — Headings (`<h1>`-`<h6>`), paragraphs (`<p>`), lists (`<ul>`) go directly in sections
- CSS handles presentation (bold, uppercase, colors)

---

## Content Architecture

### Strict Separation: Content in CMS, Code in Git

- **Code** (JS, CSS, config): Lives in Git, deployed via AEM Code Sync
- **Content** (HTML pages, fragments): Lives in DA (Document Authoring), previewed/published via AEM admin API

**Rules:** Never push HTML via Git. Never modify `.gitignore` to track HTML. Fragment content (nav, footer) comes from DA.

### DA Constraints

- **20MB per-image limit** — DA rejects images over 20MB during preview/publish with "Image exceeds allowed limit of 20MB". Use 19MB as the safety threshold.
- **DA downloads images from URLs in `.plain.html`** — When content is previewed in DA, it fetches each `<img src="...">` URL and stores the result. Query params in the URL must actually produce a smaller response from the server — decorative params that the server ignores will NOT help.
- **Two image CDN sources in this project**:
  - `cdn-dynmedia-1.microsoft.com/is/image/microsoftcorp/` (Dynamic Media) — Server-side optimized via query params (`wid`, `hei`, `qlt`, `resMode`). Always preserve these params.
  - `cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/` (Static content) — Icons and small assets, already optimized.

### DA Markup Compatibility

DA wraps inline content in `<p>` tags. Block CSS/JS must use flexible selectors (e.g., `:scope > a, :scope > p > a`). Never add JS to unwrap `<p>` tags — fix compatibility in CSS with button resets and in JS with dual selectors.

---

## CSS Guidelines

1. **Never use `!important`** — Increase selector specificity instead
2. **Use CSS custom properties** — Reference design tokens from `PROJECT.md`
3. **Edge-to-edge blocks** — Use `:has()` on wrapper: `main > div:has(.block-name)`
4. **Visually hidden text** — Use `clip-path: inset(50%)` instead of deprecated `clip`
5. **Backdrop filter** — Include both `-webkit-backdrop-filter` and `backdrop-filter`
6. **Avoid fragile selectors** — Don't depend on sibling element sequences. Prefer block/section variants with explicit class names.
7. **Scope all styles to the block class** — `.my-block .child-element`

---

## Advanced Container Blocks

The following blocks are **container blocks** — they wrap other sections and blocks inside them. They are NOT leaf-level content blocks.

### advanced-carousel

A carousel container that holds **child slide blocks** as separate sections. Each slide is its own section containing a slide block (e.g., `hero-carousel-slide`, `teaser`, `banner-carousel-slide`). The carousel's first section contains navigation metadata (slide titles in a list).

**Content structure:**
```
<div>  <!-- carousel section -->
  <div class="advanced-carousel">
    <div><div><ul><li>Slide 1 title</li><li>Slide 2 title</li></ul></div></div>
  </div>
</div>
<div>  <!-- slide 1 section -->
  <div class="hero-carousel-slide">...</div>
</div>
<div>  <!-- slide 2 section -->
  <div class="teaser">...</div>
</div>
```

**Key rules:**
- Each slide is a **separate section** following the carousel section
- Slide blocks can be any block type (hero-carousel-slide, teaser, banner-carousel-slide, etc.)
- The carousel JS collects subsequent sibling sections as slides
- Navigation items (dot labels) come from the `<ul>` list in the carousel block

### advanced-tabs

A tabbed container that holds **child content blocks** as separate sections. Each tab panel is its own section containing one or more blocks. The tabs block contains the tab labels.

**Content structure:**
```
<div>  <!-- tabs section -->
  <div class="advanced-tabs">
    <div><div><ul><li>Tab 1 label</li><li>Tab 2 label</li></ul></div></div>
  </div>
</div>
<div>  <!-- tab 1 panel section -->
  <div class="some-block">...</div>
</div>
<div>  <!-- tab 2 panel section -->
  <div class="another-block">...</div>
</div>
```

**Key rules:**
- Each tab panel is a **separate section** following the tabs section
- Tab panels can contain any blocks or default content
- The tabs JS collects subsequent sibling sections as panels
- Tab labels come from the `<ul>` list in the tabs block

### advanced-accordion

An accordion container that holds **child content blocks** as separate sections. Each accordion item is its own section. The accordion block contains the item titles.

**Content structure:**
```
<div>  <!-- accordion section -->
  <div class="advanced-accordion">
    <div><div><ul><li>Item 1 title</li><li>Item 2 title</li></ul></div></div>
  </div>
</div>
<div>  <!-- item 1 section -->
  <div class="some-block">...</div>
  <p>Default content...</p>
</div>
<div>  <!-- item 2 section -->
  <div class="another-block">...</div>
</div>
```

**Key rules:**
- Each accordion item is a **separate section** following the accordion section
- Item sections can contain any blocks or default content
- The accordion JS collects subsequent sibling sections as collapsible panels
- Item titles come from the `<ul>` list in the accordion block

### advanced-text (Inline Styling for Default Content)

When default content (headings, paragraphs) needs element-specific styling that isn't covered by global CSS, use the `advanced-text` block pattern instead of creating a new block.

**How it works:** The `advanced-text` JS scans `h1` and `p` elements for a `[classname]` prefix in the text content. It strips the brackets and text, then applies the classname to the element. CSS in `advanced-text.css` defines the styles for each classname.

**Example:** `[center]This text will be centered` renders as `<p class="center">This text will be centered</p>`

**Before using advanced-text for styling:**

1. **Check `advanced-text.css` for existing classes** — Current classes:
   - `center` — `text-align: center`
   - `right` — `text-align: right`
   - `red` — `color: red`
   - `blue` — `color: blue`
2. **If a matching class exists** — Add `[classname]` before the text in the `.plain.html` content
3. **If no matching class exists** — Create a new descriptive classname, add it to `advanced-text.css` with the needed styles, then add `[classname]` before the text in the content

**Content format:**
```
<p>[center]This paragraph will be centered</p>
<h1>[blue]This heading will be blue</h1>
<p>[large-intro]This needs a new class for intro paragraph styling</p>
```

**Key rules:**
- Only use for default content that needs one-off styling — NOT for block content
- Keep classnames descriptive and reusable (e.g., `large-intro`, `muted`, `highlight-text`)
- Always check existing classes first before creating new ones
- Update `PROJECT.md` when adding new classes to `advanced-text.css`

---

### section-metadata (Section-Level Styling)

The `section-metadata` block applies styles to the **section container** — NOT to individual blocks. Use it for styles that affect the section as a whole or apply to all blocks within it.

**What section-metadata is for (container-level styles):**
- Background color / background image
- Section padding and margins
- Grid layout for child blocks
- Spacing between blocks
- Text alignment for the entire section
- Color scheme (light/dark text)

**What section-metadata is NOT for:**
- Styling specific to one block — use the block's own CSS instead
- Individual element styles — use `advanced-text` `[classname]` pattern instead

**Supported metadata keys:**

| Key | Purpose | Example Values |
|-----|---------|----------------|
| `Style` | CSS class(es) added to section | `dark`, `light-grey`, `announcement-bar`, `center` |
| `Grid` | Grid column count for child blocks | `2`, `3`, `4`, `5`, `6` |
| `Gap` | Gap size class | `gap-s`, `gap-m`, `gap-l` |
| `Spacing` | Top/bottom padding | `spacing-xs`, `spacing-s`, `spacing-m`, `spacing-l`, `spacing-xl`, `spacing-xxl` |
| `Container` | Container width class | container value |
| `Layout` | Layout mode class | layout value |
| `Background` | Background color or image | Color value, `color-token-*`, or `<picture>` |

**Existing section styles** (defined in `section-metadata.css`):

| Style | Effect |
|-------|--------|
| `dark` | Dark background (#1b1b1b), white text, 40px padding |
| `light-grey` | Light blue tint background, 40px padding, centered h2 |
| `announcement-bar` | Accent dark bg, white text, compact 12px padding, centered |
| `center` | Centers all default content text |
| `spacing-xs` through `spacing-xxl` | Adds top/bottom padding to section |
| `grid` + `grid-2` through `grid-6` | CSS grid layout for child blocks (1col mobile → 2col tablet → N-col desktop) |
| `has-background` | Enables absolute-positioned background image |

**When to add new section styles:**
1. Check if an existing style already handles the need
2. If not, add a new style class to `section-metadata.css`
3. Only add styles that affect the **section container** (background, padding, layout)
4. Update `PROJECT.md` Section Styles table

**Content format:**
```
<div class="section-metadata">
  <div><div>Style</div><div>dark</div></div>
  <div><div>Grid</div><div>3</div></div>
  <div><div>Spacing</div><div>spacing-l</div></div>
</div>
```

---

### General Rules for Container Blocks

- **Container blocks consume sibling sections** — The number of items in the `<ul>` list determines how many subsequent sections are consumed as children.
- **Never nest container content inside the container block div** — Child content goes in separate sections, not inside the container block's own markup.
- **When migrating pages with container blocks** — Count the sections correctly. Each child item = 1 section after the container section.

---

## EDS Authoring Patterns

- **Link → Button**: Link alone in its own paragraph becomes a button
- **Section metadata**: Use `section-metadata` block for styles like `highlight`, `accent-bar`
- **Page templates**: Add `Template: template-name` to page metadata
- **One row per item**: In block tables (carousel, accordion), each row = one item
- **Data tables vs block tables**: Use the `data-table` block for actual data tables; block tables are converted by `convertBlockTables()`

---

## Documentation Maintenance

### When to Update PROJECT.md

| Event | Required Updates |
|-------|------------------|
| New block created | Add to Block Reference with all details |
| New variant added | Update block's variant table |
| Block deleted | Remove from Block Reference |
| New section style | Add to Section Styles table |
| New design token | Add to Design Tokens tables |
| New parser/transformer | Add to Import Infrastructure |
| Migration milestone | Update Migration Status |
| Font change | Update Fonts table |
| New icon added | Add to Icons table |

---

## Key Files

- **Project reference**: `/PROJECT.md` — All project-specific data
- **Global styles**: `/styles/styles.css`
- **Lazy styles**: `/styles/lazy-styles.css` (post-LCP)
- **Blocks**: `/blocks/`
- **Templates**: `/templates/{name}/{name}.css` + `/templates/{name}/{name}.js`
- **Navigation**: Fragment in DA at `/fragments/nav/{template}-header`
- **Footer**: Fragment in DA at `/fragments/nav/{template}-footer`
