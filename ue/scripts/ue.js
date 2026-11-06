/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-disable sonarjs/cognitive-complexity */
import { showSlide } from '../../scripts/slider.js';
import { activateTabPanel, moveInstrumentation } from './ue-utils.js';

/**
 * Load tabs resync only when needed. A static import of blocks/tabs/tabs.js would pull in scripts.js
 * while scripts.js is still awaiting this module on ue.da.live (circular dependency → broken UE page).
 * @returns {Promise<{ resyncTabsBlock: (el: Element) => void }>}
 */
function loadTabsModule() {
  const base = window.hlx?.codeBasePath ?? '';
  return import(`${base}/blocks/tabs/tabs.js`);
}

/**
 * Move UE instrumentation for tabs-item / panel swaps (after optional resync).
 * @param {MutationRecord} mutation
 */
function handleTabsInstrumentation(mutation) {
  const { addedNodes: addedElements, removedNodes: removedElements, target } = mutation;
  if (removedElements.length === 1 && removedElements[0].attributes['data-aue-model']?.value === 'tabs-item') {
    const resourceAttr = removedElements[0].getAttribute('data-aue-resource');
    if (resourceAttr) {
      const itemMatch = resourceAttr.match(/item-(\d+)/);
      if (itemMatch && itemMatch[1]) {
        const tabIndex = parseInt(itemMatch[1], 10);
        const panels = target.querySelectorAll(':scope > .tabs-panel[role="tabpanel"]');
        const targetPanel = Array.from(panels).find((panel) => parseInt(panel.getAttribute('data-tab-index'), 10) === tabIndex);
        if (targetPanel) {
          moveInstrumentation(removedElements[0], targetPanel);
          const removed = removedElements[0];
          const addedName = targetPanel.querySelector(':scope > div:nth-child(1)');
          const addedContent = targetPanel.querySelector(':scope > div:nth-child(2)');
          const removedName = removed.querySelector(':scope > div:nth-child(1)');
          const removedContent = removed.querySelector(':scope > div:nth-child(2)');
          if (removedName && addedName) moveInstrumentation(removedName, addedName);
          if (removedContent && addedContent) moveInstrumentation(removedContent, addedContent);
        }
      }
    }
  } else if (addedElements.length === 1 && addedElements[0].matches('div.tabs-panel[role="tabpanel"]')) {
    const removed = removedElements[0];
    const added = addedElements[0];
    if (removed && removed.nodeType === 1) {
      moveInstrumentation(removed, added);
      const addedName = added.querySelector(':scope > div:nth-child(1)');
      const addedContent = added.querySelector(':scope > div:nth-child(2)');
      const removedName = removed.querySelector(':scope > div:nth-child(1)');
      const removedContent = removed.querySelector(':scope > div:nth-child(2)');
      if (removedName && addedName) moveInstrumentation(removedName, addedName);
      if (removedContent && addedContent) moveInstrumentation(removedContent, addedContent);
    }
  }
}

/**
 * When tab rows are added or removed under div.tabs, rebuild the tablist (handles deletes from UE
 * even when data-aue-model on mutation.target is not "tabs").
 * @param {MutationRecord} mutation
 * @returns {boolean} true if resync + instrumentation were scheduled asynchronously
 */
function scheduleTabsRowResyncIfNeeded(mutation) {
  const tabsBlock = mutation.target.closest('div.tabs');
  if (!tabsBlock) {
    return false;
  }

  const tablistEl = tabsBlock.querySelector(':scope > .tabs-list');
  const { addedNodes, removedNodes } = mutation;

  const addedRow = [...addedNodes].some(
    (n) => n.nodeType === Node.ELEMENT_NODE && n.parentElement === tabsBlock && n !== tablistEl,
  );

  const removedTabRow = [...removedNodes].some(
    (n) => n.nodeType === Node.ELEMENT_NODE
      && !(tablistEl?.contains(n))
      && (
        n.matches?.('.tabs-panel[role="tabpanel"]')
        || n.getAttribute?.('role') === 'tabpanel'
        || n.attributes?.['data-aue-model']?.value === 'tabs-item'
      ),
  );

  if (!addedRow && !removedTabRow) {
    return false;
  }

  loadTabsModule()
    .then(({ resyncTabsBlock }) => {
      resyncTabsBlock(tabsBlock);
      handleTabsInstrumentation(mutation);
    })
    .catch(() => {
      handleTabsInstrumentation(mutation);
    });
  return true;
}

