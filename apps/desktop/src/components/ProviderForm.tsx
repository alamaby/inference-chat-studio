import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { formatIpcError } from "../lib/errors";
import { useProviderStore } from "../stores/providerStore";
import { statusLabel } from "../lib/reasoning";
import { Collapsible } from "./Collapsible";
import {
  btn,
  btnPrimary,
  code,
  errorText,
  hintText,
  input,
  label,
  select,
  statusDot,
  statusPill
} from "../lib/ui";

export function ProviderForm() {
  const {
    loadProviders,
    testConnection,
    deleteProvider,
    rotateProviderKey,
    clearProviderError,
    statusByProvider,
    testingByProvider,
    testErrorByProvider
  } = useProviderStore();
  const providers = useProviderStore((s) => s.providers);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8000/v1");
  const [apiKey, setApiKey] = useState("");
  const [compat, setCompat] = useState<"openai" | "anthropic">("openai");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // One rotate form open at a time; opening another collapses the previous
  // and clears its draft so keys are never leaked across items.
  const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [rotateError, setRotateError] = useState<string | null>(null);

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
        input : { name : name.trim(), base_url : baseUrl.trim(), api_key : apiKey, timeout_ms : 30000, compatibility_type : compat }
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

  function toggleRotate(id : string) {
    setRotateError(null);
    setNewKey("");
    setExpandedKeyId((cur) => (cur === id ? null : id));
  }

  async function rotate(id : string) {
    if (!newKey) {
      setRotateError("API key must not be empty.");
      return;
    }
    setRotateError(null);
    setRotatingId(id);
    try {
      await rotateProviderKey(id, newKey);
      setNewKey("");
      setExpandedKeyId(null);
    } catch (e) {
      setRotateError(formatIpcError(e));
    } finally {
      setRotatingId(null);
    }
  }

  return (
    <Collapsible id="providers" title="Providers">
      <div className="grid gap-2.5">
        <label className={label}>
          Provider name
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <label className={label}>
          Compatibility
          <select
            value={compat}
            onChange={(e) => setCompat(e.target.value as "openai" | "anthropic")}
            className={select}
          >
            <option value="openai">OpenAI Compatible</option>
            <option value="anthropic">Anthropic</option>
          </select>
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
          {busy ? "Saving..." : "Add provider"}
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
            <div className="mt-1.5">
              <span className={statusPill(statusByProvider[p.id] ?? "not_tested")}>
                <span className={statusDot(statusByProvider[p.id] ?? "not_tested")} />
                {statusLabel(statusByProvider[p.id] ?? "not_tested")}
              </span>
            </div>
            <div className="mt-1.5 flex gap-2">
              <button
                disabled={!!testingByProvider[p.id]}
                onClick={() => void testConnection(p.id)}
                className={btn}
              >
                {testingByProvider[p.id] ? "Testing..." : "Test connection"}
              </button>
              <button
                disabled={deletingId === p.id || rotatingId === p.id}
                onClick={() => void remove(p.id, p.name)}
                title="Delete provider and its stored API key (history is kept)"
                className={btn}
              >
                {deletingId === p.id ? "Deleting..." : "Delete"}
              </button>
              <button
                disabled={rotatingId === p.id}
                onClick={() => toggleRotate(p.id)}
                title="Replace the stored API key (the current key is never shown)"
                className={btn}
              >
                {rotatingId === p.id ? "Saving…" : expandedKeyId === p.id ? "Cancel" : "Rotate key"}
              </button>
            </div>
            {expandedKeyId === p.id && (
              <div className="mt-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm dark:border-slate-700">
                <p className={`mb-2 ${hintText}`}>
                  Mengganti key di OS store; key lama tidak dapat ditampilkan.
                </p>
                <label className={label}>
                  New API key
                  <input
                    type="password"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="sk-…"
                    className={input}
                  />
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => void rotate(p.id)}
                    disabled={rotatingId === p.id}
                    className={btnPrimary}
                  >
                    {rotatingId === p.id ? "Saving…" : "Save new key"}
                  </button>
                  {rotateError && (
                    <p className={`${errorText} flex-1`}>{rotateError}</p>
                  )}
                </div>
              </div>
            )}
            {testErrorByProvider[p.id] && (
              <div className="mt-1 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                <p className="min-w-0 flex-1">{testErrorByProvider[p.id]}</p>
                <button onClick={() => clearProviderError(p.id)} title="Dismiss" className="rounded px-1 hover:bg-red-100 dark:hover:bg-red-900">×</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}
