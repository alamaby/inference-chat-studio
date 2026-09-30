import { useState } from "react";
import { Collapsible } from "./Collapsible";
import { useProviderStore } from "../stores/providerStore";
import { btn, hintText, input, label, select } from "../lib/ui";

export function ModelSelector() {
  const {
    providers,
    modelsByProvider,
    activeProviderId,
    activeModelId,
    setActive,
    refreshModels,
    addModelManual
  } = useProviderStore();
  const [manualId, setManualId] = useState("");
  const [manualName, setManualName] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const activeProvider = providers.find((p) => p.id === activeProviderId) ?? providers[0];
  const allModels = activeProvider ? (modelsByProvider[activeProvider.id] ?? []) : [];
  const q = filter.trim().toLowerCase();
  const models = q
    ? allModels.filter((m) =>
        m.remote_model_id.toLowerCase().includes(q) ||
        (m.display_name ?? "").toLowerCase().includes(q)
      )
    : allModels;

  async function refresh() {
    if (!activeProvider) return;
    setBusy(true);
    try {
      await refreshModels(activeProvider.id);
    } finally {
      setBusy(false);
    }
  }

  async function addManual() {
    if (!activeProvider || !manualId.trim()) return;
    await addModelManual(activeProvider.id, manualId.trim(), manualName.trim() || undefined);
    setManualId("");
    setManualName("");
  }

  return (
    <Collapsible id="model" title="Model">
      <div className="flex flex-wrap gap-2">
        <select
          value={activeProvider?.id ?? ""}
          onChange={(e) => setActive(e.target.value || null, null)}
          className={select}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={activeModelId ?? ""}
          onChange={(e) => setActive(activeProviderId, e.target.value || null)}
          className={select}
        >
          <option value="">Select model…</option>
          {models.map((m) => (
            <option key={m.remote_model_id} value={m.remote_model_id}>
              {m.display_name ?? m.remote_model_id}
            </option>
          ))}
        </select>
        <button onClick={() => void refresh()} disabled={!activeProvider || busy} className={btn}>
          {busy ? "Refreshing…" : "Refresh Models"}
        </button>
        <input
          placeholder="Filter models…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          title="Filter by model id or display name"
          className={input}
        />
      </div>
      {allModels.length > 0 && models.length === 0 && (
        <p className={`${hintText} mt-2`}>No models match “{filter.trim()}”.</p>
      )}
      {allModels.length === 0 && (
        <p className={`${hintText} mt-2`}>No cached models yet — refresh or add one manually.</p>
      )}
      <div className="mt-2 rounded-lg border border-dashed border-slate-300 p-2.5 dark:border-slate-700">
        <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
          Add model manually
        </p>
        <p className={`${hintText} mb-1.5 !text-xs`}>
          Only needed when the endpoint has no model list (refresh returns nothing).
          The ID must match the provider exactly.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className={label}>
            Model ID (required)
            <input placeholder="e.g. gpt-oss-20b:free" value={manualId} onChange={(e) => setManualId(e.target.value)} className={input} />
          </label>
          <label className={label}>
            Display name (optional)
            <input placeholder="e.g. My GPT" value={manualName} onChange={(e) => setManualName(e.target.value)} className={input} />
          </label>
          <button onClick={() => void addManual()} className={`${btn} self-end`}>Add Model Manually</button>
        </div>
      </div>
    </Collapsible>
  );
}
