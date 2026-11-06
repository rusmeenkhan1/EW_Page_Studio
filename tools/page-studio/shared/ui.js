/*
 * Panel UI pieces shared by the Block view and the Section view (one look): the status
 * and message lines, the collapsible settings cards and the colour swatches. The CSS is in
 * shared/ui.css (`ss-plugin-*`).
 */

const toCamel = (key) => key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// shown above the form: the panel isn't ready (or can't be used) yet
const STATUS_KEYS = ['loading', 'standalone', 'missing'];

/**
 * The panel's say(key): each text is a data-* attribute of the status or message element
 * (`data-apply-failed` for 'apply-failed'); null clears the message.
 * @param {Object<string, string>} tones the tone per message key
 * @param {string} fallback the tone of a key not in `tones`
 */
export function messenger({
  status, message, tones, fallback,
}) {
  return (key) => {
    if (STATUS_KEYS.includes(key)) {
      status.textContent = status.dataset[key];
      return;
    }
    status.textContent = '';
    message.textContent = (key && message.dataset[toCamel(key)]) || '';
    message.dataset.tone = key ? tones[key] || fallback : '';
  };
}

/**
 * One collapsible settings card, open: its title, a line saying what is picked (the panel's
 * updateSummaries()) and a body for its fields.
 * @returns {{card: HTMLDetailsElement, body: HTMLDivElement}}
 */
export function settingsCard(label) {
  const card = document.createElement('details');
  card.className = 'ss-plugin-section';
  card.open = true;
  const summary = document.createElement('summary');
  const title = document.createElement('span');
  title.className = 'ss-plugin-section-title';
  title.textContent = label;
  const picked = document.createElement('span');
  picked.className = 'ss-plugin-section-sum';
  summary.append(title, picked);
  const body = document.createElement('div');
  body.className = 'ss-plugin-section-body';
  card.append(summary, body);
  return { card, body };
}

/** A round colour chip with its name under it (`colour` paints the chip). */
export function swatchButton(className, label, colour) {
  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = `ss-plugin-swatch ${className}`.trim();
  const chip = document.createElement('span');
  chip.className = 'ss-plugin-swatch-chip';
  chip.setAttribute('aria-hidden', 'true');
  if (colour) swatch.style.setProperty('--chip', colour);
  const name = document.createElement('span');
  name.className = 'ss-plugin-swatch-name';
  name.textContent = label;
  swatch.append(chip, name);
  return swatch;
}
