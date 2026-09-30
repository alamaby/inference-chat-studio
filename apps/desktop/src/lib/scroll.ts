import { normalizeAnchor } from "./bookmark";

interface TextPos {
  node : Text;
  offset : number;
}

/**
 * Locate `anchor` inside `container` (whitespace-insensitive), scroll it
 * into view, and flash a temporary highlight.
 *
 * Returns true when the anchor text itself was highlighted; false when only
 * the container was scrolled (anchor not found — e.g. re-rendered markdown).
 * The `<mark>` is removed after ~1.6s and never enters React state, so it
 * cannot corrupt reconciliation as long as callers clean up on unmount
 * (each call removes any previous mark it created first).
 */
export function locateAndFlash(container : HTMLElement, anchor : string): boolean {
  container.querySelectorAll("mark.bookmark-flash").forEach((m) => {
    m.replaceWith(document.createTextNode(m.textContent ?? ""));
  });

  const needle = normalizeAnchor(anchor);
  let precise = false;
  if (needle) {
    const range = findRange(container, needle);
    if (range) {
      try {
        const mark = document.createElement("mark");
        mark.className = "bookmark-flash";
        range.surroundContents(mark);
        mark.scrollIntoView({ block : "center", behavior : "smooth" });
        precise = true;
        window.setTimeout(() => {
          mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
        }, 1600);
      } catch {
        precise = false;
      }
    }
  }
  if (!precise) {
    container.scrollIntoView({ block : "center", behavior : "smooth" });
    container.classList.add("bookmark-container-flash");
    window.setTimeout(() => container.classList.remove("bookmark-container-flash"), 1600);
  }
  return precise;
}

/** Find a Range for `needle` over whitespace-collapsed text nodes. */
function findRange(container : HTMLElement, needle : string): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  // Collapsed text with a position map back into (node, offset).
  const chars: string[] = [];
  const map: TextPos[] = [];
  for (const n of nodes) {
    const data = n.data;
    for (let i = 0; i < data.length; i++) {
      if (/\s/.test(data[i] ?? "")) {
        if (chars.length > 0 && chars[chars.length - 1] !== " ") {
          chars.push(" ");
          map.push({ node : n, offset : i });
        }
        continue;
      }
      chars.push(data[i] ?? "");
      map.push({ node : n, offset : i });
    }
  }
  // Drop a leading collapsed space so indices stay aligned after trim.
  let start = 0;
  while (start < chars.length && chars[start] === " ") {
    start++;
  }
  const hay = chars.slice(start).join("");
  const idx = hay.indexOf(needle);
  if (idx < 0 || map.length === 0) {
    return null;
  }
  const from = map[start + idx];
  const endPos = map[start + idx + needle.length];
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  if (endPos) {
    range.setEnd(endPos.node, endPos.offset);
  } else {
    const last = map[map.length - 1];
    range.setEnd(last.node, last.node.length);
  }
  return range.collapsed ? null : range;
}
