/**
 * Pure keyboard-shortcut matcher (no DOM) so it can be unit-tested.
 * Ctrl+K works globally (palette); Ctrl+N / Ctrl+B are suppressed
 * inside editable targets to avoid hijacking typing.
 */
export type ShortcutAction = "new-conversation" | "bookmark-from-selection" | "toggle-palette";

export interface ShortcutParams {
  key : string;
  ctrlKey : boolean;
  metaKey : boolean;
  /** e.target tag name uppercased, e.g. "INPUT", "TEXTAREA", "DIV" */
  targetTag : string;
  isContentEditable : boolean;
}

function isEditable(tag : string, editable : boolean): boolean {
  return editable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function matchShortcut(p : ShortcutParams): ShortcutAction | null {
  if (!p.ctrlKey && !p.metaKey) {
    return null;
  }
  const k = p.key.toLowerCase();
  if (k === "k") {
    return "toggle-palette";
  }
  if (k === "n") {
    return isEditable(p.targetTag, p.isContentEditable) ? null : "new-conversation";
  }
  if (k === "b") {
    return isEditable(p.targetTag, p.isContentEditable) ? null : "bookmark-from-selection";
  }
  return null;
}
