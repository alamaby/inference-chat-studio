import { useState } from "react";
import { useProviderStore } from "../stores/providerStore";

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
    <section style={{ border : "1px solid #ddd", borderRadius : 8, padding : 12, marginBottom : 12 }}>
      <h3 style={{ margin : "0 0 8px" }}>Model</h3>
      <div style={{ display : "flex", gap : 8, flexWrap : "wrap" }}>
        <select
          value={activeProvider?.id ?? ""}
          onChange={(e) => setActive(e.target.value || null, null)}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={activeModelId ?? ""}
          onChange={(e) => setActive(activeProviderId, e.target.value || null)}
        >
          <option value="">Select model…</option>
          {models.map((m) => (
            <option key={m.remote_model_id} value={m.remote_model_id}>
              {m.display_name ?? m.remote_model_id}
            </option>
          ))}
        </select>
        <button onClick={() => void refresh()} disabled={!activeProvider || busy}>
          {busy ? "Refreshing…" : "Refresh Models"}
        </button>
        <input
          placeholder="Filter models…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          title="Filter by model id or display name"
        />
      </div>
      {allModels.length > 0 && models.length === 0 && (
        <p style={{ opacity : 0.7 }}>No models match “{filter.trim()}”.</p>
      )}
      {allModels.length === 0 && (
        <p style={{ opacity : 0.7 }}>No cached models yet — refresh or add one manually.</p>
      )}
      <div style={{ display : "flex", gap : 8, marginTop : 8, flexWrap : "wrap" }}>
        <input placeholder="model id (manual)" value={manualId} onChange={(e) => setManualId(e.target.value)} />
        <input placeholder="display name (optional)" value={manualName} onChange={(e) => setManualName(e.target.value)} />
        <button onClick={() => void addManual()}>Add Model Manually</button>
      </div>
    </section>
  );
}
