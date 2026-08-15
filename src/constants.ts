// format strings are short hand-written literals ("yyyy-MM-dd")
// cap the length so a bug or bad input can't make tokenize() do unbounded work
export const MAX_FORMAT_LENGTH = 1000;
export const MAX_INPUT_LENGTH = 100_000;