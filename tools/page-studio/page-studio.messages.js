/*
 * The Page Studio view's words: each element (a CSS selector in page-studio.html) and its
 * data-* messages (name without `data-`), set on the page before the view's script runs
 * (shared/messages.js). A site rewords any of them in its configuration's `messages` tab
 * (`view` | `element` | `message` | `text`). Generated once from the HTML; edit here.
 */
export default {
  '.sb-path': {
    page: 'Page',
    section: 'Section {n}',
    'section-any': 'Section',
    button: 'Button: {label}',
    'button-any': 'Button'
  },
  '.sb-context': {
    has: '{section}: {settings}',
    none: '{section} has no settings.'
  },
  '.ss-plugin-message': {
    'added-block': '✓ Block added. Click an empty line to add something else.',
    'added-button': '✓ Button added. Click an empty line to add something else.',
    'added-section': '✓ Section settings added. Click an empty line to add something else.'
  },
  '.ss-plugin-status': {
    standalone: 'Open Page Studio from the Experience Workspace editor to style the page.'
  }
};
