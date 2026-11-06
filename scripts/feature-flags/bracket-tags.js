import { collectTextNodes } from '../utils.js';

/* === BRACKET TAGS ===
 * Bracket syntax: [[class1,class2]text] → <span class="class1 class2">text</span>
 * Only alphanumeric, hyphen, and underscore are allowed in class names.
 * Malformed patterns (empty class list, invalid chars) are left unchanged.
 * Alignment classes (center, left, right) are hoisted to the containing element
 * instead of applied to a span. See /docs/span-tags.md and /docs/cell-class.md
 */

function parseClasses(raw, classNamePattern = /^[a-zA-Z0-9_-]+$/) {
  const names = raw.split(',').map((c) => c.trim());
  if (names.some((c) => !c || !classNamePattern.test(c))) return [];
  return names;
}

function parseSplitClasses(raw) {
  return parseClasses(raw, /^[a-z0-9-]+$/);
}

const SPLIT_INLINE_TAGS = new Set(['STRONG', 'EM', 'A', 'BR']);

const ALIGNMENT_CLASSES = new Set(['center', 'left', 'right']);

const SPAN_TAG_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, li';

const SPLIT_OPEN_RE = /\[\[([a-z0-9,-]+)\]\s*$/;

const SPAN_TAG_RE = /\[\[(?=([^\]]+))\1\](?=([^\]]*))\2\]/g;

const TOOLTIP_OPEN_RE = /\[\[tooltip\]\s*$/;

function splitAlignmentClasses(classes) {
  return classes.reduce((groups, c) => {
    if (ALIGNMENT_CLASSES.has(c)) groups.alignClasses.push(c);
    else groups.regularClasses.push(c);
    return groups;
  }, { alignClasses: [], regularClasses: [] });
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function applySplitBoundaryPass(el) {
  const children = [...el.childNodes];

  for (let i = 0; i < children.length - 2; i += 1) {
    const prev = children.at(i);
    const mid = children.at(i + 1);
    const next = children.at(i + 2);

    const isPrevText = prev.nodeType === Node.TEXT_NODE;
    const isMidInline = mid.nodeType === Node.ELEMENT_NODE && SPLIT_INLINE_TAGS.has(mid.nodeName);
    const isNextText = next.nodeType === Node.TEXT_NODE;

    if (isPrevText && isMidInline && isNextText) {
      // tooltip branch: [[tooltip]<a href="#" title="...">text</a>]
      // The <a> is replaced entirely — not wrapped — with a <span data-tooltip="...">.
      const isTooltipAnchor = mid.nodeName === 'A'
        && mid.getAttribute('href') === '#'
        && mid.getAttribute('title');
      const tooltipCloseMatch = isTooltipAnchor && TOOLTIP_OPEN_RE.test(prev.nodeValue)
        ? next.nodeValue.match(/^\s*\]/) : null;
      if (tooltipCloseMatch) {
        const span = document.createElement('span');
        span.className = 'tooltip';
        span.dataset.tooltip = mid.getAttribute('title');
        span.textContent = mid.textContent;
        el.insertBefore(span, mid);
        el.removeChild(mid);
        prev.nodeValue = prev.nodeValue.replace(TOOLTIP_OPEN_RE, '');
        next.nodeValue = next.nodeValue.slice(tooltipCloseMatch[0].length);
      } else {
        // Pattern A: "prefix[[classes]" <inline>content</inline> "]suffix"
        const openMatch = prev.nodeValue.match(SPLIT_OPEN_RE);
        const classes = openMatch ? parseSplitClasses(openMatch[1]) : [];
        const closeMatch = openMatch && classes.length ? next.nodeValue.match(/^\s*\]/) : null;
        if (closeMatch) {
          const { alignClasses, regularClasses } = splitAlignmentClasses(classes);
          if (alignClasses.length) el.classList.add(...alignClasses);
          prev.nodeValue = prev.nodeValue.slice(0, -openMatch[0].length);
          next.nodeValue = next.nodeValue.slice(closeMatch[0].length);
          if (regularClasses.length) {
            const span = document.createElement('span');
            span.className = regularClasses.join(' ');
            span.appendChild(mid);
            el.insertBefore(span, next);
          }
        }
      }
    } else if (!isPrevText && mid.nodeType === Node.TEXT_NODE && !isNextText && next.children.length === 0) {
      // Pattern B: <inline>prefix[[</inline> "classes" <inline>]content]</inline>
      const isPrevInline = prev.nodeType === Node.ELEMENT_NODE && SPLIT_INLINE_TAGS.has(prev.nodeName);
      const isNextInline = next.nodeType === Node.ELEMENT_NODE && SPLIT_INLINE_TAGS.has(next.nodeName);
      const openerText = prev.textContent;
      const closerText = next.textContent;
      const classes = parseSplitClasses(mid.nodeValue);
      if (isPrevInline && isNextInline && openerText.endsWith('[[') && classes.length
        && closerText.startsWith(']') && closerText.endsWith(']')) {
        const { alignClasses, regularClasses } = splitAlignmentClasses(classes);
        if (alignClasses.length) el.classList.add(...alignClasses);
        next.textContent = closerText.slice(1, -1);
        if (regularClasses.length) {
          const insertRef = next.nextSibling;
          const span = document.createElement('span');
          span.className = regularClasses.join(' ');
          span.appendChild(next);
          el.insertBefore(span, insertRef);
        }
        if (openerText === '[[') el.removeChild(prev);
        else prev.textContent = openerText.slice(0, -2);
        el.removeChild(mid);
      }
    }
  }
}

