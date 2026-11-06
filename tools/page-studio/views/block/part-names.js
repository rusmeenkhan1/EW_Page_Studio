/*
 * Names for the parts of a block's Content area: what each part is for, not just its
 * kind, so no two fields of a row read the same ("Title", "Date", "Description", not
 * "Heading", "Text 1", "Text 2").
 *
 * In order, the first that applies:
 *   1. the sheet's specific names for the block (an options row with `type` content):
 *      `<style>/<kind>-<n>`, `<style>/<kind>`, `<kind>-<n>` (n = the nth part of that kind in
 *      its cell; style = a variant class, e.g. `profile/text=Job title`)
 *   2. what the part holds: a date, a number ("97%", "233,000+") and the label after it, an
 *      attribution ("– Name"), a video or Instagram link
 *   3. the sheet's general names: `<kind>`, `column<N>` (a column's only part)
 *   4. where it is: a `name | value` row (the value takes the name, e.g. "Message"), the H1
 *      (main heading), a column's first heading (title), the text under an image (caption)
 *      or a heading (description), several paragraphs, buttons or images (numbered or
 *      first / second…), a column's only text (column N)
 *   5. what is left the same in a row gets its column, or a number, added
 * The words come from the Content area's data-* attributes (block.html).
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_DATE = /^([a-z]+)\.? (\d{1,2}),? (\d{4})$/i; // March 25, 2026 (spaces already single)
const NUMERIC_DATE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/; // 25/03/2026, 3-25-26
/** A date as authors write it: `March 25, 2026`, `Mar. 25 2026`, `25/03/2026`. */
const DATE = {
  test(text) {
    const words = String(text).trim().replace(/\s+/g, ' ');
    const month = words.match(MONTH_DATE);
    if (month) return MONTHS.includes(month[1].slice(0, 3).toLowerCase());
    return NUMERIC_DATE.test(words);
  },
};
const NUMBER = /^[$€£]?\s?\d[\d,.]*\s?(?:%|\+|k|m|bn)?\+?$/i;
const ATTRIBUTION = /^[-–—]\s?\S/;
const VIDEO = /(?:youtube\.com|youtu\.be|vimeo\.com)/i;
const INSTAGRAM = /instagram\.com/i;

const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const href = (el) => el.querySelector('a[href]')?.getAttribute('href') || '';

/** The sheet's specific name for a part ('' when none). */
function specificName(names, variants, kind, n) {
  const keys = variants.flatMap((v) => [`${v}/${kind}-${n}`, `${v}/${kind}`]);
  keys.push(`${kind}-${n}`);
  return keys.map((k) => names[k]).find(Boolean) || '';
}

/** The sheet's general name for a part ('' when none). */
function generalName(names, variants, kind, column, alone) {
  const keys = alone ? [...variants.map((v) => `${v}/column${column}`), `column${column}`] : [];
  keys.push(kind);
  return keys.map((k) => names[k]).find(Boolean) || '';
}

/** A short text, the row's only first-column part, and something after it: `Message | …`. */
const nameOfRow = (row, list) => {
  if (list || row.cells.length !== 2 || row.cells[0].parts.length !== 1) return '';
  const [only] = row.cells[0].parts;
  const t = text(only.el);
  return only.kind === 'text' && t.length <= 30 && row.cells[1].parts.length ? t : '';
};

/** A plain text: not a date, a number or an attribution line. */
const isPlainText = (p) => p.kind === 'text'
  && !DATE.test(text(p.el)) && !NUMBER.test(text(p.el)) && !ATTRIBUTION.test(text(p.el));

/**
 * What a part holds names it first (over the sheet's general names): a number and the label
 * after it, an attribution line, a date, a video or Instagram link.
 * @returns {{name: string, role?: string}|null}
 */
function contentName(part, words, afterNumber) {
  const t = text(part.el);
  const isText = part.kind === 'heading' || part.kind === 'text';
  if (isText && NUMBER.test(t)) return { name: words.number, role: 'number' };
  if (isText && afterNumber) return { name: words.numberLabel };
  if ((part.kind === 'text' || part.kind === 'rich') && ATTRIBUTION.test(t)) return { name: words.attribution };
  if (part.kind === 'text' && DATE.test(t)) return { name: words.date };
  if (part.kind === 'button' && VIDEO.test(href(part.el))) return { name: words.videoLink };
  if (part.kind === 'button' && INSTAGRAM.test(href(part.el))) return { name: words.postLink };
  return null;
}

