/**
 * Collects text nodes under an element, optionally filtered to those containing a marker string.
 * @param {Element} element
 * @param {string} [marker]
 * @returns {Text[]}
 */
export function collectTextNodes(element, marker) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    if (!marker || node.nodeValue.includes(marker)) nodes.push(node);
    node = walker.nextNode();
  }
  return nodes;
}

/**
 * See /docs/cell-class.md
 * Reads single-bracket syntax from the first child of each block cell div.
 * If a cell's first child is <p><code>[classname]</code></p>, the class name
 * is added to the cell div and the <p> is removed.
 * @param {Element} block
 */
export function decorateCellClass(block) {
  [...block.children].forEach((row) => {
    [...row.children].forEach((div) => {
      const first = div.firstElementChild;
      if (!first || first.tagName !== 'P' || first.children.length !== 1) return;
      const code = first.firstElementChild;
      if (code.tagName !== 'CODE') return;
      const match = code.textContent.match(/^\[([a-zA-Z0-9_-]+)\]$/);
      if (!match) return;
      div.classList.add(match[1]);
      first.remove();
    });
  });
}

/**
 * DOMPurify options for our own internally-built video/social embed markup (embed and video
 * blocks): same as the shared DOMPURIFY (scripts/aem.js), but additionally allows <iframe> and
 * the attributes it needs. Only use this for HTML we constructed ourselves from a parsed,
 * validated URL — never for arbitrary author-authored rich text (e.g. table/quote content),
 * which must stay on the stricter shared DOMPURIFY.
 */
export const EMBED_DOMPURIFY = {
  USE_PROFILES: { html: true },
  ADD_TAGS: ['iframe'],
  ADD_ATTR: ['allow', 'allowfullscreen', 'scrolling', 'loading', 'frameborder'],
};

/* === START video autoblock from link === */

const VIDEO_LINK_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'vimeo.com', 'www.vimeo.com']);

/**
 * True if href resolves to a known video host (YouTube, Vimeo).
 * @param {string} href
 * @returns {boolean}
 */
export function isVideoLink(href) {
  try {
    return VIDEO_LINK_HOSTS.has(new URL(href, window.location.href).hostname);
  } catch {
    return false;
  }
}

/**
 * Shared YouTube and Vimeo embed HTML builders.
 * Used by video and embed blocks. Returns HTML strings for DOMPurify or DOM creation.
 *
 * @param {URL} url - Embed URL
 * @param {boolean} [autoplay=false] - Autoplay when visible
 * @param {boolean} [background=false] - Background/ambient mode (muted, loop, no controls)
 * @returns {string} HTML string for the embed wrapper
 */

const IFRAME_WRAPPER_STYLE = 'left: 0; width: 100%; height: 0; position: relative; padding-bottom: 56.25%;';
const IFRAME_STYLE = 'border: 0; top: 0; left: 0; width: 100%; height: 100%; position: absolute;';
const YOUTUBE_ALLOW = 'autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope';

function toPair(k, v) {
  return `${k}=${encodeURIComponent(v)}`;
}

function buildQueryString(params, prefix) {
  const pairs = Object.entries(params).map(([k, v]) => toPair(k, v)).join('&');
  return `${prefix}${pairs}`;
}

function getYoutubeSuffix(autoplay, background) {
  const params = {
    autoplay: autoplay ? '1' : '0',
    mute: background ? '1' : '0',
    controls: background ? '0' : '1',
    disablekb: background ? '1' : '0',
    loop: background ? '1' : '0',
    playsinline: background ? '1' : '0',
  };
  return buildQueryString(params, '&');
}

function getYoutubeVideoId(url) {
  if (url.origin.includes('youtu.be')) {
    const [, vid] = url.pathname.split('/');
    return vid ? encodeURIComponent(vid) : '';
  }
  const v = new URLSearchParams(url.search).get('v');
  return v ? encodeURIComponent(v) : '';
}

function getYoutubeSrc(url, autoplay, background) {
  const vid = getYoutubeVideoId(url);
  const suffix = (background || autoplay) ? getYoutubeSuffix(autoplay, background) : '';
  if (vid) {
    return `https://www.youtube.com/embed/${vid}?rel=0&v=${vid}${suffix}`;
  }
  return `https://www.youtube.com${url.pathname}`;
}

function wrapIframe(src, allow, title) {
  return `<div class="iframe-wrapper" style="${IFRAME_WRAPPER_STYLE}">
<iframe src="${src}" style="${IFRAME_STYLE}" allow="${allow}" allowfullscreen="" scrolling="no" title="${title}" loading="lazy"></iframe>
</div>`;
}

export function getYoutubeEmbedHtml(url, autoplay = false, background = false) {
  const src = getYoutubeSrc(url, autoplay, background);
  return wrapIframe(src, YOUTUBE_ALLOW, 'Content from Youtube');
}

function getVimeoSrc(url, autoplay, background) {
  const [, video] = url.pathname.split('/');
  const params = (background || autoplay)
    ? { autoplay: autoplay ? '1' : '0', background: background ? '1' : '0' }
    : {};
  const suffix = Object.keys(params).length ? buildQueryString(params, '?') : '';
  return `https://player.vimeo.com/video/${video}${suffix}`;
}

export function getVimeoEmbedHtml(url, autoplay = false, background = false) {
  const src = getVimeoSrc(url, autoplay, background);
  const allow = 'autoplay; fullscreen; picture-in-picture';
  return `<div class="iframe-wrapper" style="${IFRAME_WRAPPER_STYLE}">
<iframe src="${src}" style="${IFRAME_STYLE}" frameborder="0" allow="${allow}" allowfullscreen title="Content from Vimeo" loading="lazy"></iframe>
</div>`;
}
/* === END video autoblock from link === */
