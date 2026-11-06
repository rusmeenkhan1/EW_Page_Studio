/**
 * A11y test configuration.
 *
 * wcagTags — axe-core rule tags to test against.
 *   Supported values: wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa
 *   Current set covers all Level A and AA criteria from WCAG 2.0 through 2.2.
 *   Level AAA is intentionally excluded — not legally required and not satisfiable
 *   for all content types. If axe-core adds wcag23aa in future, add it here.
 *
 * failOnImpact — violation impact levels that cause a non-zero exit code.
 *   Supported values: critical, serious, moderate, minor
 *   moderate and minor are logged as warnings but never fail the run.
 *
 * urls — relative paths tested in Mode 1 (npm run test:a11y).
 *   Combined with A11Y_BASE_URL env variable (default: http://localhost:3000).
 *   Guidelines:
 *   - Add one entry per unique block type (via its demo page)
 *   - Add one entry per unique page template
 *   - Paths must start with /
 *   - When adding a new block to the project, add its demo page path here in the same PR
 */
export default {
  wcagTags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
  failOnImpact: ['critical', 'serious'],
  urls: [
    '/',
    '/docs/library/blocks/carousel',
    '/docs/library/blocks/card-carousel',
    '/docs/library/blocks/cards',
    '/docs/library/blocks/columns',
    '/docs/library/blocks/embed',
    '/docs/library/blocks/form',
    '/docs/library/blocks/fragment',
    '/docs/library/blocks/hero',
    '/docs/library/blocks/modal',
    '/docs/library/blocks/accordion',
  ],
};