/** A heading: the H1 is the main heading; else a column's first is its title, a later one a subtitle. */
function headingName(part, cell, words) {
  let name = words.subtitle;
  if (part.el.tagName === 'H1') name = words.mainHeading;
  else if (cell.headingsSeen === 0) name = words.title;
  cell.headingsSeen += 1;
  return name;
}

/** A plain text: a caption under an image, numbered paragraphs, a description, a column's text. */
function textName(part, cell, ctx) {
  const { words } = ctx;
  if (cell.afterImage) return words.caption;
  if (cell.plainTexts.length > 1) return `${words.paragraph} ${cell.plainTexts.indexOf(part) + 1}`;
  if (cell.afterHeading || cell.headingsSeen) return words.description;
  if (cell.alone) return `${words.columnTitle} ${ctx.column}`;
  return words.text;
}

/** Where a part is names it otherwise: the sheet's general name, the row's name, its kind and place. */
function placeName(part, n, cell, ctx) {
  const {
    words, general, rowName, column, row,
  } = ctx;
  if (general) return general;
  if (rowName && column === 1) return words.rowName;
  if (rowName && column === 2) return rowName;
  switch (part.kind) {
    case 'image':
      return cell.images > 1 ? `${ctx.ordinal(n - 1)} ${words.image.toLowerCase()}` : words.image;
    case 'heading':
      return headingName(part, cell, words);
    case 'text':
      return textName(part, cell, ctx);
    case 'button': {
      const name = row.buttons > 1 ? `${ctx.ordinal(row.buttonsSeen)} ${words.button.toLowerCase()}` : words.button;
      row.buttonsSeen += 1;
      return name;
    }
    case 'list':
      return words.list;
    default:
      return words.rich;
  }
}

/** Names still the same: in other columns, add the column; in the same column, a number. */
function uniqueNames(named, words) {
  const result = new Map();
  const all = [...named.entries()];
  all.forEach(([part, { name, column }]) => {
    const twins = all.filter(([, o]) => o.name === name);
    if (twins.length === 1) {
      result.set(part, name);
      return;
    }
    const columns = new Set(twins.map(([, o]) => o.column));
    const sameColumn = twins.filter(([, o]) => o.column === column);
    let label = name;
    if (columns.size > 1) label = `${label} (${words.column} ${column})`;
    if (sameColumn.length > 1) label = `${label} ${sameColumn.findIndex(([p]) => p === part) + 1}`;
    result.set(part, label);
  });
  return result;
}

/**
 * @param {Object} row a content row (readContent())
 * @param {Object} opts { names, variants, words, list }
 * @returns {Map<Object, string>} part → its name, unique in the row
 */
export default function nameParts(row, {
  names = {}, variants = [], words, list = false,
}) {
  const ordinal = (i) => (words.ordinals || '').split(',')[i]?.trim() || `${i + 1}.`;
  const named = new Map();
  const roles = new Map(); // part → number / date / … (what the next part may depend on)
  const multiCell = row.cells.length > 1;
  const rowState = {
    buttons: row.cells.reduce((sum, c) => sum + c.parts.filter((p) => p.kind === 'button').length, 0),
    buttonsSeen: 0,
  };
  const rowName = nameOfRow(row, list);
  let previous = null; // the part before, in reading order across the row

  row.cells.forEach((cellModel, c) => {
    const seen = {};
    const cell = {
      plainTexts: cellModel.parts.filter(isPlainText),
      images: cellModel.parts.filter((p) => p.kind === 'image').length,
      headingsSeen: 0, // per column: each column of a table has its own title
      afterHeading: false,
      afterImage: false,
      alone: multiCell && cellModel.parts.length === 1,
    };
    cellModel.parts.forEach((part) => {
      seen[part.kind] = (seen[part.kind] || 0) + 1;
      const n = seen[part.kind];
      let name = specificName(names, variants, part.kind, n);
      let role = '';
      if (!name) {
        const held = contentName(part, words, previous && roles.get(previous) === 'number');
        if (held) {
          name = held.name;
          role = held.role || '';
        } else {
          name = placeName(part, n, cell, {
            words,
            ordinal,
            rowName,
            column: c + 1,
            row: rowState,
            general: generalName(names, variants, part.kind, c + 1, cell.alone),
          });
        }
      }
      if (part.kind === 'heading') cell.afterHeading = true;
      cell.afterImage = part.kind === 'image';
      roles.set(part, role);
      named.set(part, { name, column: c + 1 });
      previous = part;
    });
  });
  return uniqueNames(named, words);
}
