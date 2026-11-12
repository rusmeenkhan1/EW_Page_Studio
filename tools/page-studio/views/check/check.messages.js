/*
 * The check view's words: each element (a CSS selector in check.html) and its
 * data-* messages (name without `data-`), set on the page before the view's script runs
 * (shared/messages.js). A site rewords any of them in its configuration's `messages` tab
 * (`view` | `element` | `message` | `text`). Generated once from the HTML; edit here.
 */
export default {
  '.ss-plugin-status': {
    loading: 'Checking…',
    standalone: 'Open this panel from the page editor in DA to check the site\'s setup.'
  },
  '.ck-summary': {
    good: '✓ All good: nothing to fix.',
    found: 'To fix: {errors} · To look at: {warnings} · Notes: {notes}'
  },
  '.ck-results': {
    settings: 'Settings (/.da/library/page-studio)',
    site: 'Site file (in the site\'s code)',
    library: 'Block library',
    css: 'Styles and the site\'s code',
    error: 'To fix',
    warning: 'To look at',
    info: 'Note'
  },
  '.ck-sources': {
    'library-sheet': 'Block library sheet',
    'site-file': 'Site file',
    code: 'Site code',
    'site-ok': 'read',
    'site-missing': 'none',
    'site-unreadable': 'can\'t be read from here',
    'site-invalid': 'not valid',
    'site-off': 'off'
  }
};
