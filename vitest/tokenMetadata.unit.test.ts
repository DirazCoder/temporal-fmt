import { describe, expect, it } from 'vitest';
import { TOKEN_METADATA, ALL_TOKEN_NAMES } from '../src/tokenMetadata.js';

describe('TOKEN_METADATA', () => {
  it('lists every name in ALL_TOKEN_NAMES as a real entry', () => {
    expect(ALL_TOKEN_NAMES.length).toBeGreaterThan(0);
    for (const name of ALL_TOKEN_NAMES) {
      expect(TOKEN_METADATA[name]).toBeDefined();
    }
  });

  it('describes yyyy as a calendar-sensitive, round-trip-safe year token', () => {
    const meta = TOKEN_METADATA.yyyy;
    expect(meta.formatCapable).toBe(true);
    expect(meta.parseCapable).toBe(true);
    expect(meta.calendarSensitive).toBe(true);
    expect(meta.roundTripSafe).toBe(true);
  });
});
