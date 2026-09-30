/**
 * Decode a persisted `messages.content_json` cell back to display text.
 *
 * The backend stores two shapes (see `stream_chat_cmd` in ipc.rs):
 * - assistant messages: a JSON-encoded string (`"\"hello\""`),
 * - user messages: a JSON-encoded `{ role, content }` object (or `null`).
 * Anything unparsable is returned verbatim so no message is ever lost.
 */
export function decodeContent(contentJson : string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    return contentJson;
  }
  if (typeof parsed === "string") {
    return parsed;
  }
  if (parsed !== null && typeof parsed === "object" && "content" in parsed) {
    const content = (parsed as Record<string, unknown>)["content"];
    if (typeof content === "string") {
      return content;
    }
  }
  return contentJson;
}

export interface PersistedMessage {
  id : string;
  role : string;
  content_json : string;
  provider_id? : string | null;
  model_id? : string | null;
  status : string;
}

export interface ChatMsg {
  id? : string;
  role : string;
  content : string;
  model? : string;
  providerId? : string;
  status? : string;
}

export function toChatMsg(row : PersistedMessage): ChatMsg {
  const msg: ChatMsg = {
    id : row.id,
    role : row.role,
    content : decodeContent(row.content_json),
    status : row.status
  };
  if (row.model_id) {
    msg.model = row.model_id;
  }
  if (row.provider_id) {
    msg.providerId = row.provider_id;
  }
  return msg;
}

export type ReasoningLevelString =
  | "Automatic"
  | "None"
  | "Minimal"
  | "Low"
  | "Medium"
  | "High"
  | "ExtraHigh"
  | "Maximum"
  | "Custom";

const REASONING_LEVELS: ReasoningLevelString[] = [
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

export interface ConversationSettings {
  reasoningLevel : ReasoningLevelString;
  reasoningCustomJson : string;
  temperature : number | null;
  maxOutput : number | null;
}

export const DEFAULT_SETTINGS: ConversationSettings = {
  reasoningLevel : "Automatic",
  reasoningCustomJson : "{\"reasoning_effort\": \"high\"}",
  temperature : null,
  maxOutput : null
};

/** Serialize UI settings into `conversations.settings_json`. */
export function serializeConversationSettings(s : ConversationSettings): string {
  return JSON.stringify({
    reasoning_level : s.reasoningLevel,
    reasoning_custom_json : s.reasoningCustomJson,
    temperature : s.temperature,
    max_output_tokens : s.maxOutput
  });
}

/**
 * Parse `conversations.settings_json` defensively: unknown shapes or values
 * fall back to defaults field-by-field so one corrupt column never wipes
 * the whole settings panel.
 */
export function parseConversationSettings(raw : string | null | undefined): ConversationSettings {
  if (!raw) {
    return { ...DEFAULT_SETTINGS };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  const o = (typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const level = o["reasoning_level"];
  const custom = o["reasoning_custom_json"];
  const temp = o["temperature"];
  const maxOut = o["max_output_tokens"];
  return {
    reasoningLevel :
      typeof level === "string" && (REASONING_LEVELS as string[]).includes(level)
        ? (level as ReasoningLevelString)
        : DEFAULT_SETTINGS.reasoningLevel,
    reasoningCustomJson :
      typeof custom === "string" ? custom : DEFAULT_SETTINGS.reasoningCustomJson,
    temperature : typeof temp === "number" && Number.isFinite(temp) ? temp : null,
    maxOutput : typeof maxOut === "number" && Number.isFinite(maxOut) ? maxOut : null
  };
}
