# Nested Sections

Lets authors write a section's content once and embed it at other points on the same page using a `[#section-id]` placeholder — useful for a promo, CTA, or disclaimer that needs to repeat without copy-pasting it. The transformation runs automatically during page load — no block configuration required.

---

## 1. Authoring

### 1.1 Give a section an ID

Add a **Section Metadata** block as the last piece of content in the section you want to reuse, with an `id` row:

| Section Metadata |            |
|-------------------|------------|
| id                 | hero-promo |

This sets `data-id="hero-promo"` on the section. The section still renders normally in its authored position — until it is referenced by a placeholder (see 1.4).

### 1.2 Reference it with a placeholder

Anywhere else on the same page, write the ID in a `[#section-id]` placeholder:

```
[#hero-promo]
```

At render time this is replaced with a copy of the `hero-promo` section's content (its headings, paragraphs, images, blocks — everything except the Section Metadata block itself).

`[#id=hero-promo]` is also accepted and is equivalent to `[#hero-promo]`.

### 1.3 Standalone vs. inline placeholders

Put the placeholder **alone on its own line** (its own paragraph, with nothing else in it) when the section you're embedding contains block-level content — blocks, headings, multiple paragraphs, images. The whole line is swapped out for the section's content:

```
Some intro text.

[#hero-promo]

More text after.
```

A placeholder written **inline, mixed with other text**, only replaces the placeholder text itself and leaves the surrounding sentence intact:

```
Please contact support. [#hero-promo] Thank you.
```

Only use inline placeholders for simple text/link content — splicing block-level elements (like a block) into the middle of a sentence produces invalid markup. Prefer a standalone placeholder for anything beyond plain text.

### 1.4 What happens to the original section

Once a section's ID has been used by at least one placeholder, the original section is removed from its authored position — only the copies at the placeholder locations are shown. Content authors should place ID'd "library" sections wherever is convenient in the document (e.g., at the bottom); they are not meant to be seen in place once referenced.

A section with an `id` that is **never** referenced by any placeholder is left completely alone and renders normally where it was authored.

### 1.5 Reusing the same ID more than once

The same `[#section-id]` placeholder can be used multiple times on the page — each occurrence gets its own independent copy of the content.

### 1.6 What works and what does not

| Pattern | Result |
|---------|--------|
| `[#hero-promo]` on its own line | ✅ replaced with the full section content |
| `[#id=hero-promo]` | ✅ equivalent to `[#hero-promo]` |
| `[#hero-promo]` repeated at several points | ✅ each gets an independent copy |
| `[#hero-promo]` inline mid-sentence | ⚠️ only the placeholder text is replaced — fine for simple text, avoid for blocks |
| Two sections both given `id: hero-promo` | ⚠️ the first one in the document is used; the second is left in place, untouched and unused |
| `id: hero-promo` set but no placeholder references it | ℹ️ section renders normally in its authored position, nothing is removed |
| `[#unknown-id]` with no matching section | ❌ left on the page as literal text |

---

## 2. Developer

### 2.1 Where the code lives

The system is implemented in `scripts/feature-flags/sections.js`, alongside the section background-decoration helpers. `decorateNestedSections(main)` is exported for use by `scripts/scripts.js`.

### 2.2 How it is invoked

Called from `decorateMain()` in `scripts/scripts.js`, after sections and blocks have already been decorated. The call is gated by the `nestedSections` flag in `scripts/feature-flags/features.js` — set it to `false` to skip this pass entirely for projects that don't use the `[#section-id]` syntax:

```javascript
// scripts/scripts.js
import { decorateNestedSections } from './feature-flags/sections.js';
import FEATURES from './feature-flags/features.js';

export function decorateMain(main) {
  // ...
  decorateSections(main);
  decorateBlocks(main);
  if (FEATURES.nestedSections) decorateNestedSections(main);
  // ...
}
```

Running after `decorateBlocks` means the content cloned into a placeholder already carries the standard block-decoration markup; running before `loadSection`/`loadSections` means those cloned blocks still get picked up by the normal block-loading pass (see 2.6).

### 2.3 How a section ID is resolved

`getNestedSectionIds(section)` collects every ID a section could be known by, checked in this order:

1. `section.dataset.id` — set via a `section-metadata` block with an `id` key (`decorateSections` copies any non-`style` metadata key to `data-{key}` on the section)
2. `section.id` — the native `id` attribute, if present
3. Any class on the section starting with `id-` (e.g. a class named `id-hero-promo` yields `hero-promo`)

All matches are normalized with `normalizeNestedSectionId()`, which trims whitespace and strips a leading `#` or `id=` prefix — the same normalization applied to the placeholder text, so `[#hero-promo]` and `[#id=hero-promo]` resolve identically.

### 2.4 Finding and matching placeholders

`NESTED_SECTION_RE = /\[#([^\]]+)\]/g` matches `[#...]` placeholders anywhere in the page's text — `collectTextNodes(main, '[#')` walks every text node under `main`, not just headings/paragraphs/list items, so a placeholder can appear in a table cell or any other text context.

`buildNestedSectionMap(main, sectionIds)` then scans every `.section` once, calling `getNestedSectionIds` on each, and records the **first** section matching each referenced ID — a duplicate ID on a later section is silently skipped (it stays in the DOM, untouched).

Each section's content is captured by cloning its children into a detached wrapper `div` (`sectionMap`'s `content`) — the live section is not touched until cleanup (2.6).

### 2.5 Replacing the placeholder — `replaceNestedSectionNode`

For each matched text node:

- **Standalone case**: if the trimmed text node is an exact `[#id]` match *and* it is the only content of its parent element (`parent.textContent.trim() === text.trim()`), the entire parent element is replaced with a clone of the section content. This is the path used for block-level content.
- **Inline case**: otherwise, the text node is split around each `[#id]` match and only the matched text is replaced with a clone of the section content, leaving surrounding text nodes untouched.

Unmatched IDs (no section found) are left as literal text.

`appendNestedSectionContent` adds a `nested-block` class to any `.block` element being inserted (the element itself, or any `.block` descendants) — see 2.6.

### 2.6 Cleanup and the `nested-block` marker

After processing, only sections whose ID was actually consumed (`usedSectionIds`) are removed from the page — sections with an `id` that nothing referenced are left alone.

Blocks pulled in via a nested section are tagged with an additional `nested-block` class. This matters for fragments: `loadFragment()` in [`blocks/fragment/fragment.js`](../blocks/fragment/fragment.js) calls `decorateMain()` and `loadSections()` on the fragment's own detached `main`, then explicitly re-runs `loadBlock()` on any `.nested-block` elements as a safety net:

```javascript
// blocks/fragment/fragment.js
decorateMain(main);
await loadSections(main);

// Load any nested blocks that were inserted by decorateNestedSections
const nestedBlocks = main.querySelectorAll('.nested-block');
await Promise.all([...nestedBlocks].map((block) => loadBlock(block)));
```

`loadBlock` is idempotent (guarded by `block.dataset.blockStatus`), so this reload is safe even when the block was already picked up by `loadSections`.

### 2.7 No block-authoring changes required

Nested sections require no changes to individual block code — a block embedded via `[#section-id]` is the same DOM a block would normally receive, just cloned into a new location before it is loaded. Blocks should not assume anything about their position in the page beyond the standard [block architecture](aem-block-architecture.md) contract.
