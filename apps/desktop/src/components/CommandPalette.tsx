import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useProviderStore } from "../stores/providerStore";
import { buildPaletteItems, filterPalette } from "../lib/palette";
import { input } from "../lib/ui";

/**
 * Command palette (Ctrl+K): fuzzy-jump to any model, start a new
 * conversation, or open DevTools — without scrolling the sidebar.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const providers = useProviderStore((s) => s.providers);
  const modelsByProvider = useProviderStore((s) => s.modelsByProvider);

  useEffect(() => {
    function onKeyDown(e : KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open ]);

  if (!open) {
    return null;
  }

  const items = filterPalette(buildPaletteItems(providers, modelsByProvider), query);
  const active = items[Math.min(cursor, Math.max(items.length - 1, 0))];

  async function run(id : string) {
    const item = items.find((i) => i.id === id);
    if (!item) {
      return;
    }
    const s = useProviderStore.getState();
    if (item.action.type === "model") {
      s.setActive(item.action.providerId, item.action.modelId);
    } else if (item.action.type === "new-conversation") {
      await s.newConversation("New conversation").catch(() => undefined);
    } else {
      await invoke("open_devtools").catch(() => undefined);
    }
    setOpen(false);
  }

  function onInputKey(e : React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && active) {
      e.preventDefault();
      void run(active.id);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
          onKeyDown={onInputKey}
          placeholder="Type a model name or action… (Esc to close)"
          className={`${input} !rounded-none !border-0 !border-b !px-4 !py-3 !text-base focus:!ring-0`}
        />
        <ul className="max-h-72 overflow-y-auto p-1.5">
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                onClick={() => void run(item.id)}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                  i === cursor
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {item.subtitle && (
                  <span className="shrink-0 text-xs text-slate-400">{item.subtitle}</span>
                )}
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-slate-500">No matches.</li>
          )}
        </ul>
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400 dark:border-slate-800">
          Ctrl+K to toggle • ↑↓ to move • Enter to select
        </p>
      </div>
    </div>
  );
}
