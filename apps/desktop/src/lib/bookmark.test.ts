import { describe, expect, it } from "vitest";
import { bookmarkLabel, normalizeAnchor } from "./bookmark";

describe("bookmarkLabel", () => {
  it("uses the first 20 characters with ellipsis", () => {
    expect(bookmarkLabel("jelaskan kenapa laut berwarna biru")).toBe("jelaskan kenapa laut…");
  });

  it("keeps short selections whole", () => {
    expect(bookmarkLabel("laut biru")).toBe("laut biru");
  });

  it("collapses whitespace before measuring", () => {
    expect(bookmarkLabel("a\n\n  b")).toBe("a b");
  });
});

describe("normalizeAnchor", () => {
  it("collapses whitespace runs", () => {
    expect(normalizeAnchor("a \n b\tc")).toBe("a b c");
  });
});
