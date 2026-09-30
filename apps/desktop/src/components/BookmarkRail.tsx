import { useProviderStore } from "../stores/providerStore";
import { locateAndFlash } from "../lib/scroll";
import { btn, card, hintText, sectionTitle } from "../lib/ui";

/**
 * Bookmark rail on the right side of the chat panel.
 * Clicking a bookmark scrolls the chat to the bookmarked passage and
 * flashes it; the label is the first 20 characters of the selection.
 */
export function BookmarkRail() {
  const bookmarks = useProviderStore((s) => s.bookmarks);
  const deleteBookmark = useProviderStore((s) => s.deleteBookmark);

  function jump(messageId : string, anchor : string) {
    const el = document.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId)}"]`
    );
    if (!el) {
      return;
    }
    locateAndFlash(el, anchor);
  }

  return (
    <aside className={`${card} w-60 shrink-0 self-start`}>
      <h3 className={sectionTitle}>Bookmarks</h3>
      {bookmarks.length === 0 ? (
        <p className={`${hintText} !text-xs`}>
          Select text in an assistant reply, right-click, then “Bookmark here”.
        </p>
      ) : (
        <ul className="max-h-96 space-y-1 overflow-y-auto">
          {bookmarks.map((b) => (
            <li key={b.id}>
              <div className="group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <button
                  onClick={() => jump(b.message_id, b.anchor_text)}
                  title={b.anchor_text}
                  className="min-w-0 flex-1 truncate text-left"
                >
                  {b.label}
                </button>
                <button
                  onClick={() => void deleteBookmark(b.id).catch(() => undefined)}
                  title="Delete bookmark"
                  className="hidden rounded px-1 text-slate-400 hover:bg-slate-200 group-hover:block dark:hover:bg-slate-700"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
