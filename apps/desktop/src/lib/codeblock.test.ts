import { describe, expect, it } from "vitest";
import { highlightCode, parseCodeLanguage } from "./codeblock";

describe("parseCodeLanguage", () => {
  it("extracts the language from ReactMarkdown code class names", () => {
    expect(parseCodeLanguage("language-python")).toBe("python");
    expect(parseCodeLanguage("foo language-rust bar")).toBe("rust");
  });

  it("returns null when there is no language", () => {
    expect(parseCodeLanguage(undefined)).toBeNull();
    expect(parseCodeLanguage("")).toBeNull();
    expect(parseCodeLanguage("no-language-here")).toBeNull();
  });
});

describe("highlightCode", () => {
  it("highlights known languages with hljs spans", () => {
    const { html, language } = highlightCode("const x = 1;", "javascript");
    expect(language).toBe("javascript");
    expect(html).toContain("hljs-");
    expect(html).not.toContain("const x = 1;");
  });

  it("falls back to escaped plaintext for unknown languages", () => {
    const { html, language } = highlightCode("<b>hi</b>", "not-a-lang");
    expect(language).toBe("text");
    expect(html).toBe("&lt;b&gt;hi&lt;/b&gt;");
  });

  it("strips the trailing newline ReactMarkdown appends", () => {
    const { html } = highlightCode("x = 1\n", null);
    expect(html).toBe("x = 1");
  });
});
