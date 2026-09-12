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

// digit -> leet letter, only doin the ones that actually look right
const LEET_MAP = { 0: 'O', 1: 'I', 3: 'E', 4: 'A', 5: 'S', 7: 'T' };

function toLeet(numStr) {
  return numStr
    .split('')
    .map((ch) => LEET_MAP[ch] ?? ch)
    .join('');
}

export default {
  register(ctx) {
    // same deal as pirate-format, createFormatter tokens dont actually
    // reach format() from outside the mod so we gotta override instead
    ctx.overrideFormat((original, value, formatStr, options) => {
      if (formatStr !== 'LEET') {
        return original(value, formatStr, options);
      }

      return toLeet(String(value.year));
    });
  },
};
