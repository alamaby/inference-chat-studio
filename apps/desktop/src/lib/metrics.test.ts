import { describe, expect, it } from "vitest";
import { computeMetrics, formatTokensPerSecond } from "./metrics";

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
