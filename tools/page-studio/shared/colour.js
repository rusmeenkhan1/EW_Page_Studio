/*
 * Colour helpers for Page Studio. textOn(): the text colour that reads best on a section
 * background (white or dark #333) and its contrast; contrastText(): black or white on a
 * button colour. A site that switches its text colour on dark backgrounds should use the same
 * rule (WCAG 2.x relative luminance), so the panel's notes match the page.
 */

export const HEX_COLOR = /^#(?:[0-9a-f]{3}){1,2}$/i;

/** @returns {string} `#rrggbb`, lower case (the colour input needs six digits) */
export const toLongHex = (hex) => (hex.length === 4
  ? `#${hex.slice(1).replace(/./g, '$&$&')}`
  : hex).toLowerCase();

/** WCAG 2.x relative luminance of a `#rgb` / `#rrggbb` colour. */
function luminance(hex) {
  const digits = toLongHex(hex).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(digits.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * The text colour the site uses on a section background, and its contrast.
 * @param {string} hex the background colour
 * @returns {{light: boolean, ratio: number}} light: white text (else #333); ratio: its contrast
 */
export function textOn(hex) {
  const bg = luminance(hex);
  const white = contrast(1, bg);
  const dark = contrast(luminance('#333333'), bg);
  return { light: white > dark, ratio: Math.max(white, dark) };
}

/**
 * Black or white, whichever contrasts more with a button colour (any CSS colour).
 * @returns {string} '#000' or '#fff'
 */
export function contrastText(color) {
  const probe = document.createElement('span');
  probe.style.color = color;
  document.body.append(probe);
  const rgb = getComputedStyle(probe).color.match(/^rgba?\(([^)]+)\)/);
  probe.remove();
  if (!rgb) return '#fff';
  const [r, g, b] = rgb[1].split(/[\s,/]+/).slice(0, 3).map((c) => {
    const s = Number(c) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) ? '#000' : '#fff';
}

/** `section-blue-bg` → `Blue`, `sage-grey-bg` → `Sage grey`: a sheet colour's name for people. */
export const colourName = (name) => {
  const words = name.replace(/^section-/, '').replace(/-bg$/, '').replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
