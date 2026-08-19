// Probe: do the published .d.ts files actually resolve and typecheck
// against a real installed copy? attw checks the exports map shape
// statically; this runs tsc against it for real, catching anything
// attw's shape check wouldn't (e.g. a type that resolves to the wrong
// file, or resolves but doesn't typecheck the way the source does).
import { format, parse, setTemporal } from 'temporal-fmt';
import type { TemporalNamespace } from 'temporal-fmt';
import { Temporal } from 'temporal-polyfill/full';

// temporal-polyfill's PlainDate.from() etc. take a narrower PlainDateLike
// than TemporalNamespace's intentionally loose Record<string, ...> shape
// (see temporalProvider.ts) — same relationship native Temporal has to it.
// A real consumer hits this too; the cast here is what they'd write.
setTemporal(Temporal as unknown as TemporalNamespace);

const date = Temporal.PlainDate.from('2026-08-04');
const out: string = format(date, 'yyyy-MM-dd');
const parsed = parse('yyyy-MM-dd', '2026-08-04');

void out;
void parsed;
