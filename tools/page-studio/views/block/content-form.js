/*
 * The Content area of the Block view panel: one field per part of the block
 * (block-content.js), grouped by row; items (cards, quote lines…) as collapsible groups
 * that can be added, removed and moved. Every change edits the working copy of the block
 * and calls `onChange`; the panel then updates the preview and, while styling a page
 * block, the page. The words come from the data-* attributes of `.bs-content`
 * (block.html).
 */
import {
  readContent, textOf, imageValues, buttonValues, listValues, headingLevel, safeLink, safeImage,
  setText, setLevel, setButton, setImage, setList, addPart, addItem, moveItem,
} from './block-content.js';
import nameParts from './part-names.js';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml'];
const MAX_UPLOAD = 20 * 1024 * 1024; // 20 MB
const SNIPPET = 48;

let uid = 0;
const nextId = () => {
  uid += 1;
  return `bs-c${uid}`;
};

const make = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

const snippet = (text) => (text.length > SNIPPET ? `${text.slice(0, SNIPPET - 1)}…` : text);

/**
 * @param {Element} root the `.bs-content` element (its data-* hold the words)
 * @param {Object} opts
 * @param {Element} opts.el the working copy of the block
 * @param {string[]} opts.propKeys the block's property keys (not content)
 * @param {Object<string, string>} opts.names the sheet's names for the block: `item`, a row
 *   by the kind of its first part (`row-image=Background image`), and the parts' names
 *   (part-names.js: `profile/text=Job title`, `text-2=Summary`, `column1=Tab name`…)
 * @param {string[]} opts.variants the block's variant classes (for style-specific names)
 * @param {function({typing: boolean, rerender: boolean})} opts.onChange
 * @param {function(string): Promise<string>} opts.thumbnail an image address → one the panel
 *   can show
 * @param {function(File): Promise<string>} opts.upload a file → its DA address
 * @param {function(Element)} [opts.buttonStyle] opens a button part in Page Studio's Button
 *   view; without it the button has no Button style control
 */
