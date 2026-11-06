#!/usr/bin/env node
/*
 * Claude Code PostToolUse hook — guards the `@boilerplate` migration markers on CSS edits.
 *
 * Every line of the boilerplate's CSS ships with a trailing `/* @boilerplate *​/` marker meaning
 * "still the untouched starting point — not yet resolved against the customer". The markers are
 * transient scaffolding: as the customer's styling is applied, each line is either rewritten or
 * consciously kept, and EITHER WAY its marker is deleted. When no markers remain, migration is done.
 *
 * This hook enforces the one thing that is mechanically detectable: when you EDIT a line, its
 * marker must be gone. A line you just changed is no longer "untouched boilerplate", so keeping
 * the marker is a mistake. It compares the edit's before/after text and flags any changed (or new)
 * line that still carries a marker. (Consciously-kept lines are a human judgement the hook can't
 * see — deleting their marker stays manual.)
 *
 * MODE GATE — this enforcement is for CUSTOMER MIGRATIONS, not for authoring the boilerplate
 * itself. We detect the source repo by its git origin: in `aemdemos/ise-boilerplate` an edit that
 * keeps its marker is legitimate (tokenizing, tuning a default — the value is still boilerplate),
 * so the hook stays silent. In any other repo (a customer clone) it runs normally.
 *
 * Reads the PostToolUse JSON payload on stdin; exits 0 (silent) when clean, 2 (surfaced to the
 * agent) when an edited line kept its marker. Whole-file writes (no before-text) are not diffed.
 * Never blocks on its own errors.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

let payload = {};
try { payload = JSON.parse(readStdin() || '{}'); } catch { process.exit(0); }

const input = payload?.tool_input ?? {};
const filePath = input.file_path;
if (!filePath || !filePath.endsWith('.css')) process.exit(0);
if (!/(?:^|\/)(?:styles|blocks)\//.test(filePath)) process.exit(0);

// Mode gate: silent when authoring the source boilerplate itself (origin = aemdemos/ise-boilerplate),
// active in any other repo (a customer migration). Unknown/no origin → treat as migration (enforce).
function isSourceBoilerplate(cwd) {
  try {
    const url = execSync('git config --get remote.origin.url', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return /[:/]aemdemos\/ise-boilerplate(?:\.git)?$/i.test(url);
  } catch { return false; }
}
if (isSourceBoilerplate(payload?.cwd || process.cwd())) process.exit(0);

// Collect before/after pairs: Edit → one pair; MultiEdit → many; Write → none (can't diff).
const pairs = [];
if (Array.isArray(input.edits)) {
  input.edits.forEach((e) => pairs.push([e.old_string ?? '', e.new_string ?? '']));
} else if (typeof input.old_string === 'string') {
  pairs.push([input.old_string, input.new_string ?? '']);
}
if (pairs.length === 0) process.exit(0);

// A real marker is the comment token `/* @boilerplate … */`, not the bare word in prose.
const MARKER = /\/\*\s*@boilerplate\b/;
const offenders = new Set();
for (const [before, after] of pairs) {
  const beforeLines = new Set(before.split('\n').map((l) => l.trim()));
  after.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('/*')) return; // block-comment prose, not a rule line
    if (!MARKER.test(line)) return;         // edited/new line dropped its marker — good
    if (beforeLines.has(trimmed)) return;   // unchanged context line — leave it
    offenders.add(trimmed);                 // changed/new rule line that kept the marker
  });
}

if (offenders.size === 0) process.exit(0);

const rel = filePath.replace(`${process.cwd()}/`, '');
const report = [
  `@boilerplate marker check — ${rel}:`,
  'You edited these line(s) but left the /* @boilerplate */ marker:',
  ...[...offenders].map((l) => `  ${l}`),
  '',
  'A marker means the line is still untouched boilerplate. Once you change a line (or confirm it',
  'already suits the customer), DELETE its /* @boilerplate */ marker — do not flip or keep it.',
].join('\n');
process.stderr.write(`${report}\n`);
process.exit(2);
