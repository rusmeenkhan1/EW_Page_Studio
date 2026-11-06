# Span Tags

Lets authors apply CSS classes to inline text using a `[[classes]content]` bracket syntax directly in document content. The transformation runs automatically during page load — no block configuration required.

---

## 1. Authoring

### 1.1 Basic syntax

Write `[[classname]text]` anywhere inside a heading, paragraph, or list item:

```
Normal text [[color-secondary]highlighted text] and back to normal.
```

Renders as:

```html
<p>Normal text <span class="color-secondary">highlighted text</span> and back to normal.</p>
```

Multiple classes are comma-separated, with no spaces:

```
[[hide-mobile,color-secondary]this text is hidden on mobile and styled]
```

### 1.2 With bold content

Place the brackets in the surrounding plain text; apply bold formatting only to the content inside:

```
For assistance, call [[color-secondary]**1-833-4-VYEPTI**]
```

The brackets themselves are not bold. Only the content (`**1-833-4-VYEPTI**`) is bold.

### 1.3 With italic content

Apply italic to the content inside the brackets only:

```
Read [[color-secondary]*the full prescribing information*] before use.
```

When the entire expression including the brackets is italicised in the document editor, the result is the same — both rendering patterns are handled automatically.

### 1.4 With a link

```
Call [[color-secondary][1-833-4-VYEPTI](tel:+18334893784)] for support.
```

### 1.5 Inside a list item

The syntax works identically inside list items:

```
- Standard item
- [[color-secondary]highlighted item]
- Standard item
```

### 1.6 Whitespace tolerance

A single space between the class bracket and the content, or before the closing bracket, is accepted:

```
[[color-secondary] text]     ← space after the class bracket
[[color-secondary]text ]     ← space before the closing bracket
```

### 1.7 What works and what does not

| Pattern | Result |
|---------|--------|
| `[[color-secondary]text]` | ✅ single class |
| `[[hide-mobile,color-secondary]text]` | ✅ multiple classes |
| `[[color-secondary]**bold**]` | ✅ bold content |
| `*[[color-secondary]italic]*` | ✅ italic content |
| `[[color-secondary][link](https://example.com)]` | ✅ linked content |
| `[[Color-Secondary]text]` | ❌ uppercase — not matched in bold/italic/link patterns |
| `[[my_class]text]` | ❌ underscore — not matched in bold/italic/link patterns |
| `[color-secondary]text]` | ❌ single opening bracket — not matched |
| `[[color secondary]text]` | ❌ space in class name — not matched |

> **Class name rule for bold, italic, and link content:** use lowercase letters, digits, and hyphens only (`a–z`, `0–9`, `-`). When the content is plain text with no formatting, uppercase letters and underscores are also accepted.

---

## 2. Developer

### 2.1 Where the code lives

The system is implemented in `scripts/feature-flags/bracket-tags.js`. Two functions are exported:

| Export | Purpose |
|--------|---------|
| `decorateSpanTags(element)` | Main entry point — runs all passes on the given element |
| `applySpanTags(text)` | String utility — converts bracket patterns in plain text to an HTML string |

### 2.2 How it is invoked

`decorateSpanTags` is called from `decorateMain()` so it runs during the eager phase, before the LCP paint. The call is gated by the `spanTags` flag in `scripts/feature-flags/features.js` — set it to `false` to skip this pass entirely for projects that don't use bracket syntax:

```javascript
// scripts/scripts.js
import { decorateSpanTags } from './feature-flags/bracket-tags.js';
import FEATURES from './feature-flags/features.js';

export function decorateMain(main) {
  // ...
  if (FEATURES.spanTags) decorateSpanTags(main);
}
```

It processes all `h1`–`h6`, `p`, and `li` elements within the given element.

### 2.3 Pass 1 — single text node

Handles `[[classes]text]` patterns contained entirely within one text node — the common case when the content has no inline formatting.

A `TreeWalker` finds text nodes that contain `[[`. Each matching node is replaced in place with a `DocumentFragment` containing the transformed `<span>` elements and any surrounding plain text. Malformed or invalid patterns are left unchanged.

**Class name validation:** `[a-zA-Z0-9_-]+`

### 2.4 Pass 2 — split-boundary

When an author applies bold, italic, or link formatting to the content inside the brackets, EDS renders that content as a `<strong>`, `<em>`, or `<a>` element — splitting the bracket expression across adjacent sibling nodes. Two structural variants are handled in a single pass:

**Pattern A** — only the content is formatted; brackets remain in surrounding text nodes:

```
"prefix[[classes]"  →  <strong>content</strong>  →  "]suffix"
         ↑ text node                                   ↑ text node
```

Example source: `[[color-secondary]**1-833-4-VYEPTI**]`

**Pattern B** — the entire expression including brackets is formatted (e.g. the author italicised everything):

```
<em>[[</em>  →  "classes"  →  <em>]content]</em>
               ↑ text node
```

Example source: `*[[color-secondary]italic text]*`

Both patterns produce: `<span class="classes"><inline>content</inline></span>`

Eligible inline elements: `<strong>`, `<em>`, `<a>`, `<br>`.

**Class name validation (both patterns):** `[a-z0-9-]+` (lowercase letters, digits, hyphens — stricter than Pass 1 because the class names are read from DOM text nodes that may be affected by browser normalisation).

### 2.5 Attribute cleanup

After both passes, a cleanup step strips residual bracket syntax from attributes that EDS generates automatically before the JS transformation runs:

- **`aria-label` and `title` on `<a>` elements** — bracket syntax is replaced with the plain text content; any resulting double spaces are collapsed.
- **Heading `id` attributes** — re-derived from the heading's clean `textContent` using EDS slugification (lowercase, spaces become hyphens, non-alphanumeric characters removed).

### 2.6 `applySpanTags(text)` — string utility

For use when building HTML strings in block decorators rather than transforming existing DOM nodes:

```javascript
import { applySpanTags } from '../../scripts/feature-flags/bracket-tags.js';

const html = applySpanTags('Call [[color-secondary]1-833-4-VYEPTI] for support.');
// → 'Call <span class="color-secondary">1-833-4-VYEPTI</span> for support.'
```

Content is HTML-escaped before insertion. Uses the same `[a-zA-Z0-9_-]+` validation as Pass 1. Since this is a manual, explicit import (not part of the automatic `decorateMain()` pass), it is unaffected by the `spanTags` feature flag.

### 2.7 Adding new utility classes

Add selectors to `styles/styles.css`. No JS changes are required — any valid class name an author writes in the brackets is applied automatically.

```css
/* styles/styles.css */
.brand-secondary {
  color: var(--brand-secondary);
  --link-color: var(--brand-secondary);
}
```

## Also see /docs/cell-class.md for applying this bracket tag system within a block cell