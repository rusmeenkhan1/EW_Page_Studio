/*
 * Video Block
 * Show a video referenced by a link
 * https://www.hlx.live/developer/block-collection/video
 */

import { ensureDOMPurify } from '../../scripts/scripts.js';
import { getYoutubeEmbedHtml, getVimeoEmbedHtml, EMBED_DOMPURIFY } from '../../scripts/utils.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

async function htmlToElement(html) {
  await ensureDOMPurify();
  const temp = document.createElement('div');
  temp.innerHTML = window.DOMPurify.sanitize(html, EMBED_DOMPURIFY);
  return temp.firstElementChild;
}

function getVideoElement(source, autoplay, background) {
  const video = document.createElement('video');
  video.setAttribute('controls', '');
  if (autoplay) video.setAttribute('autoplay', '');
  if (background) {
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    video.removeAttribute('controls');
    video.addEventListener('canplay', () => {
      video.muted = true;
      if (autoplay) video.play();
    });
  }

  const sourceEl = document.createElement('source');
  sourceEl.setAttribute('src', source);
  sourceEl.setAttribute('type', `video/${source.split('.').pop()}`);
  video.append(sourceEl);

  return video;
}

const loadVideoEmbed = async (block, link, autoplay, background) => {
  if (block.dataset.embedLoaded === 'true') {
    return;
  }
  const url = new URL(link);

  const isYoutube = link.includes('youtube') || link.includes('youtu.be');
  const isVimeo = link.includes('vimeo');

  if (isYoutube) {
    const embedWrapper = await htmlToElement(getYoutubeEmbedHtml(url, autoplay, background));
    block.append(embedWrapper);
    embedWrapper.querySelector('iframe').addEventListener('load', () => {
      block.dataset.embedLoaded = true;
    });
  } else if (isVimeo) {
    const embedWrapper = await htmlToElement(getVimeoEmbedHtml(url, autoplay, background));
    block.append(embedWrapper);
    embedWrapper.querySelector('iframe').addEventListener('load', () => {
      block.dataset.embedLoaded = true;
    });
  } else {
    const videoEl = getVideoElement(link, autoplay, background);
    block.append(videoEl);
    videoEl.addEventListener('canplay', () => {
      block.dataset.embedLoaded = true;
    });
  }
};

export default async function decorate(block) {
  const placeholder = block.querySelector('picture');
  const link = block.querySelector('a').href;
  block.textContent = '';
  block.dataset.embedLoaded = false;

  const autoplay = block.classList.contains('autoplay');
  if (placeholder) {
    block.classList.add('placeholder');
    const wrapper = document.createElement('div');
    wrapper.className = 'video-placeholder';
    wrapper.append(placeholder);

    if (!autoplay) {
      wrapper.insertAdjacentHTML(
        'beforeend',
        '<div class="video-placeholder-play"><button type="button" title="Play"></button></div>',
      );
      wrapper.addEventListener('click', () => {
        wrapper.remove();
        loadVideoEmbed(block, link, true, false);
      });
    }
    block.append(wrapper);
  }

  if (!placeholder || autoplay) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        const playOnLoad = autoplay && !prefersReducedMotion.matches;
        loadVideoEmbed(block, link, playOnLoad, autoplay);
      }
    });
    observer.observe(block);
  }
}
