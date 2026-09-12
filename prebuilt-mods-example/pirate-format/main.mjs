/*
 * Copyright 2026 DirazCoder
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// weekday names but pirate, thats it thats the mod
const PIRATE_DAYS = [
  'Sunday Arrr',
  "Moonday, cap'n",
  'Grog Day',
  'Middle o the Voyage',
  'Plank Day',
  'Freedom Friday, yarrr',
  'Landlubber Day',
];

export default {
  register(ctx) {
    // tried doin this as a createFormatter token first but turns out
    // that formatter never actually gets wired into the shared format()
    // path, mods just build a Formatter nobody calls lol. overrideFormat
    // is the only thing that actually reaches every format() call, so
    // thats what we do here instead, same as retro-format
    ctx.overrideFormat((original, value, formatStr, options) => {
      if (formatStr !== 'PIRATE') {
        return original(value, formatStr, options);
      }

      // ISO dayOfWeek is monday=1...sunday=7, %7 flips sunday to 0 so
      // it lines up with the array startin at sunday
      const idx = value.dayOfWeek % 7;
      return PIRATE_DAYS[idx];
    });
  },
};
