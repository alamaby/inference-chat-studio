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
  compatibility_type? : "openai" | "anthropic" | null;
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
  origin_window? : string | null;
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
  created_at : string;
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

export interface FolderDto {
  id : string;
  name : string;
  created_at : string;
}

export interface TagDto {
  id : string;
  name : string;
  created_at : string;
}

export interface AppInfo {
  name : string;
  version : string;
  build_number : string;
  git_sha : string;
  build_time : string;
  tauri_version : string;
}

// No credential_reference / api_key here: secrets never leave the backend.
export interface BackupProvider {
  id : string;
  name : string;
  base_url : string;
  compatibility_type : string;
  api_mode : string;
  additional_headers_json? : string | null;
  default_model_id? : string | null;
  enabled : boolean;
  created_at : string;
  updated_at : string;
}

export interface BackupModel {
  id : string;
  provider_id : string;
  remote_model_id : string;
  display_name? : string | null;
  capabilities_json? : string | null;
  manually_added : boolean;
  available : boolean;
  first_seen_at : string;
  last_seen_at : string;
}

export interface ConversationRowLite {
  id : string;
  title : string;
  provider_id? : string | null;
  default_model_id? : string | null;
  system_prompt? : string | null;
  settings_json? : string | null;
  pinned : boolean;
  archived : boolean;
  folder_id? : string | null;
  created_at : string;
  updated_at : string;
}

export interface MessageRowLite {
  id : string;
  conversation_id : string;
  parent_message_id? : string | null;
  role : string;
  content_json : string;
  raw_provider_data_json? : string | null;
  provider_id? : string | null;
  model_id? : string | null;
  reasoning_config_json? : string | null;
  usage_json? : string | null;
  duration_ms? : number | null;
  ttft_ms? : number | null;
  finish_reason? : string | null;
  status : string;
  created_at : string;
}

export interface BackupFolder {
  id : string;
  name : string;
  created_at : string;
}

export interface BackupTag {
  id : string;
  name : string;
  created_at : string;
}

export interface BackupConversation {
  conversation : ConversationRowLite;
  messages : MessageRowLite[];
  bookmarks : BookmarkDto[];
  folder_id? : string | null;
  tag_ids? : string[];
}

export const BACKUP_FORMAT = "ics-backup";
export const BACKUP_VERSION = 2;

export interface BackupFile {
  format : string;
  version : number;
  exported_at : string;
  app_version : string;
  providers : BackupProvider[];
  models : BackupModel[];
  conversations : BackupConversation[];
  folders? : BackupFolder[];
  tags? : BackupTag[];
}

export interface ImportSummary {
  providers : number;
  models : number;
  conversations : number;
  messages : number;
  bookmarks : number;
}
