import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMAT_ONLY_TOKENS,
  TOKEN_METADATA,
  analyzeFormat,
  fieldForToken,
  format,
  isValidFormat,
  listTokens,
  setTemporal,
  tokenInfo,
  tokenizeFormat,
  validateFormat,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// tokenizeFormat: exposed tokenizer.
test('tokenizeFormat: returns the same piece list the runtime uses', () => {
  const pieces = tokenizeFormat('yyyy-MM-dd');
  assert.equal(pieces.length, 5);
  assert.equal(pieces[0].kind, 'token');
  assert.equal(pieces[0].value, 'yyyy');
  assert.equal(pieces[1].kind, 'literal');
  assert.equal(pieces[1].value, '-');
});

// listTokens: every token in the table.
test('listTokens: returns one entry per token in TOKENS, with metadata', () => {
  const tokens = listTokens();
  // Spot-check a few expected entries — full coverage is in
  // tokenMetadata.test.js.
  const names = tokens.map((t) => t.name);
  assert.ok(names.includes('yyyy'));
  assert.ok(names.includes('MMMM'));
  assert.ok(names.includes('zzz'));
  assert.ok(names.includes('XXX'));
  assert.ok(names.includes('do'));
  // Every entry has metadata populated.
  for (const t of tokens) {
    assert.ok(t.metadata, `token ${t.name} has metadata`);
    assert.equal(typeof t.metadata.meaning, 'string');
  }
});

// tokenInfo: one token's metadata, or undefined for unknown.
test('tokenInfo: returns metadata for known tokens', () => {
  const info = tokenInfo('yyyy');
  assert.ok(info);
  assert.equal(info.meaning.slice(0, 15), 'Four-digit year');
  assert.equal(info.parseCapable, true);
  assert.equal(info.localeSensitive, false);
});

test('tokenInfo: returns undefined for unknown tokens', () => {
  assert.equal(tokenInfo('YYYY'), undefined); // YYYY is not a token in this library
  assert.equal(tokenInfo('notAToken'), undefined);
});

// isValidFormat / validateFormat
test('isValidFormat: true for valid format strings, false for malformed ones', () => {
  assert.equal(isValidFormat('yyyy-MM-dd'), true);
  assert.equal(isValidFormat("yyyy-MM-dd 'at' HH:mm"), true);
  assert.equal(isValidFormat("yyyy-MM-dd 'at"), false); // unterminated quote
  assert.equal(isValidFormat('x'.repeat(1001)), false); // too long
});

test('validateFormat: returns the analysis (same as analyzeFormat)', () => {
  const analysis = validateFormat('yyyy-MM-dd');
  assert.equal(analysis.tokens.length, 3);
  assert.equal(analysis.parseable, true);
  // validateFormat and analyzeFormat are the same function under different
  // names — the difference is purely semantic ("validate" implies the caller
  // expects it to throw on bad input, which analyzeFormat also does).
  assert.deepEqual(analysis, analyzeFormat('yyyy-MM-dd'));
});

// fieldForToken: which field does this token read off the input?
test('fieldForToken: returns the field each token requires', () => {
  assert.equal(fieldForToken('yyyy'), 'year');
  assert.equal(fieldForToken('HH'), 'hour');
  assert.equal(fieldForToken('zzz'), 'timeZoneId');
  assert.equal(fieldForToken('XXX'), 'offset');
  assert.equal(fieldForToken('notAToken'), undefined);
});

// TOKEN_METADATA: every token in the table has an entry. test that the
// table is in sync with TOKENS (the runtime table).
test('TOKEN_METADATA: every token in TOKENS has a metadata entry, and vice versa', () => {
  // We can't read TOKENS directly from here (it's not exported), but
  // listTokens() reads it, so we use that.
  const runtimeTokens = listTokens().map((t) => t.name);
  const metadataTokens = Object.keys(TOKEN_METADATA);
  runtimeTokens.sort();
  metadataTokens.sort();
  assert.deepEqual(runtimeTokens, metadataTokens);
});

test('FORMAT_ONLY_TOKENS: contains the format-only tokens', () => {
  // do, ww, RRRR + D, DD, DDD + LLLL, LLL, cccc, ccc, GGGG, G, zzzz, z
  assert.equal(FORMAT_ONLY_TOKENS.size, 14);
  for (const t of ['do', 'ww', 'RRRR', 'D', 'DD', 'DDD', 'LLLL', 'LLL', 'cccc', 'ccc', 'GGGG', 'G', 'zzzz', 'z']) {
    assert.ok(FORMAT_ONLY_TOKENS.has(t), `missing ${t}`);
  }
});
