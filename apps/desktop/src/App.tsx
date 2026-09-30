import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useProviderStore } from "./stores/providerStore";
import { ProviderForm } from "./components/ProviderForm";
import { ModelSelector } from "./components/ModelSelector";
import { SettingsSimple } from "./components/SettingsSimple";
import { ChatView } from "./components/ChatView";
import { ConversationList } from "./components/ConversationList";

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

  useEffect(() => {
    void loadProviders().catch(() => undefined);
    void loadConversations().catch(() => undefined);
  }, [loadProviders, loadConversations]);

  useEffect(() => {
    function onKeyDown(e : KeyboardEvent) {
      if (e.key === "F12") {
        e.preventDefault();
        void openDevtools();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div style={{ fontFamily : "system-ui, sans-serif", padding : 16, maxWidth : 1100, margin : "0 auto" }}>
      <header>
        <div style={{ display : "flex", alignItems : "baseline", gap : 12 }}>
          <h1 style={{ margin : "0 0 4px" }}>Inference Chat Studio</h1>
          <button
            onClick={() => void openDevtools()}
            title="Open WebView DevTools (or press F12)"
            style={{ marginLeft : "auto" }}
          >
            DevTools
          </button>
        </div>
        <p style={{ margin : "0 0 12px", opacity : 0.7 }}>
          Prompt dikirim ke provider; history tersimpan lokal.
        </p>
        {error && <p style={{ color : "crimson" }}>{error}</p>}
      </header>
      <div style={{ display : "grid", gridTemplateColumns : "360px 1fr", gap : 12 }}>
        <div>
          <ProviderForm />
          <ModelSelector />
          <SettingsSimple />
          <ConversationList />
        </div>
        <div>
          <ChatView />
        </div>
      </div>
    </div>
  );
}
