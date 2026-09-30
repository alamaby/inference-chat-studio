import type {
  ChatMessage,
  ConnectionStatus,
  ModelCapabilities,
  ModelInfo,
  ProviderDto,
  ReasoningLevel
} from "../../../../packages/api-types/src/index";

export function defaultCapabilities(): ModelCapabilities {
  return {
    supports_streaming : true,
    supports_reasoning : false,
    allowed_reasoning : [],
    supports_temperature : true,
    supports_system_prompt : true,
    max_output_tokens : null
  };
}

export interface ReasoningOption {
  level : ReasoningLevel;
  label : string;
  enabled : boolean;
  hint? : string;
}

const LEVEL_LABELS: Record<ReasoningLevel, string> = {
  Automatic : "Automatic",
  None : "None",
  Minimal : "Minimal",
  Low : "Low",
  Medium : "Medium",
  High : "High",
  ExtraHigh : "Extra High",
  Maximum : "Maximum",
  Custom : "Custom"
};

/**
 * Capability-aware gating for the reasoning dropdown.
 *
 * - `supports_reasoning === false` → only Automatic/None/Custom are
 *   selectable; every concrete level is disabled with a hint.
 * - non-empty `allowed_reasoning` → only listed levels (+Automatic/None/
 *   Custom) are enabled; others disabled.
 * - empty allowlist + reasoning supported → all levels enabled.
 */
export function availableReasoningOptions(
  caps: ModelCapabilities | null | undefined
): { options : ReasoningOption[]; supported : boolean } {
  const levels: ReasoningLevel[] = [
    "Automatic",
    "None",
    "Minimal",
    "Low",
    "Medium",
    "High",
    "ExtraHigh",
    "Maximum",
    "Custom"
  ];
  const alwaysOn: ReasoningLevel[] = ["Automatic", "None", "Custom"];
  if (!caps || !caps.supports_reasoning) {
    return {
      supported : false,
      options : levels.map((level) => ({
        level,
        label : LEVEL_LABELS[level],
        enabled : alwaysOn.includes(level),
        hint : alwaysOn.includes(level)
          ? undefined
          : "Not supported by this model"
      }))
    };
  }
  const allow = new Set(caps.allowed_reasoning ?? []);
  const restricted = allow.size > 0;
  return {
    supported : true,
    options : levels.map((level) => {
      const enabled = alwaysOn.includes(level) || !restricted || allow.has(level);
      return {
        level,
        label : LEVEL_LABELS[level],
        enabled,
        hint : enabled ? undefined : "Not in this model's allowlist"
      };
    })
  };
}

export function statusLabel(status: ConnectionStatus | string): string {
  switch (status) {
    case "connected": return "Connected";
    case "unauthorized": return "Unauthorized";
    case "timeout": return "Timeout";
    case "invalid_response": return "Invalid Response";
    case "connection_failed": return "Connection Failed";
    default: return "Not Tested";
  }
}

export type { ChatMessage, ModelInfo, ProviderDto, ReasoningLevel };
export type { ModelCapabilities };
