import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import config from './a11y.config.js';

const { wcagTags, failOnImpact, urls } = config;

// Mode 2: URL passed as argument to run.js, forwarded via A11Y_URL env var
const singleUrl = process.env.A11Y_URL || null;

// Mode 1: build URL list from config + base URL
const BASE_URL = process.env.A11Y_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000';
const testUrls = singleUrl
  ? [singleUrl]
  : urls.map((path) => `${BASE_URL}${path}`);

function runA11yTest(url) {
  test(`a11y: ${url}`, async ({ page }) => {
    await page.goto(url, { waitUntil: 'networkidle' });

    const results = await new AxeBuilder({ page })
      .withTags(wcagTags)
      .analyze();

    // Log warnings for impacts not in failOnImpact — never fail on these
    const warnings = results.violations.filter((v) => !failOnImpact.includes(v.impact));
    if (warnings.length > 0) {
      console.warn(`\n⚠ Warnings on ${url} (not failing):`);
      warnings.forEach((v) => {
        console.warn(`  [${v.impact}] ${v.id}: ${v.description}`);
        v.nodes.forEach((n) => console.warn(`    → ${n.html}`));
      });
    }

    // Fail on impacts listed in failOnImpact
    const violations = results.violations.filter((v) => failOnImpact.includes(v.impact));
    if (violations.length > 0) {
      console.error(`\n✖ Violations on ${url}:`);
      violations.forEach((v) => {
        console.error(`  [${v.impact}] ${v.id}: ${v.description}`);
        console.error(`  Help: ${v.helpUrl}`);
        v.nodes.forEach((n) => console.error(`    → ${n.html}`));
      });
    }

    if (violations.length > 0) {
      throw new Error(`Found ${violations.length} a11y violation(s) with impact [${failOnImpact.join(', ')}] on ${url}`);
    }
  });
}

for (const url of testUrls) {
  runA11yTest(url);
}
