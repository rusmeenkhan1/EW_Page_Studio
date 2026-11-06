/**
 * Toggle optional, self-contained features on/off. Set to `false` to skip a
 * feature entirely for projects that don't need it.
 */
export default {
  sectionBackground: true, // scripts/feature-flags/sections.js — applySectionBackgroundDecorations
  nestedSections: true, // scripts/feature-flags/sections.js — decorateNestedSections, see docs/nested-sections.md
  themeSheet: false, // scripts/feature-flags/theme-sheet.js — loadThemeSpreadSheetConfig
  spanTags: true, // scripts/feature-flags/bracket-tags.js — decorateSpanTags, see docs/span-tags.md and docs/cell-class.md
  videoLinks: true, // scripts/scripts.js — buildAutoBlocks auto-embeds bare YouTube/Vimeo links
  fragmentLinks: true, // scripts/scripts.js — buildAutoBlocks auto-loads bare `/fragments/` links
};
