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

/**
 * Moves all the attributes from a given elmenet to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveAttributes(from, to, attributes) {
  if (!attributes) {
    // eslint-disable-next-line no-param-reassign
    attributes = [...from.attributes].map(({ nodeName }) => nodeName);
  }
  attributes.forEach((attr) => {
    const value = from.getAttribute(attr);
    if (value) {
      to.setAttribute(attr, value);
      from.removeAttribute(attr);
    }
  });
}

/**
 * Move instrumentation attributes from a given element to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveInstrumentation(from, to) {
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-') || attr.startsWith('data-richtext-')),
  );
}

/**
 * Shows one tab panel and syncs tab buttons without calling click() (avoids focus-driven scroll-to-top in UE preview).
 * Keeps the tabs block in view similarly to carousel slide activation.
 * @param {Element} blockEl - Root .tabs block
 * @param {Element} panelEl - .tabs-panel[role="tabpanel"] owned by blockEl
 */
export function activateTabPanel(blockEl, panelEl) {
  if (
    !blockEl?.matches?.('.tabs')
    || !panelEl?.matches?.('.tabs-panel')
    || !blockEl.contains(panelEl)
  ) {
    return;
  }
  blockEl.querySelectorAll('[role=tabpanel]').forEach((p) => {
    p.setAttribute('aria-hidden', 'true');
  });
  panelEl.setAttribute('aria-hidden', 'false');
  const tablist = blockEl.querySelector('.tabs-list');
  if (tablist) {
    tablist.querySelectorAll('button').forEach((btn) => {
      btn.setAttribute('aria-selected', 'false');
    });
  }
  const tabBtn = blockEl.querySelector(`[aria-controls="${panelEl.id}"]`);
  if (tabBtn) {
    tabBtn.setAttribute('aria-selected', 'true');
  }
  requestAnimationFrame(() => {
    blockEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  });
}
