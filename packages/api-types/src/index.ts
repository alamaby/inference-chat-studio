// Mirror of the Rust IPC DTOs (src-tauri/src/ipc.rs).
// Components must import these types instead of duplicating string literals.

export type ReasoningLevel =
  | "Automatic"
  | "None"
  | "Minimal"
  | "Low"
  | "Medium"
  | "High"
  | "ExtraHigh"
  | "Maximum"
  | "Custom";

export const REASONING_LEVELS: ReasoningLevel[] = [
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

export type ConnectionStatus =
  | "connected"
  | "connection_failed"
  | "unauthorized"
  | "timeout"
  | "invalid_response"
  | "not_tested";

export interface ProviderDto {
  id : string;
  name : string;
  compatibility_type : string;
  api_mode : string;
  base_url : string;
  credential_reference? : string | null;
  additional_headers_json? : string | null;
  default_model_id? : string | null;
  enabled : boolean;
  created_at : string;
  updated_at : string;
  api_key? : string | null;
}

export interface CreateProviderInput {
  name : string;
  base_url : string;
  api_key : string;
  additional_headers_json? : string | null;
  timeout_ms? : number;
}

export interface ModelCapabilities {
  supports_streaming : boolean;
  supports_reasoning : boolean;
  allowed_reasoning : ReasoningLevel[];
  supports_temperature : boolean;
  supports_system_prompt : boolean;
  max_output_tokens? : number | null;
}

export interface ModelInfo {
  remote_model_id : string;
  display_name? : string | null;
  capabilities : ModelCapabilities;
}

export interface ChatMessage {
  role : string;
  content : string;
}

export interface StreamChatInput {
  conversation_id : string;
  provider_id : string;
  model : string;
  messages : ChatMessage[];
  system_prompt? : string | null;
  temperature? : number | null;
  max_output_tokens? : number | null;
  reasoning_level : ReasoningLevel;
  reasoning_custom_json? : unknown;
  timeout_ms? : number;
}

export interface ChatChunkEvent {
  stream_id : string;
  conversation_id : string;
  delta : string;
}

export interface ChatDoneEvent {
  stream_id : string;
  conversation_id : string;
  message_id : string;
  text : string;
  finish_reason? : string | null;
  usage? : unknown;
  duration_ms : number;
  ttft_ms? : number | null;
  model : string;
  request_url : string;
  status_code : number;
}

export interface ChatErrorEvent {
  stream_id : string;
  conversation_id : string;
  code : string;
  message : string;
  request_url? : string | null;
  request_body? : unknown;
}

export interface BookmarkDto {
  id : string;
  conversation_id : string;
  message_id : string;
  label : string;
  anchor_text : string;
  created_at : string;
}
