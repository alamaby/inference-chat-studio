import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useProviderStore } from "./stores/providerStore";
import { matchShortcut } from "./lib/shortcuts";
import { CommandPalette } from "./components/CommandPalette";
import { ProviderForm } from "./components/ProviderForm";
import { ModelSelector } from "./components/ModelSelector";
import { SettingsSimple } from "./components/SettingsSimple";
import { ChatView } from "./components/ChatView";
import { BookmarkRail } from "./components/BookmarkRail";
import { ConversationList } from "./components/ConversationList";
import { AboutDialog } from "./components/AboutDialog";
import { DataBackup } from "./components/DataBackup";
import { btn, errorText, hintText } from "./lib/ui";

async function openDevtools(): Promise<void> {
  // No-op in plain browsers (vite dev without Tauri runtime).
  try {
    await invoke("open_devtools");
  } catch {
    // ignore: only meaningful inside the Tauri webview.
  }
}

export function App() {
  const loadProviders = useProviderStore((s) => s.loadProviders);
  const loadConversations = useProviderStore((s) => s.loadConversations);
  const error = useProviderStore((s) => s.error);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    void loadProviders().catch(() => undefined);
    void loadConversations().catch(() => undefined);
  }, [loadProviders, loadConversations]);

  useEffect(() => {
    function onKeyDown(e : KeyboardEvent) {
      if (e.key === "F12") {
        e.preventDefault();
        void openDevtools();
        return;
      }
      const target = e.target as HTMLElement | null;
      const action = matchShortcut({
        key : e.key,
        ctrlKey : e.ctrlKey,
        metaKey : e.metaKey,
        targetTag : target?.tagName ?? "",
        isContentEditable : target?.isContentEditable ?? false
      });
      if (action === "new-conversation") {
        e.preventDefault();
        void useProviderStore.getState().newConversation("New conversation").catch(() => undefined);
      } else if (action === "bookmark-from-selection") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("ics:bookmark-from-selection"));
      }
      // "toggle-palette" (Ctrl+K) is owned by CommandPalette; never handled here.
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-lg font-bold leading-tight">Inference Chat Studio</h1>
          <p className={hintText}>Prompt dikirim ke provider; history tersimpan lokal.</p>
        </div>
        <button
          onClick={() => setAboutOpen(true)}
          title="Version, build number and build info"
          className={btn}
        >
          About
        </button>
        <button
          onClick={() => void openDevtools()}
          title="Open WebView DevTools (or press F12)"
          className={`${btn} ml-auto`}
        >
          DevTools
        </button>
      </header>
      {error && <p className={`${errorText} border-b border-red-200 px-5 py-2`}>{error}</p>}
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-4 overflow-hidden p-4">
        <aside className="w-[380px] shrink-0 space-y-4 overflow-y-auto pr-1">
          <ProviderForm />
          <ModelSelector />
          <SettingsSimple />
          <ConversationList />
          <DataBackup />
        </aside>
        <main id="chat-scroll" className="min-w-0 flex-1 overflow-y-auto">
          <ChatView />
        </main>
        <div className="sticky top-0 max-h-full w-60 shrink-0 overflow-y-auto">
          <BookmarkRail />
        </div>
      </div>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <CommandPalette />
    </div>
  );
}