const setupObservers = () => {
  const mutatingBlocks = document.querySelectorAll('div.cards, div.carousel, div.accordion, div.tabs');
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.target.tagName === 'DIV') {
        const addedElements = mutation.addedNodes;
        const removedElements = mutation.removedNodes;

        const tabsRowResyncScheduled = scheduleTabsRowResyncIfNeeded(mutation);

        // detect the mutation type of the block or picture (for cards)
        const type = mutation.target.classList.contains('cards-card-image') ? 'cards-image' : mutation.target.attributes['data-aue-model']?.value;

        switch (type) {
          case 'cards':
            // handle card div > li replacements
            if (addedElements.length === 1 && addedElements[0].tagName === 'UL') {
              const ulEl = addedElements[0];
              const removedDivEl = [...mutation.removedNodes].filter((node) => node.tagName === 'DIV');
              removedDivEl.forEach((div, index) => {
                if (index < ulEl.children.length) {
                  moveInstrumentation(div, ulEl.children[index]);
                }
              });
            }
            break;
          case 'cards-image':
            // handle card-image picture replacements
            if (mutation.target.classList.contains('cards-card-image')) {
              const addedPictureEl = [...mutation.addedNodes].filter((node) => node.tagName === 'PICTURE');
              const removedPictureEl = [...mutation.removedNodes].filter((node) => node.tagName === 'PICTURE');
              if (addedPictureEl.length === 1 && removedPictureEl.length === 1) {
                const oldImgEL = removedPictureEl[0].querySelector('img');
                const newImgEl = addedPictureEl[0].querySelector('img');
                if (oldImgEL && newImgEl) {
                  moveInstrumentation(oldImgEL, newImgEl);
                }
              }
            }
            break;
          case 'accordion':
            if (addedElements.length === 1 && addedElements[0].matches('li.accordion-item')) {
              const removed = removedElements[0];
              const added = addedElements[0];
              moveInstrumentation(removed, added);
              const addedLabel = added.querySelector('.accordion-item-label');
              const addedBody = added.querySelector('.accordion-item-body');
              if (removed.children[0] && addedLabel) moveInstrumentation(removed.children[0], addedLabel);
              if (removed.children[1] && addedBody) moveInstrumentation(removed.children[1], addedBody);
            }
            break;
          case 'carousel':
            if (removedElements.length === 1 && removedElements[0].attributes['data-aue-model']?.value === 'carousel-item') {
              const resourceAttr = removedElements[0].getAttribute('data-aue-resource');
              if (resourceAttr) {
                const itemMatch = resourceAttr.match(/item-(\d+)/);
                if (itemMatch && itemMatch[1]) {
                  const slideIndex = parseInt(itemMatch[1], 10);
                  const slides = mutation.target.querySelectorAll('li.carousel-slide');
                  const targetSlide = Array.from(slides).find((slide) => parseInt(slide.getAttribute('data-slide-index'), 10) === slideIndex);
                  if (targetSlide) {
                    moveInstrumentation(removedElements[0], targetSlide);
                  }
                }
              }
            }
            break;
          case 'tabs':
            if (!tabsRowResyncScheduled) {
              handleTabsInstrumentation(mutation);
            }
            break;
          default:
            break;
        }
      }
    });
  });

  mutatingBlocks.forEach((cardsBlock) => {
    observer.observe(cardsBlock, { childList: true, subtree: true });
  });
};

/** hardening for the attribute selector, to prevent XSS attacks.
 * Escape " and \\ for use inside a double-quoted attribute selector value. */
function escapeDataAueResourceForSelector(resource) {
  return String(resource).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const setupUEEventHandlers = () => {
  /**
   * Capture phase: inactive tab panels use display:none (tabs.css). UE/host scroll-into-view for the
   * selected resource runs after target phase; if we only switched tabs in bubble, the node stayed
   * hidden and the preview jumped (often to top). Activate the matching tab first.
   */
  document.addEventListener(
    'aue:ui-select',
    (event) => {
      const { detail } = event;
      const resource = detail?.resource;

      if (!resource) {
        return;
      }

      const safe = escapeDataAueResourceForSelector(resource);
      const element = document.querySelector(`[data-aue-resource="${safe}"]`);
      if (!element) {
        return;
      }

      const blockEl = element.parentElement?.closest('.block[data-aue-resource]')
        || element?.closest('.block[data-aue-resource]');
      if (!blockEl) {
        return;
      }

      const blockModel = blockEl.getAttribute('data-aue-model');
      const isTabsBlock = blockEl.matches('.tabs') || blockModel === 'tabs';

      if (isTabsBlock) {
        if (element !== blockEl) {
          let panel = element.closest('.tabs-panel');
          if ((!panel || !blockEl.contains(panel)) && blockEl.contains(element)) {
            const inner = blockEl.querySelector(
              `:scope > .tabs-panel [data-aue-resource="${safe}"]`,
            );
            panel = inner?.closest('.tabs-panel');
          }
          if (panel && blockEl.contains(panel)) {
            activateTabPanel(blockEl, panel);
          }
        }
        return;
      }

      const index = element.getAttribute('data-slide-index');

      switch (blockModel) {
        case 'accordion':
          blockEl.querySelectorAll('details').forEach((details) => {
            details.open = false;
          });
          element.open = true;
          break;
        case 'carousel':
          if (index) {
            showSlide(blockEl, index);
          }
          break;
        default:
          break;
      }
    },
    true,
  );
};

export default () => {
  setupObservers();
  setupUEEventHandlers();
};
