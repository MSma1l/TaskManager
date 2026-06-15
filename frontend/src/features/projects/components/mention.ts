/**
 * Pure helpers for the `@mention` autocomplete in the task comment composer.
 * Extracted from `TaskDetailDrawer` so the token logic is unit-testable.
 */

export interface MentionToken {
  /** The text typed after `@` (may be empty right after typing `@`). */
  query: string;
  /** Index of the `@` character in the source string. */
  start: number;
}

/**
 * Detect a `@word` token that ends exactly at `caret`.
 *
 * The `@` must be at the start of the string or preceded by whitespace, so it
 * does not trigger inside emails or mid-word. Returns `null` when there is no
 * active mention token directly before the caret.
 */
export function detectMention(value: string, caret: number): MentionToken | null {
  const upto = value.slice(0, caret);
  const match = /(?:^|\s)@(\w*)$/.exec(upto);
  if (!match) return null;
  return {
    query: match[1],
    // The `@` sits right after the (optional) leading whitespace the regex matched.
    start: match.index + match[0].indexOf('@'),
  };
}

/**
 * Replace the active `@word` token before `caret` with `@username ` (note the
 * trailing space). Returns the new full text and the caret position to place
 * after the inserted mention.
 */
export function insertMention(
  value: string,
  caret: number,
  username: string,
): { text: string; caret: number } {
  const before = value.slice(0, caret).replace(/@(\w*)$/, `@${username} `);
  const after = value.slice(caret);
  return { text: before + after, caret: before.length };
}
