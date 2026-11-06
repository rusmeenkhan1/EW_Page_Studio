/*
 * Fragment Block
 * Include content on a page as a fragment.
 * https://www.aem.live/developer/block-collection/fragment
 */

// eslint-disable-next-line import/no-cycle
import {
  decorateMain,
  ensureDOMPurify,
  moveInstrumentation,
} from '../../scripts/scripts.js';

import {
  loadSections,
  DOMPURIFY,
  loadBlock,
} from '../../scripts/aem.js';

/**
 * Loads a fragment.
 * @param {string} path The path to the fragment
 * @returns {Promise<HTMLElement>} The root element of the fragment
 */
export async function loadFragment(path) {
  if (path && path.startsWith('/') && !path.startsWith('//')) {
    await ensureDOMPurify();
    const resp = await fetch(`${path}.plain.html`);
    if (resp.ok) {
      const main = document.createElement('main');
      main.innerHTML = window.DOMPurify.sanitize(await resp.text(), DOMPURIFY);

      // reset base path for media to fragment base (whitelist attr to avoid prototype pollution)
      const resetAttributeBase = (tag, attr) => {
        if (attr !== 'src' && attr !== 'srcset') return;
        main.querySelectorAll(`${tag}[${attr}^="./media_"]`).forEach((elem) => {
          const { href } = new URL(elem.getAttribute(attr), new URL(path, window.location));
          if (attr === 'src') elem.src = href;
          else if (attr === 'srcset') elem.srcset = href;
        });
      };
      resetAttributeBase('img', 'src');
      resetAttributeBase('source', 'srcset');

      decorateMain(main);
      await loadSections(main);

      // Load any nested blocks that were inserted by decorateNestedSections
      const nestedBlocks = main.querySelectorAll('.nested-block');
      await Promise.all([...nestedBlocks].map((block) => loadBlock(block)));

      return main;
    }
  }
  return null;
}

/**
 * Replaces a section with a loaded fragment, or flattens the fragment's content into
 * place when the section has other content. Shared by the fragment block and by
 * scripts.js' auto-blocking of bare `/fragments/` links.
 * @param {Element} elementToRemove The element to remove/insert-before when flattening
 * @param {Element} section The (possibly decorated) section containing elementToRemove
 * @param {HTMLElement} fragment The loaded fragment's root element
 */
export function replaceWithFragment(elementToRemove, section, fragment) {
  if (section && section.children.length === 1) {
    // fragment is the ONLY child of its section; replace the whole section
    section.replaceWith(...fragment.childNodes);
  } else {
    // fragment shares its section with other content; flatten children into it
    fragment.querySelectorAll(':scope > .section').forEach((fragSection) => {
      [...fragSection.childNodes].forEach((child) => elementToRemove.before(child));
    });
    elementToRemove.remove();
  }
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const link = block.querySelector('a');
  const path = link ? link.getAttribute('href') : block.textContent.trim();
  const fragment = await loadFragment(path);
  moveInstrumentation(block, block.parentElement);
  if (!fragment) return;

  const wrapper = block.closest('.fragment-wrapper');
  replaceWithFragment(wrapper, wrapper.closest('.section'), fragment);
}
