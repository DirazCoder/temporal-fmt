// The duration subpath. formatDuration() lives in format/formatDuration.ts
// (it shares the format machinery), while the rest of the duration API —
// parseDuration, balanceDuration, ISO 8601 helpers, arithmetic — lives in
// ops/duration.ts. The README documents `import { formatDuration } from
// 'temporal-fmt/duration'`, so the subpath has to carry both halves.
export { formatDuration } from './format/formatDuration.js';
export type { DurationFormatOptions } from './format/formatDuration.js';
export * from './ops/duration.js';
