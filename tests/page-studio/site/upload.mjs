#!/usr/bin/env node
/**
 * upload.mjs — puts the Page Studio test site (./da) into a DA site, or checks that DA holds it.
 *
 *   node tests/page-studio/site/upload.mjs --check            compare DA with ./da (reads only)
 *   node tests/page-studio/site/upload.mjs --upload           write every file of ./da to DA
 *   node tests/page-studio/site/upload.mjs --upload --config  ... and the site's DA config (config.json)
 *
 * Writes DA source only: nothing is previewed or published. Images go first, so no document points
 * at a missing one. SITE=<org>/<site> picks the DA site (default rusmeenkhan1/ew-page-studio); the
 * documents' image addresses name that site, so another site needs them rewritten first. DA_TOKEN
 * (an IMS access token, never committed) is sent as the Authorization header when set.
 */
/* eslint-disable no-console -- a command-line report */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'da');
const SITE = process.env.SITE || 'rusmeenkhan1/ew-page-studio';
const SOURCE = `https://admin.da.live/source/${SITE}`;
const CONFIG = `https://admin.da.live/config/${SITE}/`;
const TYPES = {
  '.html': 'text/html', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png',
};
const headers = process.env.DA_TOKEN ? { Authorization: `Bearer ${process.env.DA_TOKEN}` } : {};
const args = new Set(process.argv.slice(2));

/** Every file under ./da, images first, as [DA path, local file]. */
function files(dir = ROOT) {
  const all = readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [[path.slice(ROOT.length), path]];
  });
  const image = ([path]) => (['.jpg', '.png'].includes(extname(path)) ? 0 : 1);
  return all.filter(([path]) => TYPES[extname(path)]).sort((a, b) => image(a) - image(b) || a[0].localeCompare(b[0]));
}

const squash = (html) => html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

/** Does DA hold the same as the local file? (HTML compared without layout whitespace.) */
async function same(path, local) {
  const resp = await fetch(`${SOURCE}${path}`, { headers });
  if (!resp.ok) return `HTTP ${resp.status}`;
  const body = Buffer.from(await resp.arrayBuffer());
  const mine = readFileSync(local);
  const ext = extname(path);
  if (ext === '.json') {
    return JSON.stringify(JSON.parse(body)) === JSON.stringify(JSON.parse(mine)) ? '' : 'differs';
  }
  if (ext === '.html') return squash(body.toString()) === squash(mine.toString()) ? '' : 'differs';
  return body.equals(mine) ? '' : 'differs';
}

async function upload(path, local) {
  const form = new FormData();
  form.append('data', new Blob([readFileSync(local)], { type: TYPES[extname(path)] }), path.split('/').pop());
  const resp = await fetch(`${SOURCE}${path}`, { method: 'POST', body: form, headers });
  return resp.ok ? '' : `HTTP ${resp.status}`;
}

if (!args.has('--check') && !args.has('--upload')) {
  console.log('Use --check (compare) or --upload [--config]. See the comment at the top.');
  process.exit(1);
}
let problems = 0;
for (const [path, local] of files()) {
  // one at a time: DA is not hurried, and the report stays in order
  // eslint-disable-next-line no-await-in-loop
  const problem = args.has('--upload') ? await upload(path, local) : await same(path, local);
  if (problem) problems += 1;
  console.log(`${problem ? '✗' : '✓'} ${path}${problem ? `  ${problem}` : ''}`);
}
if (args.has('--config')) {
  const form = new FormData();
  form.append('config', readFileSync(join(HERE, 'config.json'), 'utf8'));
  const resp = await fetch(CONFIG, { method: 'POST', body: form, headers });
  if (!resp.ok) problems += 1;
  console.log(`${resp.ok ? '✓' : '✗'} DA config of ${SITE}${resp.ok ? '' : `  HTTP ${resp.status}`}`);
}
console.log(problems ? `${problems} problem(s)` : 'all done');
process.exit(problems ? 1 : 0);
