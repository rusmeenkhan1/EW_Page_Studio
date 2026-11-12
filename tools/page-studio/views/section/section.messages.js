/*
 * The section view's words: each element (a CSS selector in section.html) and its
 * data-* messages (name without `data-`), set on the page before the view's script runs
 * (shared/messages.js). A site rewords any of them in its configuration's `messages` tab
 * (`view` | `element` | `message` | `text`). Generated once from the HTML; edit here.
 */
export default {
  '.ss-plugin-mode': {
    insert: 'Add settings',
    trial: 'New settings · not added yet',
    edit: 'Editing a section'
  },
  'li@1': {
    insert: 'Click an empty line in a section',
    update: 'Change the settings'
  },
  'li@2': {
    insert: 'Pick a style: the page shows it',
    update: 'The page follows each pick'
  },
  'li@3': {
    insert: 'Choose Add settings',
    update: 'Choose Done'
  },
  '.ss-plugin-status': {
    loading: 'Loading…',
    standalone: 'Open this panel from the page editor in DA to style a section.',
    missing: 'No section styles are set up for this site yet (DA sheet /.da/library/blocks, options tab).'
  },
  '#ss-plugin-form': {
    choose: 'Choose…',
    other: 'Other',
    'other-settings': 'Other settings',
    'not-set': 'Not set',
    'colour-custom': 'Custom',
    'colour-code': 'Colour code',
    'colour-empty': 'e.g. #e2f7ff',
    'colour-clear': 'None',
    'colour-sample': 'Text on this colour',
    'colour-none': 'No background colour.',
    'colour-invalid': 'Type a colour code like #e2f7ff.',
    'colour-dark': '✓ Dark text reads well on this colour.',
    'colour-light': '✓ White text reads well on this colour.',
    'colour-low': '⚠ Neither dark nor white text reads well on this colour. Try a lighter or darker one.'
  },
  '.ss-plugin-blocked-title': {
    text: 'Your cursor is in the {block} block.',
    unnamed: 'Your cursor is in a block.'
  },
  '.ss-plugin-blocked-settings': {
    has: 'This section\'s settings: {settings}.',
    none: 'This section has no settings yet.'
  },
  '.ss-plugin-editing-title': {
    trial: 'Not added yet',
    edit: 'Editing this section\'s settings'
  },
  '.ss-plugin-editing-kept': {
    label: 'Also kept as it is:'
  },
  '.ss-plugin-message': {
    empty: 'Pick a background colour or a layout first.',
    'bad-colour': 'That colour code isn\'t valid. Use one like #e2f7ff, or choose None.',
    done: '✓ Settings added to this section.',
    failed: 'Couldn\'t add it. Click on an empty line in the section and try again.',
    updated: '✓ Section updated.',
    moved: 'The cursor left the settings table, so that change was put back. Highlight a value in the table to go on.',
    gone: 'Highlight a value (such as the colour code) in the section\'s settings table again, then choose Edit them.',
    'no-replace': 'This version of DA can\'t update settings from a panel. Change the table in the page instead.',
    'read-only': 'This page is read-only.',
    'update-failed': 'Couldn\'t update the section. Highlight a value in its settings table and try again.',
    timeout: 'DA didn\'t answer in time, so the panel stopped waiting. Check the page: if the change shows twice, press Undo (Ctrl+Z or ⌘Z).',
    'in-metadata': 'This section already has settings. Choose Edit them at the top to change them.',
    'section-has': 'This section already has settings, so nothing was added. Highlight a value (such as the colour code) in its Section Metadata table to change them.',
    'in-block': 'Your cursor is inside a block. Click on an empty line below the section\'s text instead.',
    'text-selected': 'Some text is highlighted in the page and would be replaced. Click on an empty line instead.',
    duplicate: '⚠ This section now has two settings tables. Undo (Ctrl+Z or ⌘Z), then edit the existing one.',
    merged: '✓ This section already had settings, so they were updated instead of adding a table inside them.',
    nested: '⚠ The settings went inside the section\'s existing settings table. Undo (Ctrl+Z or ⌘Z), then highlight that table to edit it.',
    lost: '⚠ The settings didn\'t reach a section: the cursor may have been in the page metadata table. Undo (Ctrl+Z or ⌘Z), then click on an empty line in the section.',
    applying: 'Applying…',
    applied: '✓ Applied to the page.',
    placed: 'They\'re in the page so you can see them. Pick more, then choose Add settings (or Cancel).',
    kept: '✓ Settings added. Click an empty line in another section to add more; to change these, highlight a value in their table.',
    added: '✓ Settings added. To change them, highlight a value in the section\'s settings table.',
    removed: 'Cancelled: the settings are gone and the empty line is back.',
    'taken-out': '✓ Settings removed from this section. The empty line is back.',
    cleared: '✓ All settings taken off, so the table is gone. Pick again to add new settings on that line.',
    left: 'The settings stay on the page. Highlight a value in the table to change them again, or Undo (Ctrl+Z or ⌘Z).',
    restored: '⚠ That line wasn\'t empty, so it was put back. Click on an empty line in the section, then pick again.',
    replaced: '⚠ The settings replaced part of the page. Undo (Ctrl+Z or ⌘Z), then click on an empty line in the section.',
    'metadata-lost': '⚠ The settings replaced the page\'s Metadata table. Undo (Ctrl+Z or ⌘Z), then click on an empty line in the section.'
  },
  '.ss-plugin-submit': {
    insert: 'Apply to section',
    update: 'Update this section\'s settings',
    adding: 'Adding…',
    updating: 'Updating…'
  },
  '.ss-plugin-reset': {
    clear: 'Start over',
    done: 'Done'
  }
};
