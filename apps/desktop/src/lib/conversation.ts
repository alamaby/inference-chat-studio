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
  role : string;
  content_json : string;
  provider_id? : string | null;
  model_id? : string | null;
  status : string;
}

export interface ChatMsg {
  role : string;
  content : string;
  model? : string;
  providerId? : string;
  status? : string;
}

export function toChatMsg(row : PersistedMessage): ChatMsg {
  const msg: ChatMsg = {
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
