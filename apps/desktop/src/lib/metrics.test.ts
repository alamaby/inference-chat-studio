import { describe, expect, it } from "vitest";
import { aggregateConversationUsage, computeMetrics, formatTokensPerSecond } from "./metrics";

describe("computeMetrics", () => {
  it("derives token counts and per-second throughput", () => {
    const m = computeMetrics({
      usage : {
        prompt_tokens : 1240,
        completion_tokens : 386,
        total_tokens : 1626,
        completion_tokens_details : { reasoning_tokens : 742 }
      },
      durationMs : 4800,
      ttftMs : 620
    });
    expect(m).toEqual({
      inputTokens : 1240,
      outputTokens : 386,
      reasoningTokens : 742,
      totalTokens : 1626,
      tokensPerSecond : 386 / 4.8
    });
    expect(formatTokensPerSecond(m.tokensPerSecond)).toBe("80.4 tok/s");
  });

  it("returns nulls when the provider reports no usage", () => {
    expect(computeMetrics({})).toEqual({
      inputTokens : null,
      outputTokens : null,
      reasoningTokens : null,
      totalTokens : null,
      tokensPerSecond : null
    });
    expect(formatTokensPerSecond(null)).toBe("—");
  });

  it("ignores non-numeric usage fields", () => {
    const m = computeMetrics({ usage : { prompt_tokens : "lots" }, durationMs : 1000 });
    expect(m.inputTokens).toBeNull();
    expect(m.tokensPerSecond).toBeNull();
  });
});

describe("aggregateConversationUsage", () => {
  it("sums two OpenAI payloads", () => {
    const out = aggregateConversationUsage([
      { status : "done", usage_json : JSON.stringify({ prompt_tokens : 10, completion_tokens : 5, total_tokens : 15 }) },
      { status : "done", usage_json : JSON.stringify({ prompt_tokens : 20, completion_tokens : 7, total_tokens : 27 }) }
    ]);
    expect(out).toEqual({
      messagesCounted : 2,
      messagesSkipped : 0,
      inputTokens : 30,
      outputTokens : 12,
      reasoningTokens : null,
      totalTokens : 42,
      hasPartialData : false
    });
  });

  it("skips cancelled and streaming rows", () => {
    const out = aggregateConversationUsage([
      { status : "cancelled", usage_json : JSON.stringify({ prompt_tokens : 99 }) },
      { status : "streaming", usage_json : JSON.stringify({ prompt_tokens : 99 }) }
    ]);
    expect(out.messagesCounted).toBe(0);
    expect(out.messagesSkipped).toBe(2);
    expect(out.inputTokens).toBeNull();
  });

  it("marks partial when usage is missing", () => {
    const out = aggregateConversationUsage([{ status : "done", usage_json : null }]);
    expect(out.hasPartialData).toBe(true);
    expect(out.messagesSkipped).toBe(1);
  });

  it("marks partial on invalid JSON", () => {
    const out = aggregateConversationUsage([{ status : "done", usage_json : "not json" }]);
    expect(out.hasPartialData).toBe(true);
    expect(out.messagesSkipped).toBe(1);
  });

  it("sums reasoning tokens and flags missing columns", () => {
    const out = aggregateConversationUsage([
      {
        status : "done",
        usage_json : JSON.stringify({
          prompt_tokens : 10,
          completion_tokens : 5,
          total_tokens : 15,
          completion_tokens_details : { reasoning_tokens : 3 }
        })
      },
      { status : "done", usage_json : JSON.stringify({ completion_tokens : 4 }) }
    ]);
    expect(out.inputTokens).toBe(10);
    expect(out.outputTokens).toBe(9);
    expect(out.reasoningTokens).toBe(3);
    expect(out.hasPartialData).toBe(true);
  });
});
