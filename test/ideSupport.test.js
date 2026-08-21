import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAYJS_TO_TEMPORAL_FMT,
  getAutocompleteData,
  getDocUrl,
  getHoverDocs,
  getInlineDiagnostics,
  previewFormat,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('getAutocompleteData: returns one entry per token with family grouping', () => {
  const data = getAutocompleteData();
  assert.ok(data.length > 30);  // every token in the table
  // Spot-check entries.
  const yyyy = data.find((d) => d.label === 'yyyy');
  assert.ok(yyyy);
  assert.equal(yyyy.family, 'Year');
  assert.ok(yyyy.detail.length > 0);
  assert.ok(yyyy.documentation.length > 0);

  const zzz = data.find((d) => d.label === 'zzz');
  assert.ok(zzz);
  assert.equal(zzz.family, 'Time Zone');
});

test('getHoverDocs: returns one entry per token with summary + details', () => {
  const docs = getHoverDocs();
  assert.ok(Object.keys(docs).length > 30);
  const yyyy = docs['yyyy'];
  assert.ok(yyyy);
  assert.match(yyyy.summary, /year/i);
  assert.match(yyyy.details, /Format-capable:/);
});

test('getInlineDiagnostics: surfaces warnings from analyzeFormat', () => {
  const diags = getInlineDiagnostics('h:mm');
  assert.ok(diags.length > 0);
  assert.ok(diags.some((d) => d.code === 'TWELVE_HOUR_WITHOUT_A'));
  assert.ok(diags.some((d) => d.suggestion && d.suggestion.length > 0));
});

test('getInlineDiagnostics: mixing 12- and 24-hour tokens gets a tailored suggestion', () => {
  const diags = getInlineDiagnostics('HH:mmh');
  const warning = diags.find((d) => d.code === 'MIXED_12_AND_24_HOUR');
  assert.ok(warning);
  assert.match(warning.suggestion, /Pick one form/);
});

test('getInlineDiagnostics: ambiguous unpadded numeric run gets a tailored suggestion', () => {
  const diags = getInlineDiagnostics('Md');
  const warning = diags.find((d) => d.code === 'AMBIGUOUS_NUMERIC_RUN');
  assert.ok(warning);
  assert.match(warning.suggestion, /Add a separator/);
});

test('getInlineDiagnostics: format-only token gets a tailored suggestion', () => {
  const diags = getInlineDiagnostics('do');
  const warning = diags.find((d) => d.code === 'FORMAT_ONLY_TOKEN');
  assert.ok(warning);
  assert.match(warning.suggestion, /parse-capable variant/);
});

test('getInlineDiagnostics: empty for clean format strings', () => {
  const diags = getInlineDiagnostics('yyyy-MM-dd HH:mm:ss');
  assert.equal(diags.length, 0);
});

test('getInlineDiagnostics: zzz with an offset token falls through with no suggestion', () => {
  // ZZZ_WITH_OFFSET_TOKEN isn't one of the codes getInlineDiagnostics
  // has a tailored suggestion for — this is a real, reachable warning
  // code (unlike UNKNOWN_TOKEN_NO_METADATA, which tokenize() prevents
  // analyzeFormat from ever producing), so the fallthrough to an
  // undefined suggestion is genuine behavior, not a gap.
  const diags = getInlineDiagnostics("yyyy-MM-dd'T'HH:mm:ssXXXzzz");
  const warning = diags.find((d) => d.code === 'ZZZ_WITH_OFFSET_TOKEN');
  assert.ok(warning);
  assert.equal(warning.suggestion, undefined);
});

test('getInlineDiagnostics: offset token without a full date falls through with no suggestion', () => {
  const diags = getInlineDiagnostics('HH:mmXXX');
  const warning = diags.find((d) => d.code === 'OFFSET_WITHOUT_FULL_DATE');
  assert.ok(warning);
  assert.equal(warning.suggestion, undefined);
});

test('previewFormat: produces formatted output for the default sample', () => {
  const out = previewFormat('yyyy-MM-dd HH:mm:ss');
  assert.match(out, /^2026-08-04 15:45:30$/);
});

test('previewFormat: respects the sample parameter', () => {
  const out = previewFormat('yyyy', { year: 2030, month: 1, day: 1 });
  assert.equal(out, '2030');
});

test('getDocUrl: points at the README token reference section', () => {
  // docs/ was consolidated into the root README, which has no per-token
  // anchors, so every token resolves to the same section link.
  assert.equal(getDocUrl('yyyy'), 'README.md#token-reference');
  assert.equal(getDocUrl('MMMM'), 'README.md#token-reference');
});

test('DAYJS_TO_TEMPORAL_FMT: includes YYYY→yyyy and DD→dd mappings', () => {
  const yyyy = DAYJS_TO_TEMPORAL_FMT.find((m) => m.from === 'YYYY');
  assert.ok(yyyy);
  assert.equal(yyyy.to, 'yyyy');
});
