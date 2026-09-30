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
