import type { BookmarkDto } from "../../../../packages/api-types/src/index";
import type { ChatMsg } from "./conversation";

export interface SingleExportConversation {
  id : string;
  title : string;
  provider_id? : string | null;
  default_model_id? : string | null;
  system_prompt? : string | null;
  created_at : string;
  updated_at : string;
}

export interface SingleExportInput {
  conversation : SingleExportConversation;
  messages : ChatMsg[];
  bookmarks : BookmarkDto[];
  exportedAt : string;
}

function pad(value : number, length : number) : string {
  return String(value).padStart(length, "0");
}

function slugify(title : string): string {
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || "conversation";
}

/** `ics-chat-<slug>-<YYYYMMDD>-<HHmmss>.<ext>` (UTC, mirrors backup.ts). */
export function buildSingleExportFilename(title : string, ext : "md" | "json", d : Date = new Date()): string {
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}`;
  const clock = `${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}${pad(d.getUTCSeconds(), 2)}`;
  return `ics-chat-${slugify(title)}-${stamp}-${clock}.${ext}`;
}

export function buildSingleConversationJson(input : SingleExportInput): string {
  return JSON.stringify({
    format : "ics-single-conversation",
    version : 1,
    exportedAt : input.exportedAt,
    conversation : input.conversation,
    messages : input.messages.map((m, i) => ({
      index : i,
      id : m.id ?? null,
      role : m.role,
      content : m.content,
      model : m.model ?? null,
      providerId : m.providerId ?? null,
      status : m.status ?? null,
      timestamp : m.timestamp ?? null
    })),
    bookmarks : input.bookmarks
  }, null, 2);
}

export function buildSingleConversationMarkdown(input : SingleExportInput): string {
  const lines : string[] = [];
  lines.push(`# ${input.conversation.title}`, "");
  lines.push(`> Exported ${input.exportedAt} • ${input.messages.length} messages • ${input.bookmarks.length} bookmarks`, "");
  lines.push("## Conversation", "");
  lines.push(
    `- id: \`${input.conversation.id}\``,
    `- provider: \`${input.conversation.provider_id ?? "-"}\``,
    `- model: \`${input.conversation.default_model_id ?? "-"}\``,
    ""
  );
  lines.push("## Messages", "");
  if (input.messages.length === 0) {
    lines.push("_No messages._", "");
  }
  input.messages.forEach((m, i) => {
    const meta = [m.role, m.model ?? null, m.timestamp ?? null].filter(Boolean).join(" • ");
    lines.push(`### ${i + 1}. ${m.role}`, "", meta ? `_${meta}_` : "", "", m.content || "_empty_", "");
  });
  lines.push("## Bookmarks", "");
  if (input.bookmarks.length === 0) {
    lines.push("_No bookmarks._", "");
  }
  for (const b of input.bookmarks) {
    lines.push(`- **${b.label}** (message \`${b.message_id}\`, ${b.created_at}): ${b.anchor_text}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** DOM-only; throws so the caller can surface a message via setError. */
export function downloadTextFile(filename : string, text : string, mime : string): void {
  const blob = new Blob([text], { type : mime });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    throw new Error("failed to download file");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
