# Token-Driven Design System

## Overview

EDS projects use CSS custom properties (design tokens) to maintain visual consistency and enable
re-skinning. The system is **two-tier**:

- **Tier 1 — global semantic tokens** in `styles/styles.css` `:root`. The single surface a
  customer or theme overrides. Holds the brand palette, type scale, and shared scales (spacing,
  border, radius, motion, focus ring) plus semantic color aliases (`--color-action`,
  `--color-surface`, …).
- **Tier 2 — component tokens** in each `blocks/{name}/{name}-tokens.css`. These give a block its
  own override points but **reference Tier 1** for any brand or dimensional value, e.g.
  `--cards-grid-gap: var(--spacing-m)`. Literals appear only for genuinely block-unique structural
  values (a grid min-width, an aspect ratio).

A theme — or a customer's branding — is therefore just an alternate set of Tier 1 *values*.
Because component tokens reference up the chain, re-skinning touches the global layer, not the
17+ block files. This is what keeps Adobe defaults from "polluting" downstream styling: replace
the semantic layer and every block follows.

## The `@boilerplate` marker (blanket migration scaffolding)

**Every line of every CSS rule in the boilerplate carries a trailing `/* @boilerplate */`** — every
declaration and every selector / at-rule opening line. The whole boilerplate is a throwaway starting
point: its values, and even its selectors and class names, will very likely have nothing to do with
the customer's CSS. The marker is a blunt, per-line stamp meaning **"this line is still untouched
boilerplate — not yet reviewed against the customer."**

It is **scaffolding, not permanent metadata.** There is exactly one tag — no `@brand`/`@structural`
classification, no descriptions (those describe the demo site, which the customer doesn't care
about). It exists only to stop a half-finished migration from looking identical to a finished one,
and it deletes itself as the work progresses.

```css
.cards > ul { /* @boilerplate */
  gap: var(--cards-grid-gap); /* @boilerplate */
}
```

### Resolution: remove, don't flip

As you apply the customer's styling, every line is either rewritten or consciously kept — and
**either way you delete its marker.** "Resolve" a line means one of:

1. **Edit** it to match the customer, then delete its marker, or
2. **Consciously keep** it (it already suits the customer), then delete its marker, or
3. **Delete** the rule/declaration if the customer's design has no use for it.

Never flip the marker to anything — just remove it. Completion is binary and self-evident: **no
`@boilerplate` markers remain.** At that point the files are plain CSS again, with normal selectors
and comments, and it's ordinary frontend development from there on. Audit remaining work at any time:

```sh
# Anchored on the marker token so prose mentions aren't counted:
grep -rn '/\* @boilerplate' styles/ blocks/        # every line still untouched
grep -rc '/\* @boilerplate' styles/ blocks/        # per-file remaining count (progress per block)
```

### Coverage and the one exception

Mark **every** declaration line and **every** selector / at-rule opening line (`.foo { /* … */`,
`@media … { /* … */`, `@font-face { /* … */`). The only things left unmarked are lines that aren't a
rule line and can't carry a stamp cleanly:

- bare closing braces (`}`), blank lines, and standalone comment lines;
- the `@import url('./{block}-tokens.css')` line — this is the permanent token-wiring kept for every
  customer (architecture, not a value to resolve), so it is intentionally left unmarked;
- intermediate selectors in a multi-line selector list (`.a,` / `.b {`) — the marker lands on the
  brace line;
- the tail of a **multi-line value** (e.g. a `grid-template:` spanning several lines) — a comment on
  a value's continuation line breaks `declaration-empty-line-before`, so that one declaration goes
  unmarked. Rare and harmless.

This is applied mechanically across the whole repo; re-running the stamp is idempotent (already-marked
lines are skipped).

### Enforcement: the PostToolUse hook

A Claude Code hook (`.claude/hooks/check-boilerplate-markers.mjs`, wired in `.claude/settings.json`)
runs after every CSS `Edit`/`MultiEdit`. It enforces the rule that is mechanically detectable:
**when you edit a line, its marker must be gone.** It diffs the edit's before/after text and, for any
changed or new line that still carries `/* @boilerplate */`, surfaces it back to the agent
mid-session (exit 2) with a reminder to delete the marker. Consciously-kept lines are a human
judgement the hook can't see, so removing *their* markers stays manual; whole-file writes aren't
diffed. It's a local-dev assistant, not a hard gate — it raises the floor and keeps the signal at the
exact line being edited.

