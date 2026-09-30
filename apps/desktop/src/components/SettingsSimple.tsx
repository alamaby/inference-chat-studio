import { useProviderStore } from "../stores/providerStore";
import { REASONING_LEVELS } from "../../../../packages/api-types/src/index";
import { availableReasoningOptions } from "../lib/reasoning";
import { Collapsible } from "./Collapsible";
import { hintText, input, label, select, textarea } from "../lib/ui";

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
    <Collapsible id="settings" title="Settings (simple)">
      <label className={`${label} mb-2 block`}>
        Reasoning effort{" "}
        {!supported && (
          <span className={hintText}>— Not supported by this model</span>
        )}
        <select
          value={reasoningLevel}
          onChange={(e) => setReasoning(e.target.value as typeof reasoningLevel, customReasoningJson)}
          className={select}
        >
          {options.map((o) => (
            <option key={o.level} value={o.level} disabled={!o.enabled}>
              {o.label}{o.hint ? ` (${o.hint})` : ""}
            </option>
          ))}
        </select>
      </label>
      {reasoningLevel === "Custom" && (
        <label className={`${label} mb-2 block`}>
          Custom reasoning JSON (saved per conversation preset)
          <textarea
            value={customReasoningJson}
            onChange={(e) => setReasoning(e.target.value as typeof reasoningLevel, e.target.value)}
            rows={3}
            className={`${textarea} font-mono`}
          />
        </label>
      )}
      <label className={`${label} mb-2 block`}>
        System prompt
        <textarea
          value={systemPrompt}
          onChange={(e) => setSimple({ systemPrompt : e.target.value })}
          rows={3}
          className={textarea}
        />
      </label>
      <div className="flex gap-2">
        <label className={label}>
          Temperature
          <input
            type="number"
            step="0.1"
            value={temperature ?? ""}
            placeholder={caps && !caps.supports_temperature ? "unsupported" : "auto"}
            disabled={!!caps && !caps.supports_temperature}
            onChange={(e) => setSimple({ temperature : e.target.value === "" ? null : Number(e.target.value) })}
            className={input}
          />
        </label>
        <label className={label}>
          Max output
          <input
            type="number"
            value={maxOutput ?? ""}
            placeholder="auto"
            onChange={(e) => setSimple({ maxOutput : e.target.value === "" ? null : Number(e.target.value) })}
            className={input}
          />
        </label>
        <label className={label}>
          Streaming
          <input type="checkbox" checked disabled title="Locked on in MVP-0" className="h-4 w-4 accent-blue-600" />
        </label>
      </div>
    </Collapsible>
  );
}
