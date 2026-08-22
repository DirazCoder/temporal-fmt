// One-off triage tool for the errors.ts migration. Finds every
// `throw new Error(...)` / `throw new RangeError(...)` in parse.ts,
// pulls out the line number and enough source context to read the
// message, and runs the message through the same classification logic
// wrapUntypedError() uses — so each site can be checked against what
// safeParse() would already produce for that message before deciding
// whether a direct typed throw agrees or needs to override the class.
//
// This does NOT edit parse.ts. It only prints a table to eyeball and
// use as a migration checklist. Message extraction is line-based, not a
// real parser, so multi-line template literals show as truncated —
// that's fine for triage, the actual migration reads full context via
// the normal file view.

import { readFileSync } from 'node:fs';

const SRC = new URL('../src/parse.ts', import.meta.url);
const lines = readFileSync(SRC, 'utf8').split('\n');

// Mirrors wrapUntypedError's branches in errors.ts, in the same order,
// so classify() agrees with what safeParse() actually does today.
function classify(msg) {
  if (/unknown token|isn't a recognized token/.test(msg)) return 'UNKNOWN_TOKEN';
  if (/ambiguous/i.test(msg)) return 'AMBIGUOUS_INPUT';
  if (/offset/.test(msg) && /out of range|exceeds|doesn't match the shape/i.test(msg)) return 'INVALID_OFFSET';
  if (/no valid pattern matches/i.test(msg)) return 'PARSE_MISMATCH';
  if (/doesn't describe a valid date\/time|incomplete date|weekday token|quarter token/.test(msg)) return 'INVALID_DATE';
  const lowerMsg = msg.toLowerCase();
  const mentionsLocale = lowerMsg.includes('locale');
  if ((mentionsLocale && (lowerMsg.includes('produced no') || lowerMsg.includes('not a valid'))) || lowerMsg.includes('cutoffs must be')) {
    return 'INVALID_LOCALE';
  }
  if (/format string exceeds maximum length|input exceeds maximum length|unterminated quote|isn't a recognized token/i.test(msg)) return 'FORMAT_SYNTAX_ERROR';
  return 'PARSE_MISMATCH (fallback — no branch matched)';
}

const sites = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(/throw new (Error|RangeError)\(/);
  if (!m) continue;

  // Grab this line plus the next few, until we hit a line ending the
  // statement (");" at same or lower indent) — good enough for triage
  // since every throw here is either one line or a short template
  // literal concatenation.
  let context = line;
  let j = i;
  while (!/\);\s*$/.test(context) && j < i + 6 && j < lines.length - 1) {
    j += 1;
    context += '\n' + lines[j];
  }

  sites.push({
    line: i + 1,
    ctor: m[1],
    context,
  });
  i = j; // skip past what we consumed
}

console.log(`Found ${sites.length} throw sites in parse.ts\n`);
for (const site of sites) {
  // crude message extraction: strip the throw-new wrapper, collapse
  // whitespace, just for classification — not meant to be exact source.
  const flatMsg = site.context
    .replace(/throw new (Error|RangeError)\(/, '')
    .replace(/\);?\s*$/, '')
    .replace(/`/g, '')
    .replace(/\$\{[^}]*\}/g, '<x>')
    .replace(/\s+/g, ' ')
    .trim();
  const code = classify(flatMsg);
  console.log(`--- line ${site.line} [${site.ctor}] -> ${code}`);
  console.log(flatMsg.slice(0, 160));
  console.log();
}
