import { useProviderStore } from "../stores/providerStore";
import { REASONING_LEVELS } from "../../../../packages/api-types/src/index";
import { availableReasoningOptions } from "../lib/reasoning";

export function SettingsSimple() {
  const {
    modelsByProvider,
    activeProviderId,
    activeModelId,
    reasoningLevel,
    customReasoningJson,
    systemPrompt,
    temperature,
    maxOutput,
    setReasoning,
    setSimple
  } = useProviderStore();

  const models = activeProviderId ? (modelsByProvider[activeProviderId] ?? []) : [];
  const caps = models.find((m) => m.remote_model_id === activeModelId)?.capabilities ?? null;
  const { options, supported } = availableReasoningOptions(caps);
  void REASONING_LEVELS;

  return (
    <section style={{ border : "1px solid #ddd", borderRadius : 8, padding : 12, marginBottom : 12 }}>
      <h3 style={{ margin : "0 0 8px" }}>Settings (simple)</h3>
      <label style={{ display : "block", marginBottom : 8 }}>
        Reasoning effort{" "}
        {!supported && (
          <span style={{ opacity : 0.7 }}>— Not supported by this model</span>
        )}
        <select
          value={reasoningLevel}
          onChange={(e) => setReasoning(e.target.value as typeof reasoningLevel, customReasoningJson)}
          style={{ width : "100%" }}
        >
          {options.map((o) => (
            <option key={o.level} value={o.level} disabled={!o.enabled}>
              {o.label}{o.hint ? ` (${o.hint})` : ""}
            </option>
          ))}
        </select>
      </label>
      {reasoningLevel === "Custom" && (
        <label style={{ display : "block", marginBottom : 8 }}>
          Custom reasoning JSON (saved per conversation preset)
          <textarea
            value={customReasoningJson}
            onChange={(e) => setReasoning(e.target.value as typeof reasoningLevel, e.target.value)}
            rows={3}
            style={{ width : "100%", fontFamily : "monospace" }}
          />
        </label>
      )}
      <label style={{ display : "block", marginBottom : 8 }}>
        System prompt
        <textarea
          value={systemPrompt}
          onChange={(e) => setSimple({ systemPrompt : e.target.value })}
          rows={3}
          style={{ width : "100%" }}
        />
      </label>
      <div style={{ display : "flex", gap : 8 }}>
        <label>
          Temperature
          <input
            type="number"
            step="0.1"
            value={temperature ?? ""}
            placeholder={caps && !caps.supports_temperature ? "unsupported" : "auto"}
            disabled={!!caps && !caps.supports_temperature}
            onChange={(e) => setSimple({ temperature : e.target.value === "" ? null : Number(e.target.value) })}
          />
        </label>
        <label>
          Max output
          <input
            type="number"
            value={maxOutput ?? ""}
            placeholder="auto"
            onChange={(e) => setSimple({ maxOutput : e.target.value === "" ? null : Number(e.target.value) })}
          />
        </label>
        <label>
          Streaming
          <input type="checkbox" checked disabled title="Locked on in MVP-0" />
        </label>
      </div>
    </section>
  );
}
