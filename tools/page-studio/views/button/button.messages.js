/*
 * The button view's words: each element (a CSS selector in button.html) and its
 * data-* messages (name without `data-`), set on the page before the view's script runs
 * (shared/messages.js). A site rewords any of them in its configuration's `messages` tab
 * (`view` | `element` | `message` | `text`). Generated once from the HTML; edit here.
 */
export default {
  'p.ss-plugin-mode.btn-plugin-mode@1': {
    edit: 'Editing a button',
    insert: 'New button'
  },
  '.btn-plugin-status': {
    loading: 'Loading button designs…',
    defaults: 'Showing the built-in designs (no /.da/library/buttons sheet found).',
    standalone: 'Open this panel from the Experience Workspace editor to insert buttons.',
    edit: 'Editing the selected button.',
    'edit-live': 'Editing this button in the page: each change shows there as you make it. Choose Done when you\'re finished.',
    applying: 'Updating the button…',
    applied: '✓ Updated in the page.',
    'done-editing': 'Done. Highlight another button to change it, or pick a design to add a new one.',
    left: 'The cursor moved away from the button, so the panel stopped editing it. Highlight it again to go on.',
    moved: 'The cursor left that block, so nothing was changed. Highlight the button again to go on.',
    restored: 'The cursor wasn\'t on the button, so the line it was on was put back. Highlight the button again to go on.',
    replaced: 'Something other than the button changed. Press Undo (Ctrl+Z or ⌘Z) to put it back.',
    stale: 'The page changed while the button was being updated. Make the change again.',
    'read-only': 'This page is read-only, so the button can\'t be changed.',
    'no-replace': 'This editor can\'t change a button in place. Use Update button instead.',
    'update-failed': 'The button could not be updated. Try again.',
    ambiguous: 'More than one button matches what is highlighted. Highlight more of the button text.',
    done: '✓ Button inserted. Pick a design to add another, or highlight a button in the page to change it.',
    updated: '✓ Button updated. Pick a design to add a new one, or select another button to change it.',
    timeout: 'DA didn\'t answer in time, so the panel stopped waiting. Check the page: if the change shows twice, press Undo (Ctrl+Z or ⌘Z).',
    failed: 'The button could not be inserted. Place the cursor on an empty line and try again.'
  },
  '.btn-plugin-presets': {
    current: 'Current'
  },
  'p.ss-plugin-mode.btn-plugin-mode@2': {
    edit: 'Editing a button',
    insert: 'New button'
  },
  '#btn-plugin-form': {
    'default-colours': 'Design colours',
    'no-icon': 'No icon',
    'new-tab': 'Opens in a new tab',
    'same-tab': 'Opens in the same tab',
    'text-colour': '{colour} text'
  },
  '#btn-plugin-label-error': {
    message: 'Enter the button text.'
  },
  '#btn-plugin-url-error': {
    message: 'Enter a page path starting with /, or a full link starting with https://, mailto: or tel:.'
  },
  'fieldset.ss-plugin-field.btn-plugin-colors@1': {
    default: 'Design default'
  },
  'fieldset.ss-plugin-field.btn-plugin-colors@2': {
    default: 'Design default'
  },
  '#btn-plugin-icon': {
    default: 'No icon'
  },
  '.ss-plugin-submit': {
    insert: 'Insert button',
    update: 'Update button',
    'done-editing': 'Done'
  }
};
