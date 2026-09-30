import { useState } from "react";
import { useProviderStore } from "../stores/providerStore";
import { btn, card, hintText, input, sectionTitle, select } from "../lib/ui";

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
    <section className={card}>
      <h3 className={sectionTitle}>Model</h3>
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
      <div className="mt-2 flex flex-wrap gap-2">
        <input placeholder="model id (manual)" value={manualId} onChange={(e) => setManualId(e.target.value)} className={input} />
        <input placeholder="display name (optional)" value={manualName} onChange={(e) => setManualName(e.target.value)} className={input} />
        <button onClick={() => void addManual()} className={btn}>Add Model Manually</button>
      </div>
    </section>
  );
}
