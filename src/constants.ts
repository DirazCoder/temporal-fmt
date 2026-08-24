// format strings are basically always short hand-written stuff like "yyyy-MM-dd"
// so if something's way longer than that, cap it before tokenize() chokes on it
export const MAX_FORMAT_LENGTH = 1000;
export const MAX_INPUT_LENGTH = 100_000;