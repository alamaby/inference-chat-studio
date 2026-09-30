import hljs from "highlight.js";

/**
 * Helpers for fenced code-block rendering (Fase B).
 *
 * Pure functions (no DOM) so they are unit-testable. ReactMarkdown v9 no
 * longer tells `code` apart from inline code, so `MessageList` overrides
 * `pre` and uses these helpers to extract the language + highlighted HTML.
 */

export function parseCodeLanguage(className? : string | null): string | null {
  if (!className) {
    return null;
  }
  const match = /(?:^|\s)language-([\w+-]+)/.exec(className);
  return match ? match[1].toLowerCase() : null;
}

function escapeHtml(source : string): string {
  return source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function highlightCode(
  source : string,
  language : string | null
): { html : string; language : string } {
  const text = source.replace(/\n$/, "");
  if (language && hljs.getLanguage(language)) {
    try {
      return { html : hljs.highlight(text, { language }).value, language };
    } catch {
      // fall through to plaintext
    }
  }
  return { html : escapeHtml(text), language : "text" };
}
