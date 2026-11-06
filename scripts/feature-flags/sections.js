import { collectTextNodes } from '../utils.js';

/* === SECTION BACKGROUND DECORATION === */

/**
 * Rejects values that could break out of a single CSS declaration when set via inline style.
 * @param {string} value Trimmed color value
 * @returns {boolean}
 */
function isSafeBackgroundColorValue(value) {
  if (!value || value.length > 500) return false; // CWE-770
  if (/[;{}<>\n\r]/.test(value)) return false;
  return true;
}

/**
 * Allows https URLs for background images, plus http for localhost during local development.
 * Works with a dynamic media URL too.
 * @param {string} url
 * @returns {boolean}
 */
function isAllowedBackgroundImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim(), window.location.href);
    return u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost');
  } catch {
    return false;
  }
}

/**
 * First string from metadata (handles single link vs array from readBlockConfig).
 * @param {unknown} value
 * @returns {string}
 */
function metaStringValue(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') return value[0];
  return '';
}

/**
 * Sets inline background-color and optionally prepends a decorative .bg-image layer.
 * Keys match section model fields and {@link readBlockConfig}: `background-color`, `background-image`.
 * @param {HTMLElement} section
 * @param {Record<string, unknown>} meta
 */
export function applySectionBackgroundDecorations(section, meta = {}) {
  const color = metaStringValue(meta['background-color']).trim() || metaStringValue(meta.background).trim();
  if (color && isSafeBackgroundColorValue(color)) {
    section.style.setProperty('background', color);
  }

  const imageUrl = metaStringValue(meta['background-image']).trim();
  if (!imageUrl || !isAllowedBackgroundImageUrl(imageUrl)) return;

  // localhost never has a valid TLS cert; downgrade https → http so the request succeeds
  const parsedUrl = new URL(imageUrl.trim(), window.location.href);
  if (parsedUrl.hostname === 'localhost') parsedUrl.protocol = 'http:';
  const safeImageUrl = parsedUrl.href;

  const bg = document.createElement('div');
  bg.className = 'bg-image';
  const picture = document.createElement('picture');
  const img = document.createElement('img');
  img.src = safeImageUrl;
  img.alt = 'decorative background';
  img.loading = 'lazy';
  img.decoding = 'async'; // prevent blocking the main thread
  picture.append(img);
  bg.append(picture);
  section.classList.add('has-background');
  section.prepend(bg);
}

/* === END SECTION BACKGROUND DECORATION === */

/* === NESTED SECTIONS ===
 * Nested section syntax: [#section-id] → cloned content from a section with a matching ID.
 * See /docs/nested-sections.md
 */

const NESTED_SECTION_RE = /\[#([^\]]+)\]/g;
const NESTED_SECTION_ONLY_RE = /^\[#([^\]]+)\]$/;

function normalizeNestedSectionId(value) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/^#/, '')
    .replace(/^id\s*=\s*/i, '')
    .trim();
}

function collectNestedSectionIds(nodes) {
  const sectionIds = new Set();
  nodes.forEach((node) => {
    let match;
    NESTED_SECTION_RE.lastIndex = 0;
    // eslint-disable-next-line no-cond-assign
    while ((match = NESTED_SECTION_RE.exec(node.nodeValue)) !== null) {
      const sectionId = normalizeNestedSectionId(match[1]);
      if (sectionId) sectionIds.add(sectionId);
    }
  });
  return sectionIds;
}

function getNestedSectionIds(section) {
  const ids = [
    normalizeNestedSectionId(section.dataset.id),
    normalizeNestedSectionId(section.id),
  ].filter(Boolean);

  section.classList.forEach((className) => {
    if (className.startsWith('id-')) {
      const sectionId = normalizeNestedSectionId(className.slice(3));
      if (sectionId) ids.push(sectionId);
    }
  });

  return [...new Set(ids)];
}

function buildNestedSectionMap(main, sectionIds) {
  const sectionMap = new Map();

  main.querySelectorAll('.section').forEach((section) => {
    getNestedSectionIds(section).forEach((sectionId) => {
      if (!sectionIds.has(sectionId) || sectionMap.has(sectionId)) return;

      const content = document.createElement('div');
      [...section.children].forEach((child) => {
        content.appendChild(child.cloneNode(true));
      });
      sectionMap.set(sectionId, { content, element: section });
    });
  });

  return sectionMap;
}

function appendNestedSectionContent(fragment, sectionData) {
  const content = sectionData.content.cloneNode(true);
  const elements = [...content.children];

  elements.forEach((el) => {
    const blocks = el.classList.contains('block') ? [el] : [];
    blocks.push(...el.querySelectorAll('.block'));
    blocks.forEach((block) => block.classList.add('nested-block'));
    fragment.appendChild(el);
  });
}

function replaceNestedSectionNode(textNode, sectionMap, usedSectionIds) {
  const text = textNode.nodeValue;
  const parent = textNode.parentElement;
  const onlyMatch = text.trim().match(NESTED_SECTION_ONLY_RE);

  if (parent && onlyMatch && parent.textContent.trim() === text.trim()) {
    const sectionId = normalizeNestedSectionId(onlyMatch[1]);
    const sectionData = sectionMap.get(sectionId);
    if (!sectionData) return;

    const fragment = document.createDocumentFragment();
    appendNestedSectionContent(fragment, sectionData);
    parent.before(fragment);
    parent.remove();
    usedSectionIds.add(sectionId);
    return;
  }

  const fragment = document.createDocumentFragment();
  let changed = false;
  let lastIndex = 0;
  let match;

  NESTED_SECTION_RE.lastIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((match = NESTED_SECTION_RE.exec(text)) !== null) {
    const [fullMatch, rawSectionId] = match;
    const sectionId = normalizeNestedSectionId(rawSectionId);
    const sectionData = sectionMap.get(sectionId);

    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    if (sectionData) {
      appendNestedSectionContent(fragment, sectionData);
      usedSectionIds.add(sectionId);
      changed = true;
    } else {
      fragment.appendChild(document.createTextNode(fullMatch));
    }

    lastIndex = match.index + fullMatch.length;
  }

  if (!changed) return;

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  textNode.replaceWith(fragment);
}

/**
 * Decorates nested sections by replacing [#section-id] placeholders
 * with the content of sections that have matching IDs in their section-metadata.
 * Only sections that are actually used as placeholders are removed from the page.
 * Runs after decorateSections and decorateBlocks so content is already decorated.
 * @param {Element} main The container element
 */
export function decorateNestedSections(main) {
  const nodesToProcess = collectTextNodes(main, '[#');
  if (!nodesToProcess.length) return;

  const sectionIds = collectNestedSectionIds(nodesToProcess);
  if (!sectionIds.size) return;

  const sectionMap = buildNestedSectionMap(main, sectionIds);
  if (!sectionMap.size) return;

  const usedSectionIds = new Set();
  nodesToProcess.forEach((node) => {
    if (node.isConnected) {
      replaceNestedSectionNode(node, sectionMap, usedSectionIds);
    }
  });

  usedSectionIds.forEach((sectionId) => {
    sectionMap.get(sectionId)?.element.remove();
  });
}

/* === END NESTED SECTIONS === */