export function applySpanTags(text) {
  SPAN_TAG_RE.lastIndex = 0;
  return text.replace(SPAN_TAG_RE, (match, raw, content) => {
    const classes = parseClasses(raw);
    if (!classes.length) return match;
    const safe = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    return `<span class="${classes.join(' ')}">${safe}</span>`;
  });
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function replaceTextNode(textNode, containingEl) {
  const text = textNode.nodeValue;
  const frag = document.createDocumentFragment();
  let lastIndex = 0;
  let match;

  SPAN_TAG_RE.lastIndex = 0;

  // eslint-disable-next-line no-cond-assign
  while ((match = SPAN_TAG_RE.exec(text)) !== null) {
    const [full, raw, content] = match;
    const classes = parseClasses(raw);

    if (match.index > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    if (!classes.length) {
      frag.appendChild(document.createTextNode(full));
    } else {
      const { alignClasses, regularClasses } = splitAlignmentClasses(classes);
      if (alignClasses.length && containingEl) containingEl.classList.add(...alignClasses);
      if (regularClasses.length) {
        const span = document.createElement('span');
        span.className = regularClasses.join(' ');
        span.textContent = content;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(content));
      }
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex === 0) return;

  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  textNode.parentNode.replaceChild(frag, textNode);
}

function cleanAttributes(element) {
  element.querySelectorAll('a').forEach((a) => {
    if (a.hasAttribute('title')) {
      const cleaned = a.getAttribute('title').replace(SPAN_TAG_RE, '$2');
      if (cleaned !== a.getAttribute('title')) a.setAttribute('title', cleaned);
    }
    if (a.hasAttribute('aria-label')) {
      const cleaned = a.getAttribute('aria-label')
        .replace(SPAN_TAG_RE, (_, raw, content) => content)
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned !== a.getAttribute('aria-label')) a.setAttribute('aria-label', cleaned);
    }
  });

  element.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((heading) => {
    if (!heading.id) return;
    const slug = heading.textContent
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    if (slug !== heading.id) heading.id = slug;
  });
}

function hoistAlignmentAcrossInlines(el) {
  // Handles [[alignment-class]content] where content spans inline elements,
  // causing the opening [[class] and closing ] to land in different text nodes.
  const textNodes = collectTextNodes(el);

  for (let i = 0; i < textNodes.length - 1; i += 1) {
    const node = textNodes[i];
    const text = node.nodeValue;
    const openIdx = text.lastIndexOf('[[');
    if (openIdx === -1) continue; // eslint-disable-line no-continue

    const tail = text.slice(openIdx);
    // If the bracket expression is fully contained in this node, replaceTextNode handles it
    if (/^\[\[[^\]]+\][^\]]*\]/.test(tail)) continue; // eslint-disable-line no-continue

    const classMatch = tail.match(/^\[\[([a-zA-Z0-9_,-]+)\]/);
    if (!classMatch) continue; // eslint-disable-line no-continue

    const classes = parseClasses(classMatch[1]);
    const { alignClasses } = splitAlignmentClasses(classes);
    // Only handle pure-alignment spanning patterns; mixed (alignment + span classes) needs Range API
    if (!alignClasses.length || classes.length !== alignClasses.length) continue; // eslint-disable-line no-continue

    for (let j = i + 1; j < textNodes.length; j += 1) {
      const closeNode = textNodes[j];
      const closeText = closeNode.nodeValue;
      const closeIdx = closeText.indexOf(']');
      if (closeIdx === -1) continue; // eslint-disable-line no-continue

      el.classList.add(...alignClasses);
      node.nodeValue = text.slice(0, openIdx) + tail.slice(classMatch[0].length);
      closeNode.nodeValue = closeText.slice(0, closeIdx) + closeText.slice(closeIdx + 1);
      break;
    }
  }
}

/* see /docs/span-tags.md */
export function decorateSpanTags(element) {
  element.querySelectorAll(SPAN_TAG_SELECTOR).forEach((el) => {
    if (el.textContent.includes('[[')) hoistAlignmentAcrossInlines(el);

    const nodes = collectTextNodes(el, '[[');
    nodes.forEach((n) => replaceTextNode(n, el));
    applySplitBoundaryPass(el);
  });

  cleanAttributes(element);
}

/* === END BRACKET TAGS === */
