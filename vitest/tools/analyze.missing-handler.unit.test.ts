import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/format/format.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/format/format.js')>();
  return { ...actual, _handlerFor: () => undefined };
});

import { analyzeFormat } from '../../src/tools/analyze.js';

describe('analyzeFormat: missing-handler fallback', () => {
  it('degrades gracefully when a token has no format handler', () => {
    const analysis = analyzeFormat('yyyy-MM-dd');
    expect(analysis.tokens.map((token) => token.name)).toEqual(['yyyy', 'MM', 'dd']);
    expect(analysis.requiredFields).toEqual([]);
    expect(analysis.compatibleTypes).toEqual(['PlainDate', 'PlainDateTime', 'ZonedDateTime']);
  });
});
