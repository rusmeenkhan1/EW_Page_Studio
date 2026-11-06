import { getBlockId, ensureDOMPurify } from '../../scripts/scripts.js';
import { DOMPURIFY } from '../../scripts/aem.js';

export default async function decorate(block) {
  const blockId = getBlockId('quote');
  block.setAttribute('id', blockId);
  block.setAttribute('aria-label', `quote-${blockId}`);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'Quote');

  const [quotation, attribution] = [...block.children].map((c) => c.firstElementChild);
  const blockquote = document.createElement('blockquote');
  // decorate quotation
  quotation.className = 'quote-quotation';
  blockquote.append(quotation);
  // decoration attribution
  if (attribution) {
    attribution.className = 'quote-attribution';
    blockquote.append(attribution);
    await ensureDOMPurify();
    const ems = attribution.querySelectorAll('em');
    ems.forEach((em) => {
      const cite = document.createElement('cite');
      cite.innerHTML = window.DOMPurify.sanitize(em.innerHTML, DOMPURIFY);
      em.replaceWith(cite);
    });
  }
  block.innerHTML = '';
  block.append(blockquote);
}