**Mode gate.** This enforcement is for *customer migrations*, not for authoring the boilerplate
itself. The hook checks the git origin: in the `aemdemos/ise-boilerplate` source repo an edit that
keeps its marker is legitimate (tokenizing, tuning a default — the value is still boilerplate), so
the hook stays **silent**. In any other repo (a customer clone) it runs normally. So maintainers can
edit the source boilerplate freely without stripping markers, while every migration gets full
enforcement.

## Token-vs-not policy

Not everything is a token. Pure layout mechanics stay as literals — `100%`, `0`, `1fr`, `auto`,
`50%`, `none`, `repeat(...)`, `vw`/`ch` units, and `display`/`position`/`flex` keywords. Anything
brand-expressive or dimensional (colors, spacing, radius, border width/color, durations, font
sizes, paddings/margins, ratios) **must** be a token. If you find yourself hardcoding such a value
in structural CSS, promote it to a component token that references a Tier 1 token.

## Architecture

```
styles/styles.css                   # Tier 1: global semantic tokens (:root)
blocks/
└── {blockname}/
    ├── {blockname}.js              # Decoration logic
    ├── {blockname}.css             # Structural styles (uses tokens only)
    ├── {blockname}-tokens.css      # Tier 2: component tokens (reference Tier 1)
    └── {blockname}-measurements.txt # Figma measurements reference (optional)
```

The token file is imported at the top of the block's CSS:

```css
/* cards.css */
@import url('./cards-tokens.css');

.cards > ul {
  gap: var(--cards-grid-gap);            /* component token → var(--spacing-m) */
}
```

> Keep Tier 1 inside `styles.css` itself — do **not** split it into an `@import`ed stylesheet, as
> that adds a render-blocking request and risks the PageSpeed-100 requirement.

## Token Naming Convention

All tokens follow a strict naming pattern:

```
--{blockname}-{element}-{property}
```

Examples:
```css
--cards-teaser-max-width              /* Block-level property */
--cards-teaser-heading-font-size      /* Element + property */
--cards-teaser-heading-color          /* Element + property */
--cards-teaser-button-background      /* Element + property */
--cards-teaser-button-hover-background /* Element + state + property */
--cards-teaser-card-border-radius     /* Sub-element + property */
```

## Global semantic tokens (Tier 1)

Defined in `styles/styles.css` `:root`. Component tokens reference these:

```css
/* borders */
--border-width-s: 1px;            /* @boilerplate */
--border-color: #dadada;          /* @boilerplate */
--border-radius-s: 4px;           /* @boilerplate */

/* focus ring */
--focus-ring-width: 2px;          /* @boilerplate */
--focus-ring-offset: 2px;         /* @boilerplate */
--focus-ring-color: var(--link-color); /* @boilerplate */

/* semantic color aliases (still marked — every line is, until reviewed) */
--color-surface: var(--background-color); /* @boilerplate */
--color-action: var(--link-color); /* @boilerplate */
```

Alongside the pre-existing brand palette (`--background-color`, `--text-color`, `--link-color`, …),
font families, and heading/body size scales. When a new component needs a brand or dimensional
value that no Tier 1 token covers, add the semantic token to Tier 1 first, then reference it.

## Worked examples (the exemplar blocks)

`blocks/cards` and `blocks/form` are the reference implementations of the two-tier pattern — copy
their structure when converting other blocks.

```css
/* cards-tokens.css — every line marked until reviewed against the customer */
:root { /* @boilerplate */
  --cards-grid-min-width: 257px; /* @boilerplate */
  --cards-grid-gap: var(--spacing-m); /* @boilerplate */
  --cards-card-border-width: var(--border-width-s); /* @boilerplate */
  --cards-card-border-color: var(--border-color); /* @boilerplate */
  --cards-card-background: var(--color-surface); /* @boilerplate */
  --cards-card-body-margin: var(--spacing-s); /* @boilerplate */
  --cards-image-aspect-ratio: 4 / 3; /* @boilerplate */
  --cards-image-object-fit: cover; /* @boilerplate */
}
```

`form` additionally shows interactive/semantic colors: `--form-input-border-color: var(--dark-color)`,
`--form-toggle-on-background: var(--color-action)`, and focus handled via the global
`--focus-ring-*` tokens — so `form.css` contains no raw brand or dimensional literals.

## Token Categories

Every block token file should cover these categories. The literal values below are **illustrative
of each category** — in real block files, brand/dimensional values reference Tier 1 (e.g.
`--{block}-gap: var(--spacing-s)`) rather than hardcoding:

### 1. Layout & Dimensions

