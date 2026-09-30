/**
 * Bookmark helpers (pure, unit-tested).
 *
 * A bookmark anchors to `{ message_id, anchor_text }`. The label is the
 * first 20 characters of the selected text, whitespace-collapsed, with an
 * ellipsis when truncated.
 */

export const BOOKMARK_LABEL_LEN = 20;

export function bookmarkLabel(selectionText : string): string {
  const flat = selectionText.replace(/\s+/g, " ").trim();
  if (flat.length <= BOOKMARK_LABEL_LEN) {
    return flat;
  }
  return `${flat.slice(0, BOOKMARK_LABEL_LEN)}…`;
}

/** Normalize text the same way the DOM locator does (for tests/symmetry). */
export function normalizeAnchor(text : string): string {
  return text.replace(/\s+/g, " ").trim();
}
