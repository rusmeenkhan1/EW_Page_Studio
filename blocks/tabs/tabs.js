import { moveInstrumentation, getBlockId } from '../../scripts/scripts.js';

/**
 * @param {Element} block
 * @param {Element} tablist
 */
function ensureTablistClickDelegation(block, tablist) {
  if (tablist.dataset.tabsClickDelegated === 'true') {
    return;
  }
  tablist.dataset.tabsClickDelegated = 'true';
  tablist.addEventListener('click', (e) => {
    const button = e.target.closest('button.tabs-tab');
    if (!button || !tablist.contains(button)) {
      return;
    }
    const panelId = button.getAttribute('aria-controls');
    if (!panelId) {
      return;
    }
    const tabpanel = document.getElementById(panelId);
    if (!tabpanel || !block.contains(tabpanel)) {
      return;
    }
    block.querySelectorAll('[role=tabpanel]').forEach((panel) => {
      panel.setAttribute('aria-hidden', true);
    });
    tablist.querySelectorAll('button.tabs-tab').forEach((btn) => {
      btn.setAttribute('aria-selected', false);
    });
    tabpanel.setAttribute('aria-hidden', false);
    button.setAttribute('aria-selected', true);
  });
}

/**
 * @param {Element} row
 * @param {Element | null} tablist
 */
function isTabRowCandidate(row, tablist) {
  if (row === tablist || row.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  if (row.matches('.tabs-panel[role="tabpanel"]')) {
    return true;
  }
  return !!(row.firstElementChild && row.firstElementChild.children.length > 0);
}

/**
 * Rebuilds tab buttons and panel ids/indexes when tab items are added or removed (e.g. in Universal Editor).
 * @param {Element} block
 */
export function resyncTabsBlock(block) {
  const tablist = block.querySelector(':scope > .tabs-list');
  if (!tablist) {
    return;
  }

  if (block.firstElementChild !== tablist) {
    block.insertBefore(tablist, block.firstElementChild);
  }

  const blockId = block.getAttribute('id');
  if (!blockId) {
    return;
  }

  const openResource = block.querySelector('.tabs-panel[aria-hidden="false"]')?.getAttribute('data-aue-resource');

  const rows = [...block.children].filter((c) => isTabRowCandidate(c, tablist));
  const MAX_TAB_ITEMS = 200;
  if (rows.length > MAX_TAB_ITEMS) {
    return;
  }

  const existingButtons = [...tablist.children];
  if (existingButtons.length > rows.length) {
    tablist.replaceChildren(...existingButtons.slice(0, rows.length));
  } else if (existingButtons.length < rows.length) {
    const fragment = document.createDocumentFragment();
    const toAdd = rows.length - existingButtons.length;
    for (let b = 0; b < toAdd; b += 1) {
      const btn = document.createElement('button');
      btn.className = 'tabs-tab';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('type', 'button');
      fragment.append(btn);
    }
    tablist.append(fragment);
  }

  rows.forEach((row, i) => {
    const id = `tabpanel-${blockId}-tab-${i + 1}`;
    const buttonId = `tab-${id}`;

    const button = tablist.children[i];

    if (!row.matches('.tabs-panel[role="tabpanel"]')) {
      const tabCell = row.firstElementChild;
      if (!tabCell || !tabCell.children.length) {
        return;
      }
      const labelText = tabCell.textContent;
      tabCell.remove();

      row.className = 'tabs-panel';
      row.id = id;
      row.setAttribute('data-tab-index', String(i));
      row.setAttribute('aria-labelledby', buttonId);
      row.setAttribute('role', 'tabpanel');

      button.id = buttonId;
      button.textContent = labelText;
      button.setAttribute('aria-controls', id);
      button.setAttribute('aria-selected', 'false');

      if (button.firstElementChild) {
        moveInstrumentation(button.firstElementChild, null);
      }
    } else {
      row.className = 'tabs-panel';
      row.id = id;
      row.setAttribute('data-tab-index', String(i));
      row.setAttribute('aria-labelledby', buttonId);
      row.setAttribute('role', 'tabpanel');

      button.id = buttonId;
      button.setAttribute('aria-controls', id);
      button.setAttribute('aria-selected', 'false');
    }
  });

  let activeIdx = 0;
  if (openResource) {
    const idx = rows.findIndex((r) => r.getAttribute('data-aue-resource') === openResource);
    if (idx !== -1) {
      activeIdx = idx;
    }
  }

  rows.forEach((row, i) => {
    row.setAttribute('aria-hidden', String(i !== activeIdx));
  });
  tablist.querySelectorAll(':scope > button.tabs-tab').forEach((btn, i) => {
    btn.setAttribute('aria-selected', String(i === activeIdx));
  });

  ensureTablistClickDelegation(block, tablist);
}

export default async function decorate(block) {
  const blockId = getBlockId('tabs');
  block.setAttribute('id', blockId);
  block.setAttribute('aria-label', `tabs-${blockId}`);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'Tabs');

  let tablist = block.querySelector(':scope > .tabs-list');
  if (!tablist) {
    tablist = document.createElement('div');
    tablist.className = 'tabs-list';
    tablist.setAttribute('role', 'tablist');
    tablist.id = `tablist-${blockId}`;
    block.prepend(tablist);
  }

  ensureTablistClickDelegation(block, tablist);
  resyncTabsBlock(block);
}
