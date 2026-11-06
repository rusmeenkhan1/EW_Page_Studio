import { moveInstrumentation, getBlockId } from '../../scripts/scripts.js';

export default function decorate(block) {
  // Unique id per block instance (e.g. accordion_0, accordion_1, ...) so multiple
  // accordions on the same page, and their items, can be targeted individually by
  // analytics/Target requests.
  const blockId = getBlockId('accordion');
  block.setAttribute('id', blockId);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-label', `Accordion ${blockId}`);

  const ul = document.createElement('ul');
  [...block.children].forEach((row, i) => {
    const li = document.createElement('li');
    li.className = 'accordion-item';
    moveInstrumentation(row, li);
    while (row.firstElementChild) li.append(row.firstElementChild);

    const [label, body] = [...li.children];
    const labelId = `${blockId}-label-${i}`;
    const bodyId = `${blockId}-body-${i}`;
    if (label !== null && label !== undefined) {
      label.className = 'accordion-item-label';
      label.id = labelId;
      // aria-controls/aria-labelledby link label <-> body for screen readers,
      // since toggling only relies on a CSS class today.
      label.setAttribute('aria-controls', bodyId);
      label.addEventListener('click', () => li.classList.toggle('active'));
    }
    if (body !== null && body !== undefined) {
      body.className = 'accordion-item-body';
      body.id = bodyId;
      body.setAttribute('aria-labelledby', labelId);
    }

    ul.append(li);
  });

  block.textContent = '';
  block.append(ul);
}
