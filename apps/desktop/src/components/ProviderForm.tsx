import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { formatIpcError } from "../lib/errors";
import { useProviderStore } from "../stores/providerStore";
import { statusLabel } from "../lib/reasoning";

export function ProviderForm() {
  const {
    loadProviders,
    testConnection,
    deleteProvider,
    statusByProvider,
    testingByProvider,
    testErrorByProvider
  } = useProviderStore();
  const providers = useProviderStore((s) => s.providers);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8000/v1");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(id : string, name : string) {
    if (!window.confirm(`Delete provider "${name}"? Its stored API key is removed too. Chat history is kept.`)) {
      return;
    }
    setError(null);
    setDeletingId(id);
    try {
      await deleteProvider(id);
    } catch (e) {
      setError(formatIpcError(e));
    } finally {
      setDeletingId(null);
    }
  }
  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Provider name must not be empty.");
      return;
    }
    if (!/^https?:\/\//.test(baseUrl.trim())) {
      setError("Base URL must start with http:// or https://.");
      return;
    }
    if (!apiKey) {
      setError("API key must not be empty.");
      return;
    }
    setBusy(true);
    try {
      await invoke("create_provider", {
        input : { name : name.trim(), base_url : baseUrl.trim(), api_key : apiKey, timeout_ms : 30000 }
      });
      setName("");
      setApiKey("");
      await loadProviders();
    } catch (e) {
      setError(formatIpcError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ border : "1px solid #ddd", borderRadius : 8, padding : 12, marginBottom : 12 }}>
      <h3 style={{ margin : "0 0 8px" }}>Providers</h3>
      <div style={{ display : "grid", gap : 8 }}>
        <label>
          Provider name
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width : "100%" }} />
        </label>
        <label title="Anthropic menyusul setelah MVP-0">
          Compatibility (locked in MVP-0)
          <input value="OpenAI Compatible" disabled style={{ width : "100%" }} />
        </label>
        <label>
          Base URL
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} style={{ width : "100%" }} />
        </label>
        <label>
          API key
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={{ width : "100%" }} />
        </label>
        <button onClick={() => void submit()} disabled={busy}>
          {busy ? "Saving…" : "Add provider"}
        </button>
        {error && <p style={{ color : "crimson" }}>{error}</p>}
      </div>
      <ul style={{ marginTop : 12, paddingLeft : 18 }}>
        {providers.map((p) => (
          <li key={p.id}>
            {p.name} — <code>{p.base_url}</code>{" "}
            <span>[{statusLabel(statusByProvider[p.id] ?? "not_tested")}]</span>{" "}
            <button
              disabled={!!testingByProvider[p.id]}
              onClick={() => void testConnection(p.id)}
            >
              {testingByProvider[p.id] ? "Testing…" : "Test connection"}
            </button>{" "}
            <button
              disabled={deletingId === p.id}
              onClick={() => void remove(p.id, p.name)}
              title="Delete provider and its stored API key (history is kept)"
            >
              {deletingId === p.id ? "Deleting…" : "Delete"}
            </button>
            {testErrorByProvider[p.id] && (
              <p style={{ color : "crimson" }}>{testErrorByProvider[p.id]}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