export default function renderContent(root, opts) {
  const words = root.dataset;
  const {
    el, propKeys, names, variants = [], onChange, thumbnail, upload, buttonStyle,
  } = opts;
  const model = readContent(el, propKeys, Boolean(names.item));
  const list = root.querySelector('.bs-content-list');
  list.replaceChildren();
  root.hidden = !model.rows.length;
  if (!model.rows.length) return;

  const changed = (typing = false, rerender = false) => onChange({ typing, rerender });
  const kindName = (kind) => names[kind] || words[kind];

  /** A labelled control line, with a Remove button for the part. */
  function line(label, control, onRemove) {
    const wrap = make('div', 'bs-part');
    const head = make('div', 'bs-part-head');
    const title = make('label', 'bs-part-label', label);
    head.append(title);
    if (onRemove) {
      const remove = make('button', 'bs-icon-button', '✕');
      remove.type = 'button';
      remove.setAttribute('aria-label', `${words.remove} ${label}`);
      remove.title = `${words.remove} ${label}`;
      remove.addEventListener('click', onRemove);
      head.append(remove);
    }
    const first = control.matches('input, textarea, select') ? control : control.querySelector('input, textarea, select');
    if (first) {
      first.id ||= nextId();
      title.htmlFor = first.id;
    }
    wrap.append(head, control);
    return wrap;
  }

  const textInput = (value, onInput, multiline = false) => {
    const input = make(multiline ? 'textarea' : 'input', 'bs-input');
    if (!multiline) input.type = 'text';
    else input.rows = Math.min(6, Math.max(2, Math.ceil(value.length / 40)));
    input.value = value;
    input.spellcheck = true;
    input.addEventListener('input', () => onInput(input.value, input));
    return input;
  };

  /** A field that checks its value: invalid stays in the field, marked, until it's fixed. */
  const checkedInput = (value, check, problem, onValid) => {
    const box = make('div', 'bs-checked');
    const note = make('p', 'bs-field-note', '');
    note.id = nextId();
    const input = textInput(value, (v) => {
      const ok = v.trim() === '' ? '' : check(v);
      const bad = v.trim() !== '' && !ok;
      input.setAttribute('aria-invalid', String(bad));
      note.textContent = bad ? problem : '';
      if (!bad && ok) onValid(ok);
    });
    input.setAttribute('aria-describedby', note.id);
    box.append(input, note);
    return box;
  };

  function imageField(part, label, remove) {
    const box = make('div', 'bs-image');
    const { src, alt } = imageValues(part.el);
    // a dash until (unless) the image can be shown
    const thumb = make('div', 'bs-thumb', '—');
    if (src) {
      thumbnail(src).then((url) => {
        if (!url) return;
        const img = make('img');
        img.alt = '';
        img.addEventListener('load', () => thumb.replaceChildren(img));
        img.src = url;
      });
    }
    const status = make('p', 'bs-field-note', src ? '' : words.emptyImage);
    status.setAttribute('role', 'status');
    const file = make('input');
    file.type = 'file';
    file.accept = IMAGE_TYPES.join(',');
    file.className = 'bs-file';
    file.id = nextId();
    const pick = make('label', 'bs-upload', words.upload);
    pick.htmlFor = file.id;
    file.addEventListener('change', async () => {
      const [chosen] = file.files;
      file.value = '';
      if (!chosen) return;
      if (!IMAGE_TYPES.includes(chosen.type)) { status.textContent = words.badType; return; }
      if (chosen.size > MAX_UPLOAD) { status.textContent = words.tooBig; return; }
      status.textContent = words.uploading;
      pick.setAttribute('aria-disabled', 'true');
      try {
        const url = await upload(chosen);
        if (!url) throw new Error('no address');
        part.el = setImage(part.el, { src: url });
        changed(false, true);
      } catch {
        status.textContent = words.uploadFailed;
        pick.removeAttribute('aria-disabled');
      }
    });
    const top = make('div', 'bs-image-top');
    top.append(thumb, pick, file);

    const link = checkedInput(src, safeImage, words.badImage, (url) => {
      part.el = setImage(part.el, { src: url });
      changed(true, false);
    });
    // missing alt text is an error on the site (axe); empty alt marks a decorative image
    const hint = make('p', 'bs-field-note', '');
    hint.id = nextId();
    const altInput = textInput(alt ?? '', (v) => {
      part.el = setImage(part.el, { alt: v });
      changed(true);
    });
    const decorative = make('label', 'bs-check');
    const box2 = make('input');
    box2.type = 'checkbox';
    box2.checked = alt === '';
    altInput.disabled = box2.checked;
    altInput.setAttribute('aria-describedby', hint.id);
    const altHint = () => {
      hint.textContent = !box2.checked && !altInput.value.trim() ? words.altMissing : '';
    };
    altHint();
    altInput.addEventListener('input', altHint);
    box2.addEventListener('change', () => {
      altInput.disabled = box2.checked;
      part.el = setImage(part.el, { alt: box2.checked ? '' : altInput.value });
      altHint();
      changed(false);
    });
    decorative.append(box2, make('span', '', words.decorative));

    const altLine = line(words.alt, altInput);
    altLine.append(hint);
    box.append(top, status, line(words.imageLink, link), altLine, decorative);
    return line(label, box, remove);
  }

  function headingField(part, label, remove) {
    const box = make('div', 'bs-heading');
    const level = make('select', 'bs-level');
    level.setAttribute('aria-label', `${label}: ${words.level}`);
    [1, 2, 3, 4, 5, 6].forEach((n) => level.append(new Option(`H${n}`, String(n))));
    level.value = String(headingLevel(part.el));
    level.addEventListener('change', () => {
      part.el = setLevel(part.el, Number(level.value));
      changed(false);
    });
    const input = textInput(textOf(part.el), (v) => {
      setText(part.el, v);
      changed(true);
    });
    box.append(input, level);
    return line(label, box, remove);
  }

  function buttonField(part, label, remove) {
    const box = make('div', 'bs-button');
    const { label: text, href } = buttonValues(part.el);
    const labelInput = textInput(text, (v) => {
      setButton(part.el, { label: v });
      changed(true);
    });
    const link = checkedInput(href, safeLink, words.badLink, (url) => {
      setButton(part.el, { href: url });
      changed(true);
    });
    box.append(line(words.label, labelInput), line(words.link, link));
    if (buttonStyle) {
      // its design, colours, icon and new tab: in Page Studio's Button view
      const style = make('button', 'bs-tool bs-button-style', words.buttonStyle);
      style.type = 'button';
      style.setAttribute('aria-label', `${words.buttonStyle}: ${label}`);
      style.addEventListener('click', () => buttonStyle(part.el));
      box.append(style);
    }
    return line(label, box, remove);
  }

  function partField(part, label, remove) {
    if (part.kind === 'image') return imageField(part, label, remove);
    if (part.kind === 'heading') return headingField(part, label, remove);
    if (part.kind === 'button') return buttonField(part, label, remove);
    if (part.kind === 'text') {
      return line(label, textInput(textOf(part.el), (v) => {
        setText(part.el, v);
        changed(true);
      }, true), remove);
    }
    if (part.kind === 'list') {
      const area = textInput(listValues(part.el).join('\n'), (v) => {
        setList(part.el, v.split('\n'));
        changed(true);
      }, true);
      const note = make('p', 'bs-field-note', words.lines);
      note.id = nextId();
      area.setAttribute('aria-describedby', note.id);
      const field = line(label, area, remove);
      field.append(note);
      return field;
    }
    const shown = make('div', 'bs-rich');
    shown.append(
      make('p', 'bs-rich-text', snippet(part.el.textContent.replace(/\s+/g, ' ').trim()) || '—'),
      make('p', 'bs-field-note', words.richNote),
    );
    return line(label, shown, remove);
  }

  /** The fields of one cell, each named for what it is (part-names.js), and its Add menu. */
  function cellFields(cell, cellIndex, cellCount, labels) {
    const box = make('div', 'bs-cell');
    cell.parts.forEach((part) => {
      const label = labels.get(part) || kindName(part.kind);
      const remove = () => {
        part.el.remove();
        changed(false, true);
      };
      box.append(partField(part, label, remove));
    });
    const add = make('select', 'bs-add');
    add.setAttribute('aria-label', cellCount > 1 ? `${words.add} (${words.column} ${cellIndex + 1})` : words.add);
    add.append(new Option(`+ ${words.add}`, ''));
    ['heading', 'text', 'button', 'image'].forEach((kind) => add.append(new Option(kindName(kind), kind)));
    add.addEventListener('change', () => {
      if (!add.value) return;
      const starters = { heading: words.newHeading, text: words.newText, button: words.newButton };
      addPart(cell.el, add.value, starters);
      changed(false, true);
    });
    box.append(add);
    return box;
  }

  const rowSummary = (row) => row.cells.flatMap((c) => c.parts)
    .map((p) => (p.kind === 'image' ? '' : p.el.textContent.replace(/\s+/g, ' ').trim()))
    .find(Boolean) || '';

  // a row's title: its parts' names (without the numbers that keep them apart)
  const partsOf = (labels) => [...new Set([...labels.values()]
    .map((l) => l.replace(/ \(.*\)$| \d+$/, '')))].join(', ') || words.empty;

  model.rows.forEach((row, i) => {
    const labels = nameParts(row, {
      names, variants, words, list: model.list,
    });
    const cells = row.cells.map((cell, c) => cellFields(cell, c, row.cells.length, labels));
    if (!model.list) {
      const group = make('fieldset', 'bs-group');
      const firstKind = row.cells.flatMap((c) => c.parts)[0]?.kind;
      const title = names[`row-${firstKind}`] || partsOf(labels);
      group.append(make('legend', 'bs-group-title', title), ...cells);
      list.append(group);
      return;
    }
    const item = names.item || words.item;
    const details = make('details', 'bs-item');
    if (model.rows.length <= 2) details.open = true;
    const summary = make('summary', 'bs-item-title');
    summary.append(make('span', 'bs-item-name', `${item} ${i + 1}`), make('span', 'bs-item-snippet', snippet(rowSummary(row))));
    const tools = make('div', 'bs-item-tools');
    const tool = (text, disabled, act) => {
      const b = make('button', 'bs-tool', text);
      b.type = 'button';
      b.disabled = disabled;
      b.setAttribute('aria-label', `${text}: ${item} ${i + 1}`);
      b.addEventListener('click', act);
      return b;
    };
    const last = model.rows.length - 1;
    const restructure = (act) => () => {
      act();
      changed(false, true);
    };
    tools.append(
      tool(words.up, i === 0, restructure(() => moveItem(model.rows, i, -1))),
      tool(words.down, i === last, restructure(() => moveItem(model.rows, i, 1))),
      tool(words.remove, last === 0, restructure(() => row.el.remove())),
    );
    details.append(summary, tools, ...cells);
    list.append(details);
  });

  if (model.list) {
    const item = names.item || words.item;
    const more = make('button', 'bs-add-item', `+ ${words.addItem.replace('{item}', item.toLowerCase())}`);
    more.type = 'button';
    more.addEventListener('click', () => {
      const last = model.rows[model.rows.length - 1];
      addItem(last.el, last.el);
      changed(false, true);
    });
    list.append(more);
  }
}
