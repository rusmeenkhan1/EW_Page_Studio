# Block Selector Targeting (UE/DA)

Summary of how HTML structure and selectors work for AEM Edge Delivery blocks when targeting components in Universal Editor / Document Authoring. Use this when defining or fixing block models (e.g. `ue/models/blocks/*.json` and `component-definition.json`).

---

## 1. When selectors are evaluated

- Selectors are evaluated against the **decorated DOM** — i.e. **after** the block’s JavaScript has run and transformed the HTML.
- If the block JS **replaces or removes** the elements that the selectors point at, those elements never get `data-aue-*` attributes and won’t show as editable in the content tree.
- **Rule:** Selectors must target elements that **still exist** in the final (decorated) HTML.

---

## 2. Container blocks (accordion, cards, carousel, tabs)

### 2.1 Use `ul` > `li` for items

- Structure that works well: block root → `ul` → one `li` per item.
- Each `li` is the “row” the UE treats as one component instance (e.g. one Card, one Accordion Item).

### 2.2 Move instrumentation onto the item (`li`)

- Call `moveInstrumentation(row, li)` so that `data-aue-resource`, `data-aue-type`, `data-aue-label`, `data-aue-component` are on the **item** element (the `li`).
- Without this, the content tree won’t show the item as a component and nested fields won’t be targetable.

Example (conceptually, like cards/accordion):

```js
import { moveInstrumentation } from '../../scripts/scripts.js';

const ul = document.createElement('ul');
[...block.children].forEach((row) => {
  const li = document.createElement('li');
  moveInstrumentation(row, li);
  // ... then move row’s content into li
  ul.append(li);
});
block.textContent = '';
block.append(ul);
```

### 2.3 Keep original column divs as direct children of the item

- The **same** divs that represent “column 1”, “column 2” in the authored table must stay as **direct children** of the `li` after decoration.
- Do **not** replace them with new elements (e.g. `<details>/<summary>`) if those new elements are what the selectors point to — DA won’t see the original structure.
- Pattern that works: append the row’s child divs into the `li` (e.g. `while (row.firstElementChild) li.append(row.firstElementChild)`), then only add classes or wrap in non-destructive structure so that the first and second div remain the first and second child of the `li`.

Resulting structure:

```html
<ul>
  <li data-aue-resource="..." data-aue-type="component" data-aue-label="Accordion Item" ...>
    <div class="accordion-item-label">   <!-- column 1 = summary -->
      <p>...</p>
    </div>
    <div class="accordion-item-body">     <!-- column 2 = text -->
      <p>...</p>
    </div>
  </li>
</ul>
```

### 2.4 Container vs item: rows/columns

- **Container** (e.g. Accordion, Cards): use `rows: 1, columns: 2` (or whatever matches the **item** row layout). This tells DA the shape of each item row so it can find item instances.
- **Item** (e.g. Accordion Item, Card): use the same `rows: 1, columns: 2` and **field selectors relative to the item** (the `li`).

### 2.5 How the container knows its items

- The **filter** links container and item: container has `"filter": "accordion"`, and a filter definition lists `"components": ["accordion-item"]`.
- No extra “item selector” is needed on the container; DA infers direct children of the block (e.g. each `li`) as instances of the allowed component.

---

## 3. Field selectors for container items

- Field selectors are evaluated **relative to each item** (e.g. each `li`).
- Use the same pattern as cards:
  - **Column 1** → `div:nth-child(1)` (and optionally more specific, e.g. `div:nth-child(1)>picture>img[src]` for image).
  - **Column 2** → `div:nth-child(2)`.
- Do **not** use the block class in the selector (e.g. avoid `.accordion div:nth-child(1)`); the context is already the item.

Example for accordion item:

```json
"fields": [
  { "name": "summary", "selector": "div:nth-child(1)" },
  { "name": "text", "selector": "div:nth-child(2)" }
]
```

---

## 4. Standalone blocks (e.g. Hero)

- No filter; no child components. The block is one component with multiple fields.
- Selectors are **relative to the block root**.
- Use `div:nth-child(1)`, `div:nth-child(2)` for rows/columns, then narrow down (e.g. `div:nth-child(1)>div>picture>img[src]` for image, `div:nth-child(2)>div` for text).
- The block JS should **not** remove or replace those divs if they are the ones being targeted.

---

## 5. Checklist when a block’s children don’t show in the content tree

1. **Container blocks:** Does the block use `ul` > `li` and call `moveInstrumentation(row, li)`?
2. **Container blocks:** Are the original column divs still **direct children** of the `li` after decoration (not replaced by new elements)?
3. **Selectors:** Do they target elements that exist in the **decorated** HTML? (Inspect the live DOM.)
4. **Selectors:** Are they relative to the right context (block root for standalone, item for container items) and use the same structure as working blocks (e.g. `div:nth-child(1)` / `div:nth-child(2)`)?
5. **Container:** Is `rows`/`columns` set on the container (e.g. `1` and `2`) so DA can parse item rows?
6. **Filter:** Does the container have a filter and does the filter list the item component id?

---

## 6. Reference: cards (working pattern)

- **HTML (conceptually):** `block > ul > li > div.cards-card-image, div.cards-card-body` (column divs preserved).
- **Item fields:** `div:nth-child(1)>picture>img[src]`, `div:nth-child(1)>picture>img[alt]`, `div:nth-child(2)`, etc.
- **JS:** `ul`/`li`, `moveInstrumentation(row, li)`, move row children into `li`, add classes only.

Use this pattern when adding or fixing another block (e.g. carousel, tabs) in a **different chat**: same structure (ul/li, preserve column divs, moveInstrumentation, selectors relative to item).