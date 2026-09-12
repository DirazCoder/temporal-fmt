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

export default {
  register(ctx) {
    ctx.overrideFormat((original, value, formatStr, options) => {
      // only hijacking one made up format string, everything else goes
      // straight to original so we dont break literally anything else
      if (formatStr !== 'RETRO') {
        return original(value, formatStr, options);
      }

      const hh = String(value.hour).padStart(2, '0');
      const mm = String(value.minute).padStart(2, '0');
      const ss = String(value.second).padStart(2, '0');

      // blinking colon vibe, cant actually blink in a string but the
      // dots sell it lol
      return `[ ${hh}:${mm}:${ss} ]·.·:*:·.·`;
    });
  },
};
