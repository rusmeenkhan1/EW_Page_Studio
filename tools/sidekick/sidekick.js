/**
 * Build the da.live content path (org/site/page) from sidekick state or the current URL.
 * @param {object} [detail] Sidekick custom event detail
 * @returns {string|undefined}
 */
function getDaContentPath(detail = {}) {
  if (detail.status?.path) return detail.status.path;

  const loc = detail.location || window.location;
  let { hostname } = loc;
  if (hostname === 'localhost') {
    const proxy = document.querySelector('meta[property="hlx:proxyUrl"]')?.content;
    if (proxy) hostname = new URL(proxy).hostname;
  }

  const parts = hostname.split('.')[0].split('--');
  const [, repo, owner] = parts;
  if (!repo || !owner) return undefined;

  let pathname = (loc.pathname || window.location.pathname).replace(/^\//, '');
  if (!pathname) pathname = 'index';
  return `${owner}/${repo}/${pathname}`;
}

/**
 * Open the current page in DA Canvas (Universal Editor workspace).
 * @param {CustomEvent} event
 */
function openExperienceWorkspace(event) {
  const path = getDaContentPath(event.detail);
  if (!path) return;
  window.open(`https://da.live/canvas#/${path}`, '_blank', 'noopener,noreferrer');
}

function attachSidekickListeners(sk) {
  sk.addEventListener('custom:experience-workspace', openExperienceWorkspace);
  sk.classList.add('is-ready');
}

const sk = document.querySelector('aem-sidekick');
if (sk) {
  attachSidekickListeners(sk);
} else {
  document.addEventListener('sidekick-ready', () => {
    attachSidekickListeners(document.querySelector('aem-sidekick'));
  }, { once: true });
}
