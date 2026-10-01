import { useState } from "react";
import { useProviderStore } from "../stores/providerStore";
import { REASONING_LEVELS } from "../../../../packages/api-types/src/index";
import { availableReasoningOptions } from "../lib/reasoning";
import {
  createTemplateItem,
  deleteTemplate,
  loadTemplates,
  saveTemplates,
  upsertTemplate,
  type PromptTemplate
} from "../lib/promptTemplates";
import { Collapsible } from "./Collapsible";
import { btn, hintText, input, label, select, textarea } from "../lib/ui";

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

  const [templates, setTemplates] = useState<PromptTemplate[]>(() => {
    try {
      return loadTemplates();
    } catch {
      return [];
    }
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateName, setTemplateName] = useState<string>("");

  function saveCurrentAsTemplate() {
    try {
      const now = new Date().toISOString();
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `t-${Date.now()}`;
      const next = upsertTemplate(templates, createTemplateItem(id, templateName, systemPrompt, now));
      setTemplates(next);
      saveTemplates(next);
      setTemplateName("");
      setSelectedTemplateId(id);
    } catch {
      // createTemplateItem rejects an empty name; the button is disabled then,
      // so this guard only fires for unexpected inputs.
    }
  }

  function deleteSelectedTemplate() {
    if (!selectedTemplateId) {
      return;
    }
    const next = deleteTemplate(templates, selectedTemplateId);
    setTemplates(next);
    saveTemplates(next);
    setSelectedTemplateId("");
  }

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
      <div className="mb-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        <p className={hintText}>Prompt templates (stored locally, not in backup).</p>
        <div className="mt-1 flex gap-2">
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className={`${select} flex-1`}
            title="Prompt template"
          >
            <option value="">Select template...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            onClick={() => {
              const found = templates.find((t) => t.id === selectedTemplateId);
              if (found) {
                setSimple({ systemPrompt : found.content });
              }
            }}
            disabled={!selectedTemplateId}
            className={btn}
            title="Apply template to system prompt"
          >
            Apply
          </button>
          <button
            onClick={deleteSelectedTemplate}
            disabled={!selectedTemplateId}
            className={btn}
            title="Delete template"
          >
            Delete
          </button>
        </div>
        <div className="mt-1 flex gap-2">
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Template name..."
            className={`${input} flex-1`}
          />
          <button
            onClick={saveCurrentAsTemplate}
            disabled={!templateName.trim() || !systemPrompt.trim()}
            className={btn}
            title="Save current system prompt as template"
          >
            Save current
          </button>
        </div>
      </div>
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
