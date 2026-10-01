import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { aggregateConversationUsage, type ConversationUsage } from "../lib/metrics";
import { hintText } from "../lib/ui";

function fmt(n : number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US");
}

/**
 * Token summary for the active conversation, aggregated from persisted
 * `messages.usage_json` (raw rows, since ChatMsg drops that column).
 * Read-only: one `list_messages_cmd` per conversation switch.
 */
export function ConversationUsage({ conversationId } : { conversationId : string | null }) {
  const [usage, setUsage] = useState<ConversationUsage | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setUsage(null);
      return;
    }
    let alive = true;
    void invoke<Array<{ usage_json? : string | null; status? : string | null }>>(
      "list_messages_cmd",
      { conversationId }
    )
      .then((rows) => { if (alive) setUsage(aggregateConversationUsage(rows)); })
      .catch(() => { if (alive) setUsage(null); });
    return () => { alive = false; };
  }, [conversationId]);

  if (!conversationId) {
    return null;
  }
  if (!usage) {
    return <p className={hintText}>Token usage: unavailable.</p>;
  }
  if (usage.messagesCounted === 0) {
    return (
      <p className={hintText}>
        Token usage: no data yet{usage.messagesSkipped > 0 ? ` (${usage.messagesSkipped} skipped)` : ""}.
      </p>
    );
  }
  return (
    <p
      className={hintText}
      title={`reasoning ${fmt(usage.reasoningTokens)} • counted ${usage.messagesCounted} • skipped ${usage.messagesSkipped}${usage.hasPartialData ? " • partial data" : ""}`}
    >
      Token usage: in {fmt(usage.inputTokens)} • out {fmt(usage.outputTokens)} • total{" "}
      {fmt(usage.totalTokens)} ({usage.messagesCounted} msgs{usage.hasPartialData ? ", partial" : ""})
    </p>
  );
}
