import { describe, expect, it } from "vitest";
import { matchShortcut } from "./shortcuts";

describe("matchShortcut", () => {
  it("matches Ctrl+N outside inputs", () => {
    expect(matchShortcut({ key : "n", ctrlKey : true, metaKey : false, targetTag : "DIV", isContentEditable : false })).toBe("new-conversation");
  });

  it("ignores Ctrl+N inside textarea", () => {
    expect(matchShortcut({ key : "N", ctrlKey : true, metaKey : false, targetTag : "TEXTAREA", isContentEditable : false })).toBeNull();
  });

  it("matches Ctrl+B outside inputs", () => {
    expect(matchShortcut({ key : "b", ctrlKey : true, metaKey : false, targetTag : "DIV", isContentEditable : false })).toBe("bookmark-from-selection");
  });

  it("ignores Ctrl+B inside input", () => {
    expect(matchShortcut({ key : "b", ctrlKey : true, metaKey : false, targetTag : "INPUT", isContentEditable : false })).toBeNull();
  });

  it("matches Ctrl+K even inside inputs", () => {
    expect(matchShortcut({ key : "k", ctrlKey : true, metaKey : false, targetTag : "TEXTAREA", isContentEditable : false })).toBe("toggle-palette");
  });

  it("supports Meta key and uppercase", () => {
    expect(matchShortcut({ key : "N", ctrlKey : false, metaKey : true, targetTag : "DIV", isContentEditable : false })).toBe("new-conversation");
  });

  it("ignores plain keys without modifier", () => {
    expect(matchShortcut({ key : "n", ctrlKey : false, metaKey : false, targetTag : "DIV", isContentEditable : false })).toBeNull();
  });

  it("returns null for unrelated keys", () => {
    expect(matchShortcut({ key : "x", ctrlKey : true, metaKey : false, targetTag : "DIV", isContentEditable : false })).toBeNull();
  });
});