```css
:root {
  /* Container */
  --{block}-max-width: 1180px;
  --{block}-padding-top: 40px;
  --{block}-padding-bottom: 40px;
  --{block}-padding-left: 20px;
  --{block}-padding-right: 20px;

  /* Grid/flex layout */
  --{block}-columns: 4;
  --{block}-gap: 10px;
  --{block}-min-width: 248px;      /* Grid item min-width */
}
```

### 2. Colors

```css
:root {
  /* Backgrounds */
  --{block}-background: #ebefee;
  --{block}-card-background: #ffffff;

  /* Text colors */
  --{block}-heading-color: #830051;
  --{block}-body-color: #363b3b;

  /* Interactive colors */
  --{block}-button-background: #d0006f;
  --{block}-button-hover-background: #a80059;
  --{block}-button-color: #ffffff;

  /* Borders */
  --{block}-border-color: #ebefee;
}
```

### 3. Typography

```css
:root {
  /* Headings */
  --{block}-heading-font-family: "Lexia VF", Georgia, serif;
  --{block}-heading-font-size: 26px;
  --{block}-heading-font-weight: 400;
  --{block}-heading-line-height: 34px;

  /* Body text */
  --{block}-body-font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
  --{block}-body-font-size: 18px;
  --{block}-body-font-weight: 400;
  --{block}-body-line-height: 28px;

  /* Buttons */
  --{block}-button-font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
  --{block}-button-font-size: 16px;
  --{block}-button-font-weight: 600;
  --{block}-button-line-height: 24px;
}
```

### 4. Spacing

```css
:root {
  --{block}-content-padding: 24px;
  --{block}-heading-padding-top: 20px;
  --{block}-body-padding-top: 16px;
  --{block}-button-padding: 8px 16px;
  --{block}-button-min-height: 42px;
}
```

### 5. Borders & Radius

```css
:root {
  --{block}-border-width: 0px;
  --{block}-border-style: none;
  --{block}-border-radius: 8px;           /* Cards, images */
  --{block}-button-border-radius: 4px;    /* Buttons */
}
```

### 6. Effects & Transitions

```css
:root {
  --{block}-transition-duration: 200ms;
  --{block}-transition-timing: ease;
  --{block}-image-aspect-ratio: 4/3;      /* Or 16/9 */
  --{block}-image-object-fit: cover;
}
```

## Complete Token File Example

```css
/* cards-teaser-tokens.css */
:root {
  /* Layout */
  --cards-teaser-max-width: 1180px;
  --cards-teaser-padding-top: 40px;
  --cards-teaser-padding-bottom: 40px;
  --cards-teaser-padding-left: 20px;
  --cards-teaser-padding-right: 20px;
  --cards-teaser-columns: 4;
  --cards-teaser-gap: 10px;
  --cards-teaser-min-width: 248px;

  /* Container */
  --cards-teaser-background: #ebefee;
  --cards-teaser-card-background: #ffffff;
  --cards-teaser-card-border-radius: 8px;
  --cards-teaser-card-border-width: 0px;
  --cards-teaser-card-border-style: none;
  --cards-teaser-content-padding: 24px;

  /* Image */
  --cards-teaser-image-aspect-ratio: 4/3;
  --cards-teaser-image-object-fit: cover;

  /* Heading */
  --cards-teaser-heading-font-family: "Lexia VF", Georgia, serif;
  --cards-teaser-heading-font-size: 26px;
  --cards-teaser-heading-font-weight: 400;
  --cards-teaser-heading-line-height: 34px;
  --cards-teaser-heading-color: #4f0031;

  /* Body */
  --cards-teaser-body-font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
  --cards-teaser-body-font-size: 18px;
  --cards-teaser-body-font-weight: 400;
  --cards-teaser-body-line-height: 28px;
  --cards-teaser-body-color: #363b3b;

  /* Button */
  --cards-teaser-button-font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
  --cards-teaser-button-font-size: 16px;
  --cards-teaser-button-font-weight: 600;
  --cards-teaser-button-line-height: 24px;
  --cards-teaser-button-background: #d0006f;
  --cards-teaser-button-hover-background: #a80059;
  --cards-teaser-button-color: #ffffff;
  --cards-teaser-button-border-radius: 4px;
  --cards-teaser-button-padding: 8px 16px;
  --cards-teaser-button-min-height: 42px;

  /* Transitions */
  --cards-teaser-transition-duration: 200ms;
  --cards-teaser-transition-timing: ease;
}
```

## Measurement Files

When implementing blocks from a design system (e.g., Figma), create measurement reference files that capture exact values from the design:

