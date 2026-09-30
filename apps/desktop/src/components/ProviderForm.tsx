import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { formatIpcError } from "../lib/errors";
import { useProviderStore } from "../stores/providerStore";
import { statusLabel } from "../lib/reasoning";
import {
  btn,
  btnPrimary,
  card,
  code,
  errorText,
  input,
  label,
  sectionTitle,
  statusDot
} from "../lib/ui";

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

  return (
    <section className={card}>
      <h3 className={sectionTitle}>Providers</h3>
      <div className="grid gap-2.5">
        <label className={label}>
          Provider name
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <label className={label} title="Anthropic menyusul setelah MVP-0">
          Compatibility (locked in MVP-0)
          <input value="OpenAI Compatible" disabled className={input} />
        </label>
        <label className={label}>
          Base URL
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={input} />
        </label>
        <label className={label}>
          API key
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className={input} />
        </label>
        <button onClick={() => void submit()} disabled={busy} className={btnPrimary}>
          {busy ? "Saving…" : "Add provider"}
        </button>
        {error && <p className={errorText}>{error}</p>}
      </div>
      <ul className="mt-3 space-y-2">
        {providers.map((p) => (
          <li key={p.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
            <div className="flex items-center gap-2">
              <span className={statusDot(statusByProvider[p.id] ?? "not_tested")} />
              <span className="font-medium">{p.name}</span>
            </div>
            <code className={`${code} mt-1 block truncate`}>{p.base_url}</code>
            <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {statusLabel(statusByProvider[p.id] ?? "not_tested")}
            </div>
            <div className="mt-1.5 flex gap-2">
              <button
                disabled={!!testingByProvider[p.id]}
                onClick={() => void testConnection(p.id)}
                className={btn}
              >
                {testingByProvider[p.id] ? "Testing…" : "Test connection"}
              </button>
              <button
                disabled={deletingId === p.id}
                onClick={() => void remove(p.id, p.name)}
                title="Delete provider and its stored API key (history is kept)"
                className={btn}
              >
                {deletingId === p.id ? "Deleting…" : "Delete"}
              </button>
            </div>
            {testErrorByProvider[p.id] && (
              <p className={`${errorText} mt-1`}>{testErrorByProvider[p.id]}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
