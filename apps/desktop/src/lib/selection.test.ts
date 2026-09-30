import { describe, expect, it } from "vitest";
import { resolveSelection } from "./selection";
import { defaultCapabilities } from "./reasoning";
import type { ModelInfo, ProviderDto } from "../../../../packages/api-types/src/index";

function provider(id : string): ProviderDto {
  return {
    id,
    name : id,
    compatibility_type : "openai",
    api_mode : "chat_completions",
    base_url : "http://x/v1",
    enabled : true,
    created_at : "",
    updated_at : ""
  };
}

function model(id : string): ModelInfo {
  return { remote_model_id : id, display_name : id, capabilities : defaultCapabilities() };
}

describe("resolveSelection", () => {
  it("auto-selects the first provider and model from empty state", () => {
    const sel = resolveSelection(
      [provider("p1")],
      { p1 : [model("m1"), model("m2")] },
      null,
      null
    );
    expect(sel).toEqual({ activeProviderId : "p1", activeModelId : "m1" });
  });

  it("preserves a valid existing selection", () => {
    const sel = resolveSelection(
      [provider("p1"), provider("p2")],
      { p1 : [model("m1")], p2 : [model("m2")] },
      "p2",
      "m2"
    );
    expect(sel).toEqual({ activeProviderId : "p2", activeModelId : "m2" });
  });

  it("falls back when the selected provider or model vanished", () => {
    const sel = resolveSelection(
      [provider("p1")],
      { p1 : [model("m9")] },
      "gone",
      "also-gone"
    );
    expect(sel).toEqual({ activeProviderId : "p1", activeModelId : "m9" });
  });

  it("returns nulls when no providers exist", () => {
    expect(resolveSelection([], {}, null, null)).toEqual({
      activeProviderId : null,
      activeModelId : null
    });
  });
});