```
# cards-teaser-measurements.txt

## Container
- Max width: 1180px
- Background: #EBEFEE
- Padding: 40px 20px

## Card
- Background: #FFFFFF
- Border radius: 8px
- Content padding: 24px
- Gap between cards: 10px
- Min card width: 248px
- Columns: 4 (desktop), 2 (tablet), 1 (mobile)

## Image
- Aspect ratio: 4:3
- Object fit: cover
- Border radius: 8px 8px 0 0 (top corners only)

## Typography
- Heading: Lexia VF, 26px, weight 400, line-height 34px, color #4F0031
- Body: Inter, 18px, weight 400, line-height 28px, color #363B3B
- Button: Inter, 16px, weight 600, line-height 24px, color #FFFFFF

## Button
- Background: #D0006F
- Hover: #A80059
- Padding: 8px 16px
- Min height: 42px
- Border radius: 4px
- Transition: 200ms ease
```

These files serve as a bridge between the designer's Figma measurements and the developer's CSS tokens. Keep them as plain text checklists for easy reference.

## Typography Scale

A consistent typography hierarchy across all blocks:

| Role | Font Family | Size | Weight | Line Height | Color |
|------|------------|------|--------|-------------|-------|
| Hero heading | Lexia VF | 56px | 400 | 62px | #ffffff (on dark bg) |
| Intro heading | Lexia VF | 46px | 400 | 52px | #830051 |
| Section heading | Lexia VF | 36px | 400 | 44px | #830051 |
| Card heading | Lexia VF | 26px | 400 | 34px | #4f0031 |
| Body text | Inter | 16-18px | 400 | 24-28px | #363b3b |
| Button text | Inter | 16px | 600 | 24px | #ffffff |

## Color Palette

Brand colors applied consistently via tokens:

| Name | Hex | Usage |
|------|-----|-------|
| AZ Magenta | #830051 | Section headings, primary brand |
| Dark Magenta | #4f0031 | Card headings |
| CTA Pink | #d0006f | Buttons, interactive elements |
| CTA Hover | #a80059 | Button hover state |
| Dark Gray | #363b3b | Body text |
| Light Gray | #ebefee | Section backgrounds, borders |
| Off-White | #f8f8f8 | Alternate section backgrounds |
| Dark | #2e3232 | Dark section backgrounds |
| White | #ffffff | Card backgrounds, button text |

## Button System

Consistent button tokens across all blocks:

```css
/* Standard filled button (primary) */
--button-background: #d0006f;
--button-hover-background: #a80059;
--button-color: #ffffff;
--button-border: 1px solid #d0006f;

/* Ghost/outlined button (secondary) */
--button-background: transparent;
--button-hover-background: #d0006f;
--button-color: #d0006f;
--button-hover-color: #ffffff;
--button-border: 2px solid #d0006f;

/* Shared */
--button-padding: 8px 16px;
--button-min-height: 42px;
--button-border-radius: 4px;
--button-font-size: 16px;
--button-font-weight: 600;
--button-transition: 200ms ease;
```

## Standard Layout

All blocks share a consistent max-width:

```css
--max-width: 1180px;  /* Block content area */
```

With a standard vertical rhythm:
- `40px` — Between sections
- `20px` — Between section heading and content
- `16px` — Between content elements
- `8px` — Small gaps (title block, inline elements)
- `10px` — Card grid gaps
- `30px` — Carousel slide gaps

## Workflow: From Figma to Tokens

1. **Export measurements** from Figma (use Figma's inspect panel)
2. **Create `{block}-measurements.txt`** with raw values organized by element
3. **Create `{block}-tokens.css`** translating measurements to CSS custom properties
4. **Import tokens** at the top of `{block}.css`
5. **Use `var(--token)` everywhere** in the structural CSS — never hardcode values
6. **Test responsive** — tokens should work across breakpoints, add media queries in the structural CSS (not the token file) for responsive overrides

## Tips

- **Reference Tier 1, don't duplicate it** — a component token's value should be `var(--semantic)`
  for any brand/dimensional value; reach for a literal only when the value is genuinely unique to
  the block
- **Every rule line carries `/* @boilerplate */`** until reviewed; on resolution (edit or conscious
  keep), delete the marker — never flip it — so `grep '@boilerplate'` reports what is still untouched
- **Token files contain only `:root` declarations** — no selectors, no structural CSS
- **One token file per block** — keeps customization isolated
- **All visual values come from tokens** — if you're hardcoding a color or size in the structural CSS, it should be a token
- **Measurement files are optional but valuable** — they document the designer's intent and make it easy to verify accuracy
- **Keep the naming hierarchy flat** — `--block-element-property`, not deeply nested
- **Responsive adjustments go in the structural CSS** via media queries, not in the token file