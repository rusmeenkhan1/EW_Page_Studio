# AEM Block Architecture

### Table of Contents
1. [Overview](#1-overview)
2. [Block JSON Structure](#2-block-json-structure)
3. [Universal Editor Integration](#3-universal-editor-integration)
4. [Block Decorator (JavaScript)](#4-block-decorator-javascript)
5. [Block Styling (CSS)](#5-block-styling-css)
6. [Development Workflow](#6-development-workflow)
7. [Troubleshooting](#8-troubleshooting)

---

## 1. Overview

### 1.1 Default Content

Default content is content an author intuitively would put on a page without adding any additional semantics. This includes:

- **Text**: Rich text (including list elements and strong or italic text)
- **Title**: Text, type (h1-h6)  
- **Image**: Source, description
- **Button**: Text, title, url, type (default, primary, secondary)

In AEM, this content is implemented as components with simple, pre-defined models that include everything that can be serialized in Markdown and HTML. The model of these components is part of the boilerplate for projects with AEM authoring as the content source.

### 1.2 What are AEM Blocks?

Blocks are used to create richer content with specific styles and functionality. In contrast to default content, blocks do require additional semantics.

Blocks are essentially pieces of content decorated by JavaScript and styled with a stylesheet.

### 1.3 Why Block JSON is Critical for Universal Editor

When using AEM authoring as your content source, the content of blocks must be modelled explicitly in order to provide the author the interface to create content. Essentially you need to create a model so the authoring UI knows what options to present to the author based on the block.

**Critical JSON Files:**

**component-definitions.json** - Defines which blocks exist:
- Lists the components as they are made available by the Universal Editor
- Controls which blocks can be added to a page using Universal Editor
- Determines what appears in the component palette

**component-models.json** - Defines the model of blocks:
- Fields defined in the component model are persisted as properties in AEM
- These fields are rendered as cells in the table that makes up a block
- Controls what authoring options are available to content creators

**component-filters.json** - Defines child component restrictions:
- Controls which child components can be added to specific blocks
- Enforces structural consistency by limiting allowed nested components
- Prevents authors from adding incompatible content types

**Key Functions:**
- **Authoring Interface**: JSON models generate Universal Editor property panels and form fields
- **Component Behavior**: Controls which blocks appear in UE palette and their nesting rules
- **Rendering Pipeline**: AEM uses models to generate semantic HTML for Edge Delivery Services

---

## 2. Block JSON Structure

### 2.1 File Organization
```
blocks/
  cards/
    _cards.json         ← Component definition
    cards.js            ← Frontend decorator
    cards.css           ← Styling
```

### 2.2 Three Core Sections

#### 1. Definitions
**Purpose**: Defines the block template and basic configuration

```json
{
  "definitions": [
    {
      "title": "Cards",
      "id": "cards",
      "plugins": {
        "xwalk": {
          "page": {
            "resourceType": "core/franklin/components/block/v1/block",
            "template": {
              "name": "Cards",
              "model": "cards",
              "filter": "cards"
            }
          }
        }
      }
    }
  ]
}
```

**Key Properties:**
- `title`: Display name shown in Universal Editor
- `id`: Unique identifier for the block
- `resourceType`: **Must use** `core/franklin/components/block/v1/block` (generic implementation of block logic in AEM)
- `name`: **Must define** block name, which renders in the block's table header and fetches the right style and script to decorate the block
- `model`: **Can define** model ID as reference to component's model (defines fields available in properties panel)
- `filter`: **Can define** filter ID as reference to component's filter (controls authoring behavior, limits children, or enables RTE features)

#### 2. Models
**Purpose**: Defines the block fields and validation for content authoring

```json
{
  "models": [
    {
      "id": "cards",
      "modelFields": ["classes"],
      "fields": [
        {
          "component": "select",
          "name": "classes",
          "label": "Layout Options",
          "valueType": "string",
          "options": [
            {
              "name": "Thumbnail",
              "value": "thumbnail"
            },
            {
              "name": "Teaser", 
              "value": "teaser"
            },
            {
              "name": "Banner",
              "value": "banner"
            }
          ]
        }
      ]
    }
  ]
}
```

**Field Properties:**
- `component`: Field type (text, select, multiselect, reference, etc.)
- `name`: Property name stored in JCR (must be JCR-compliant)
- `label`: User-friendly label shown in Universal Editor
- `valueType`: Data type for validation
- `options`: Available choices for select/multiselect fields

**Field Component Types**:
- `text`: Single line text input
- `text-area`: Multi-line text input
- `text-input`: Alternative text input component
- `richtext`: Rich text editor with formatting
- `select`: Single selection dropdown
- `multiselect`: Multiple selection dropdown
- `date-time`: Date/time picker
- `reference`: AEM content reference picker (DAM assets, pages)
- `number`: Numeric input
- `container`: Groups related fields together
- `boolean`: Checkbox/toggle input

**Advanced Field Features**:
- `multi: true`: Allow multiple values for a field
- `value`: Set default values
- `required`: Mark fields as mandatory

**Container Blocks**:
Container blocks allow adding children (usually of the same type or model) and hence are two-dimensional. These blocks still support their own properties but they also allow adding children.

#### 3. Filters
**Purpose**: Controls which child components can be added to blocks

```json
{
  "filters": [
    {
      "id": "cards",
      "components": ["card"]
    }
  ]
}
```

**Filter Properties:**
- `id`: Filter identifier (matches the filter name used in definitions)
- `components`: Array of allowed child component IDs

**How Filters Work**:
- When `filter: "cards"` is selected
- Only `card` components can be added as children
- Ensures structural consistency

### 2.3 Best Practices

#### JSON Structure Guidelines
- **Consistent naming conventions**:
  - **Block/Component IDs**: Use `kebab-case` (e.g., `"id": "page-metadata"`, `"id": "hero"`) for multi-word block names
  - **Field names**: 
    - Use `camelCase` (e.g., `"name": "publishedDate"`, `"name": "imageAlt"`) for automatic type inference (see [here](https://www.aem.live/developer/component-model-definitions#type-inference) for more info).
    - Since they're stored in AEM, field names must be valid JCR property names
      - Avoid spaces, special characters, and reserved JCR characters (`/`, `:`, `[`, `]`, `|`, `*`)
      - Don't start with numbers or use reserved words (eg. `cq`, `sling`, `jcr`)
  - **CSS class values**: Use `kebab-case` (e.g., `"value": "thumbnail"`, `"value": "roo-tales"`) for values that will be used as CSS class names
- **Clear labels**: Make field labels author-friendly
- **Logical grouping**: Group related options in select dropdowns
- **Validation**: Use appropriate `valueType` for data validation

---

## 3. Universal Editor Integration

### 3.1 How UE uses block JSON

#### 1. Block Palette
- `definitions.title` appears in component palette
- Authors add blocks onto pages

#### 2. Properties Panel
- `models.fields` generate form controls
- Authors configure block behavior/appearance

#### 3. Content Structure
- `filters` determine allowed child components
- Maintains data integrity

### 3.2 JCR Node Structure Example
```json
{
  "block_123": {
    "jcr:primaryType": "nt:unstructured",
    "sling:resourceType": "core/franklin/components/block/v1/block",
    "model": "cards",
    "filter": "cards",
    "classes": "thumbnail",
    "modelFields": ["classes"],
    "item_0": {
      "model": "card",
      "modelFields": ["image", "text", "link"],
      "image": "/content/dam/qantas/hero-image.jpg",
      "text": "<h3>Card Title</h3><p>Card description text</p>",
      "link": "/content/qantas/en/news/article-1"
    }
  }
}
```

### 3.3 modelFields Property
**Critical for UE**: Should include all field names that UE should manage as block properties
```json
"modelFields": ["classes"]
```
Without this, UE won't show property controls.

### 3.4 Page Metadata Integration
Page metadata can be defined using a special `page-metadata` model:

```json
{
  "id": "page-metadata",
  "modelFields": ["theme", "pageTopics"],
  "fields": [
    {
      "component": "text",
      "name": "theme",
      "label": "Theme"
    },
    {
      "component": "multiselect", 
      "name": "pageTopics",
      "label": "Page Topics",
      "options": ["..."]
    }
  ]
}
```

**Key Points**:
- Model ID must be `page-metadata`
- Maps to document `<meta>` elements
- Available in Universal Editor page properties
- Can define template-specific metadata using `<template>-metadata`

### 3.5 Sections and Section Metadata
Sections are a way to group default content and blocks by the author. Most of the time section breaks are introduced based on visual differences between sections such as a different background color for a part of a page.

* Blocks and default content are always wrapped in a section, even if the author doesn’t specifically introduce section breaks.
* Sections can have their own models using `core/franklin/components/section/v1/section` resource type:
```json
{
  "title": "Tab Section",
  "id": "tab",
  "plugins": {
    "xwalk": {
      "page": {
        "resourceType": "core/franklin/components/section/v1/section",
        "template": {
          "name": "Tab",
          "model": "tab",
          "filter": "section"
        }
      }
    }
  }
}
```

Section metadata renders as key-value blocks automatically when non-empty.

---

## 4. Block Decorator (JavaScript)

### 4.1 Purpose
Transforms the markup of a block to the structure that’s needed or convenient for desired styling and functionality.

Block decorators are JavaScript functions that process raw HTML from AEM and transform it into rich, interactive components on Edge Delivery.

### 4.2 Basic Structure
Every block decorator follows a consistent pattern: receive a block element, process its content, and transform it into the final component structure prior to rendering.

```javascript
// blocks/cards/cards.js
export default async function decorate(block) {
  // 1. Process block children (authored content)
  // 2. Transform into semantic HTML
  // 3. Add interactivity if needed
  // 4. Replace original block content
}
```

### 4.3 Decorator Implementation Example
Decorator patterns showing data extraction from AEM's table structure and semantic HTML generation.

#### 1. Data Processing
```javascript
// Extract card data from block structure
const cards = [...block.children].map((card) => {
  const [image, text, link] = card.children;
  return {
    image: image.querySelector('img'),
    text: text.innerHTML,
    link: link.textContent.trim()
  };
});
```

#### 2. HTML Generation
```javascript
// Create semantic cards structure
const cardContainer = document.createElement('div');
cardContainer.className = 'cards-container';

cards.forEach(cardData => {
  const cardElement = document.createElement('div');
  cardElement.className = 'card';
  // Build card content
});
```

#### 3. Layout Variants
```javascript
// Apply layout based on class
if (block.classList.contains('banner')) {
  cardContainer.classList.add('banner-layout');
} else if (block.classList.contains('teaser')) {
  cardContainer.classList.add('teaser-layout');
}
```

#### 4. Content Replacement
```javascript
// Replace authored content with generated cards
block.replaceChildren(cardContainer);
```

---

## 5. Block Styling (CSS)

### 5.1 Purpose
Block CSS files define the visual appearance and layout of blocks, handling responsive design, variants, and theming.

### 5.2 Basic Structure
Block CSS follows a hierarchical structure: main block class, followed by nested elements.

```css
/* blocks/cards/cards.css */
.cards {
  /* Base block styles */
  display: grid;
  gap: 1rem;
  padding: 2rem 0;
}

.cards .card {
  /* Individual card styles */
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
```

### 5.3 CSS Implementation Example
Here are examples showing styling for variants and responsive design.

#### 1. Layout Variants
```css
/* Thumbnail layout */
.cards.thumbnail {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

/* Banner layout */
.cards.banner {
  grid-template-columns: 1fr;
}

.cards.banner .card {
  display: flex;
  flex-direction: row;
  align-items: center;
}

/* Teaser layout */
.cards.teaser {
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

.cards.teaser .card {
  text-align: center;
}
```

#### 2. Responsive Design
```css
/* Desktop (default - no media query) */
.cards {
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  padding: 2rem;
}

/* Tablet and smaller */
@media (width <= 1024px) {
  .cards {
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
    padding: 1.5rem;
  }
}

/* Mobile and smaller */
@media (width <= 580px) {
  .cards {
    grid-template-columns: 1fr;
    gap: 1rem;
    padding: 1rem;
  }
}
```

---

## 6. Development Workflow

### 6.1 Component Definition
```bash
# Create block directory
mkdir blocks/my-block

# Create required files
touch blocks/my-block/_my-block.json
touch blocks/my-block/my-block.js
touch blocks/my-block/my-block.css
```

### 6.2 JSON Development
1. Define `definitions` with basic structure
2. Create `models` with required fields
3. Add `filters` for child components (if needed)

### 6.3 Build Process
```bash
# Compile JSON definitions
npm run build:json

# Output files
component-definition.json   # Compiled definitions
component-models.json      # Compiled models  
component-filters.json     # Compiled filters
```

### 6.4 Testing Cycle
1. Build JSON: `npm run build:json`
2. Push code changes to Github Repo
3. Goto AEM and test block in Universal Editor
4. Iterate based on authoring experience

### 6.5 Frontend Development
1. Create decorator logic
2. Test with sample content
3. Handle edge cases and variants

---

## 7. Troubleshooting

#### "Properties panel not showing"
**❌ Missing modelFields:**
```json
{
  "model": "cards",
  "classes": "thumbnail"
}
```

**✅ Include modelFields:**
```json
{
  "model": "cards", 
  "modelFields": ["classes"],
  "classes": "thumbnail"
}
```

#### "Component not in palette"
- Check `definitions.title` exists
- Verify JSON is valid (use JSON validator)
- Ensure `npm run build:json` was executed
- Confirm deployment to AEM

#### "Child components not available"
- Verify `filters` section includes component IDs
- Check filter assignment in definition
- Ensure child component definitions exist

#### "Block not rendering"
```javascript
// ✗ Syntax error breaks decorator
export default async function decorate(block) {
  // Missing return or error in logic
}

// ✓ Always test decorator syntax
export default async function decorate(block) {
  try {
    // Your logic here
  } catch (error) {
    console.error('Block decoration failed:', error);
  }
}
```