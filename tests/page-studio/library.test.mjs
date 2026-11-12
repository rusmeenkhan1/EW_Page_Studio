#!/usr/bin/env node
/**
 * library.test.mjs — the block library's rules without a browser (node:test): `*`, `@group`
 * and `-name` in a `blocks` cell, the site file under the sheet, and Check setup's findings.
 *
 *   node --test tests/page-studio/library.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLibrary, resolveBlocks, valuesCell, contentNames,
} from '../../tools/page-studio/shared/library.js';
import { checkSetup } from '../../tools/page-studio/shared/check.js';
import { settingProblem } from '../../tools/page-studio/shared/config.js';

const tab = (rows) => ({ total: rows.length, data: rows });
const sheet = ({ data = [], options = [], groups = [] }) => ({
  data: tab(data), options: tab(options), groups: tab(groups), ':type': 'multi-sheet',
});
const block = (name) => ({ name: name[0].toUpperCase() + name.slice(1), path: `/.da/library/blocks/${name}` });
const row = (cells) => ({
  key: '', blocks: '', values: '', type: '', label: '', when: '', description: '', ...cells,
});

test('a blocks cell: names, *, @group, -name', () => {
  const all = ['cards', 'hero', 'video', 'section-metadata'];
  const groups = { media: ['video', 'hero'] };
  assert.deepEqual([...resolveBlocks('cards, Hero', all, groups)], ['cards', 'hero']);
  assert.deepEqual([...resolveBlocks('*', all, groups)], ['cards', 'hero', 'video']);
  assert.deepEqual([...resolveBlocks('*, -hero', all, groups)], ['cards', 'video']);
  assert.deepEqual([...resolveBlocks('@media', all, groups)], ['video', 'hero']);
  assert.deepEqual([...resolveBlocks('*, -@media', all, groups)], ['cards']);
  const missing = [];
  resolveBlocks('@nope', all, groups, (t) => missing.push(t));
  assert.deepEqual(missing, ['@nope']);
});

test('without a site file, rows are the sheet rows as before', () => {
  const lib = buildLibrary(sheet({
    data: [block('cards'), block('hero')],
    options: [
      row({ key: 'variant', blocks: 'cards', type: 'variant', values: 'Grid=grid | News=news' }),
      row({ key: 'visibility', blocks: '*', type: 'variants', values: 'Hide on mobile=hide-mobile' }),
      row({ key: 'content', blocks: 'cards', type: 'content', values: 'item=Card' }),
    ],
  }));
  assert.deepEqual(lib.entries.map((b) => b.name), ['cards', 'hero']);
  assert.deepEqual(lib.rowsFor('cards').map((r) => r.key), ['variant', 'visibility', 'content']);
  assert.deepEqual(lib.rowsFor('hero').map((r) => r.key), ['visibility']);
  assert.deepEqual(lib.rowsFor('section-metadata'), []);
  assert.deepEqual(contentNames(lib.rowsFor('cards')), { item: 'Card' });
});

test('the sheet over the site file: filled cells win, hidden takes out, others add', () => {
  const site = {
    version: 1,
    blocks: {
      cards: {
        options: [
          { key: 'layout', type: 'variant', values: { 'two-up': 'Two', 'three-up': 'Three' } },
          { key: 'shadow', type: 'variants', values: ['shadow'] },
        ],
        content: { image: 'Card image' },
      },
      teaser: { label: 'Teaser', options: [{ key: 'size', type: 'variant', values: 'S=s | L=l' }] },
    },
  };
  const lib = buildLibrary(sheet({
    data: [block('cards')],
    options: [
      row({ key: 'layout', blocks: 'cards', label: 'Cards per row' }),
      row({ key: 'shadow', blocks: 'cards', type: 'hidden' }),
      row({ key: 'theme', blocks: 'cards', type: 'variant', values: 'Dark=dark' }),
    ],
  }), site);
  assert.deepEqual(lib.entries.map((b) => [b.name, b.label]), [['cards', 'Cards'], ['teaser', 'Teaser']]);
  const cards = lib.rowsFor('cards');
  assert.deepEqual(cards.map((r) => [r.key, r.source]), [['layout', 'code'], ['content', 'code'], ['theme', 'sheet']]);
  assert.equal(cards[0].label, 'Cards per row');
  assert.equal(cards[0].values, 'Two=two-up | Three=three-up');
  assert.equal(cards[0].type, 'variant');
  assert.deepEqual(contentNames(cards), { image: 'Card image' });
  assert.equal(lib.rowsFor('teaser')[0].values, 'S=s | L=l');
});

test('valuesCell: string, object, list', () => {
  assert.equal(valuesCell('A=a | b'), 'A=a | b');
  assert.equal(valuesCell({ a: 'A', b: 'b' }), 'A=a | b');
  assert.equal(valuesCell(['a', { value: 'b', label: 'B' }]), 'a | B=b');
  assert.equal(valuesCell(null), '');
});

test('Check setup finds what can not work', () => {
  const findings = checkSetup({
    settingProblem,
    settingsRows: [
      { key: 'buton-options', value: 'yes' },
      { key: 'send-timeout-ms', value: 'soon' },
      { key: 'button-options', value: 'yes' },
    ],
    site: { status: 'ok', url: 'x', data: { version: 1, capabilities: { 'button-options': false }, blocks: { cards: { options: [{ key: 'layout', type: 'variant', values: { 'two-up': 'Two' } }] } } } },
    library: sheet({
      data: [block('cards'), block('cards')],
      options: [
        row({ key: 'layout', blocks: 'cards', type: 'variant', values: 'Two=two-up | Six=six-up' }),
        row({ key: 'style', blocks: 'cardz, @nope', type: 'variant', values: 'A=a' }),
        row({ key: 'bio', blocks: 'cards', type: 'variants', values: 'Bio=bio', when: 'profile' }),
        row({ key: 'tint', blocks: 'cards', type: 'colour', values: 'Blue=blue' }),
        row({ key: 'empty', blocks: 'cards', type: 'variant' }),
        row({ key: 'odd', blocks: 'cards', type: 'dropdown', values: 'x' }),
      ],
    }),
  });
  const codes = findings.map((f) => f.code);
  [
    'setting-unknown', 'setting-value', 'capability-conflict', 'block-duplicate', 'option-unknown-block',
    'option-unknown-group', 'option-when', 'option-colour', 'option-no-values', 'option-type',
    'option-not-in-code',
  ].forEach((code) => assert.ok(codes.includes(code), `${code} expected in ${codes.join(', ')}`));
  assert.equal(findings[0].level, 'error'); // errors first
  assert.match(findings.find((f) => f.code === 'option-not-in-code').text, /six-up/);
});

test('Check setup is quiet on a good setup', () => {
  const findings = checkSetup({
    settingProblem,
    settingsRows: [{ key: 'button-icons', value: 'text' }],
    site: { status: 'ok', url: 'x', data: { version: 1, capabilities: { 'button-icons': 'text' } } },
    library: sheet({
      data: [block('cards')],
      options: [row({ key: 'layout', blocks: '*', type: 'variant', values: 'Two=two-up' })],
    }),
    css: { cards: '.cards.two-up > ul { display: grid; }' },
  });
  assert.deepEqual(findings, []);
});
