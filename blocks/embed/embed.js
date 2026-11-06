/*
 * Embed Block
 * Show videos and social posts directly on your page
 * https://www.hlx.live/developer/block-collection/embed
 */
import { DOMPURIFY } from '../../scripts/aem.js';
import { ensureDOMPurify } from '../../scripts/scripts.js';
import { getYoutubeEmbedHtml, getVimeoEmbedHtml, EMBED_DOMPURIFY } from '../../scripts/utils.js';

const loadScript = (url, callback, type) => {
  const head = document.querySelector('head');
  const script = document.createElement('script');
  script.src = url;
  if (type) {
    script.setAttribute('type', type);
  }
  script.onload = callback;
  head.append(script);
  return script;
};

/* Add iframe wrapper to the embed */
const getDefaultEmbed = (url) => `<div class="iframe-wrapper">
    <iframe src="${url.href}" allowfullscreen=""
      scrolling="no" allow="encrypted-media" title="Content from ${url.hostname}" loading="lazy">
    </iframe>
  </div>`;

const embedTwitter = (url) => {
  if (!url.href.startsWith('https://twitter.com')) {
    url.href = url.href.replace('https://x.com', 'https://twitter.com');
  }
  const embedHTML = `<blockquote class="twitter-tweet"><a href="${url.href}"></a></blockquote>`;
  loadScript('https://platform.twitter.com/widgets.js');
  return embedHTML;
};

const loadEmbed = async (block, link, autoplay) => {
  if (block.classList.contains('embed-is-loaded')) {
    return;
  }

  const EMBEDS_CONFIG = [
    {
      match: ['youtube', 'youtu.be'],
      embed: (url, play) => getYoutubeEmbedHtml(url, play),
    },
    {
      match: ['vimeo'],
      embed: (url, play) => getVimeoEmbedHtml(url, play),
    },
    {
      match: ['twitter', 'x.com'],
      embed: embedTwitter,
    },
  ];
  const config = EMBEDS_CONFIG.find((e) => e.match.some((match) => link.includes(match)));
  const url = new URL(link);
  await ensureDOMPurify();
  if (config) {
    const embedHtml = config.embed(url, autoplay);
    block.innerHTML = window.DOMPurify.sanitize(embedHtml, EMBED_DOMPURIFY);
    block.classList = `block embed embed-${config.match[0]}`;
  } else {
    const defaultHtml = getDefaultEmbed(url);
    block.innerHTML = window.DOMPurify.sanitize(defaultHtml, EMBED_DOMPURIFY);
    block.classList = 'block embed';
  }
  block.classList.add('embed-is-loaded');
};

export default async function decorate(block) {
  const placeholder = block.querySelector('picture');
  const link = block.querySelector('a').href;
  block.textContent = '';

  if (placeholder) {
    const wrapper = document.createElement('div');
    wrapper.className = 'embed-placeholder';
    const placeholderHtml = '<div class="embed-placeholder-play"><button type="button" title="Play"></button></div>';
    await ensureDOMPurify();
    wrapper.innerHTML = window.DOMPurify.sanitize(placeholderHtml, DOMPURIFY);
    wrapper.prepend(placeholder);
    wrapper.addEventListener('click', () => {
      loadEmbed(block, link, true);
    });
    block.append(wrapper);
  } else {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        loadEmbed(block, link);
      }
    });
    observer.observe(block);
  }
}
