/*
 * The block view's words: each element (a CSS selector in block.html) and its
 * data-* messages (name without `data-`), set on the page before the view's script runs
 * (shared/messages.js). A site rewords any of them in its configuration's `messages` tab
 * (`view` | `element` | `message` | `text`). Generated once from the HTML; edit here.
 */
export default {
  '.bs-mode': {
    edit: 'Editing a block',
    trial: 'New block · not added yet',
    insert: 'Add a block'
  },
  '.ss-plugin-status': {
    loading: 'Loading…',
    standalone: 'Open this panel from the page editor in DA to style a block.',
    missing: 'No blocks are set up for this site yet (DA sheet /.da/library/blocks, data tab).'
  },
  '#bs-form': {
    choose: 'Choose a block…',
    default: 'Default',
    none: 'None',
    other: 'More settings'
  },
  '.bs-current': {
    text: '{block} · in the page'
  },
  '.ss-plugin-section': {
    image: 'Image',
    heading: 'Heading',
    text: 'Text',
    button: 'Button',
    list: 'List',
    rich: 'Formatted text',
    item: 'Item',
    empty: 'Empty',
    column: 'column',
    'main-heading': 'Main heading',
    title: 'Title',
    subtitle: 'Subheading',
    description: 'Description',
    paragraph: 'Paragraph',
    date: 'Date',
    attribution: 'Attribution',
    number: 'Number',
    'number-label': 'Label',
    'video-link': 'Video link',
    'post-link': 'Instagram post link',
    'column-title': 'Column',
    caption: 'Caption',
    'row-name': 'Name',
    ordinals: 'First,Second,Third,Fourth,Fifth,Sixth,Seventh,Eighth',
    add: 'Add',
    'add-item': 'Add {item}',
    remove: 'Remove',
    up: 'Move up',
    down: 'Move down',
    'new-heading': 'New heading',
    'new-text': 'New text',
    'new-button': 'Button',
    'button-style': 'Button style',
    upload: 'Upload image…',
    uploading: 'Uploading…',
    'upload-failed': 'Couldn\'t upload the image. Try again, or drag it into the page.',
    'bad-type': 'Use a PNG, JPEG, GIF, WebP, AVIF or SVG image.',
    'too-big': 'The image is over 20 MB.',
    'empty-image': 'No image yet: upload one or paste a link.',
    'image-link': 'Image link',
    'bad-image': 'Use an image link that starts with https://.',
    alt: 'Alt text',
    decorative: 'Decorative image (no alt text)',
    'alt-missing': 'Describe the image, or tick Decorative.',
    level: 'Level',
    label: 'Label',
    link: 'Link',
    'bad-link': 'Use a page path (/…), a link starting with https://, mailto: or tel:.',
    lines: 'One item per line.',
    'rich-note': 'This has formatting or links inside the text: edit it in the page.'
  },
  '.bs-kept': {
    label: 'Also kept as it is:'
  },
  '.ss-plugin-message': {
    pick: 'Choose a block first.',
    applying: 'Applying…',
    applied: '✓ Applied to the page.',
    moved: 'The cursor left that block, so the last change wasn\'t applied. Click the block and pick again.',
    stale: 'The page changed while applying. Pick again to apply.',
    'read-only': 'This page is read-only.',
    'apply-failed': 'Couldn\'t change the block. Click it in the page and try again.',
    'button-style-failed': 'Couldn\'t open that button. Highlight its text in the page to change it.',
    'text-selected': 'Some text is highlighted in the page and would be replaced. Click on an empty line instead.',
    done: '✓ Block inserted.',
    misplaced: '⚠ The block went inside a table (such as Section Metadata), not into the page. Undo (Ctrl+Z or ⌘Z), then click on an empty line.',
    failed: 'Couldn\'t insert the block. Click on an empty line in the page and try again.',
    timeout: 'DA didn\'t answer in time, so the panel stopped waiting. Check the page: if the change shows twice, press Undo (Ctrl+Z or ⌘Z).',
    placing: 'Placing the block…',
    placed: 'It\'s in the page so you can see it. Set it up, then choose Add block (or Cancel).',
    kept: '✓ Block added. To add another, click an empty line and choose a block; to change one, click it.',
    'in-block': 'Your cursor is still in a block. Click an empty line above or below it, then choose the block.',
    removed: 'Cancelled: the block is gone and the empty line is back.',
    left: '✓ Block added. Click it any time to change it, or Undo (Ctrl+Z or ⌘Z) to take it out.',
    restored: '⚠ That line wasn\'t empty, so it was put back. Click on an empty line, then choose the block again.',
    'settings-restored': '⚠ The cursor was in the section\'s settings table, so it was put back. Click on an empty line, then choose the block again.',
    replaced: '⚠ The block replaced part of the page (such as a section\'s settings). Undo (Ctrl+Z or ⌘Z), then click on an empty line.',
    'metadata-lost': '⚠ The block replaced the page\'s Metadata table. Undo (Ctrl+Z or ⌘Z), then click on an empty line.',
    'not-inside': 'The block was added. Click it in the page to style it.',
    'not-placed': 'Couldn\'t place the block here. Click on an empty line in the page, then choose the block again.'
  },
  '.ss-plugin-submit': {
    insert: 'Insert block',
    adding: 'Inserting…'
  }
};
