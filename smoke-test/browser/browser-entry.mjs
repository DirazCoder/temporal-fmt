import { Temporal } from 'temporal-polyfill/full';
import * as temporalFmt from '../../dist/index.js';

temporalFmt.setTemporal(Temporal);
globalThis.temporalFmtBrowserSmoke = { Temporal, ...temporalFmt };
