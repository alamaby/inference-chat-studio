/**
 * Derived chat metrics (Fase: Inspector Metrics tab).
 *
 * Pure functions over the provider-returned `usage` payload. Providers that
 * do not return usage yield `null`s — the UI renders those as "—" and must
 * never invent token counts.
 */

export interface MetricsInput {
  usage? : unknown;
  durationMs? : number | null;
  ttftMs? : number | null;
}

export interface ChatMetrics {
  inputTokens : number | null;
  outputTokens : number | null;
  reasoningTokens : number | null;
  totalTokens : number | null;
  /** Output tokens per second, derived from output tokens + total duration. */
  tokensPerSecond : number | null;
}

function num(value : unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function obj(value : unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export function computeMetrics(input : MetricsInput): ChatMetrics {
  const usage = obj(input.usage) ?? {};
  const details = obj(usage["completion_tokens_details"]) ?? {};
  const outputTokens = num(usage["completion_tokens"]);
  const durationSec =
    typeof input.durationMs === "number" && input.durationMs > 0
      ? input.durationMs / 1000
      : null;
  return {
    inputTokens : num(usage["prompt_tokens"]),
    outputTokens,
    reasoningTokens : num(details["reasoning_tokens"]),
    totalTokens : num(usage["total_tokens"]),
    tokensPerSecond :
      outputTokens !== null && durationSec !== null
        ? outputTokens / durationSec
        : null
  };
}

export function formatTokensPerSecond(tps : number | null): string {
  return tps === null ? "—" : `${tps.toFixed(1)} tok/s`;
}

export interface UsageRow {
  usage_json? : string | null | unknown;
  status? : string | null;
}

export interface ConversationUsage {
  messagesCounted : number;
  messagesSkipped : number;
  inputTokens : number | null;
  outputTokens : number | null;
  reasoningTokens : number | null;
  totalTokens : number | null;
  hasPartialData : boolean;
}

/** Parse one usage payload (object or JSON string) into token counts. */
export function parseUsageJson(raw : unknown): {
  inputTokens : number | null;
  outputTokens : number | null;
  reasoningTokens : number | null;
  totalTokens : number | null;
} {
  const usage =
    typeof raw === "string"
      ? (() => {
          try {
            return obj(JSON.parse(raw));
          } catch {
            return null;
          }
        })()
      : obj(raw);
  if (!usage) {
    return { inputTokens : null, outputTokens : null, reasoningTokens : null, totalTokens : null };
  }
  const details = obj(usage["completion_tokens_details"]) ?? {};
  return {
    inputTokens : num(usage["prompt_tokens"]),
    outputTokens : num(usage["completion_tokens"]),
    reasoningTokens : num(details["reasoning_tokens"]),
    totalTokens : num(usage["total_tokens"])
  };
}

/**
 * Sum usage across message rows. Skips cancelled/streaming rows and rows
 * without parsable usage. A column stays null when no row reported it.
 */
export function aggregateConversationUsage(rows : UsageRow[]): ConversationUsage {
  let input : number | null = null;
  let output : number | null = null;
  let reasoning : number | null = null;
  let total : number | null = null;
  let counted = 0;
  let skipped = 0;
  let partial = false;
  for (const r of rows) {
    if (r.status === "cancelled" || r.status === "streaming") {
      skipped += 1;
      continue;
    }
    if (r.usage_json === null || r.usage_json === undefined) {
      skipped += 1;
      partial = true;
      continue;
    }
    const p = parseUsageJson(r.usage_json);
    if (
      p.inputTokens === null &&
      p.outputTokens === null &&
      p.reasoningTokens === null &&
      p.totalTokens === null
    ) {
      skipped += 1;
      partial = true;
      continue;
    }
    counted += 1;
    if (p.inputTokens !== null) input = (input ?? 0) + p.inputTokens;
    if (p.outputTokens !== null) output = (output ?? 0) + p.outputTokens;
    if (p.reasoningTokens !== null) reasoning = (reasoning ?? 0) + p.reasoningTokens;
    if (p.totalTokens !== null) total = (total ?? 0) + p.totalTokens;
    if (p.inputTokens === null || p.outputTokens === null || p.totalTokens === null) {
      partial = true;
    }
  }
  return {
    messagesCounted : counted,
    messagesSkipped : skipped,
    inputTokens : input,
    outputTokens : output,
    reasoningTokens : reasoning,
    totalTokens : total,
    hasPartialData : partial
  };
}
