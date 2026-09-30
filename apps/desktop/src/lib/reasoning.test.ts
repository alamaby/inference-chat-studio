import { describe, expect, it } from "vitest";
import { availableReasoningOptions, defaultCapabilities } from "./reasoning";

describe("availableReasoningOptions", () => {
  it("disables concrete levels when the model has no reasoning support", () => {
    const { options, supported } = availableReasoningOptions(defaultCapabilities());
    expect(supported).toBe(false);
    const enabled = options.filter((o) => o.enabled).map((o) => o.level);
    expect(enabled).toEqual(["Automatic", "None", "Custom"]);
    const medium = options.find((o) => o.level === "Medium");
    expect(medium?.enabled).toBe(false);
    expect(medium?.hint).toBe("Not supported by this model");
  });

  it("restricts to the allowlist when one is present", () => {
    const caps = {
      ...defaultCapabilities(),
      supports_reasoning : true,
      allowed_reasoning : ["Low", "High"] as const
    };
    const { options, supported } = availableReasoningOptions({
      ...caps,
      allowed_reasoning : [...caps.allowed_reasoning]
    });
    expect(supported).toBe(true);
    const byLevel = Object.fromEntries(options.map((o) => [o.level, o]));
    expect(byLevel["Low"].enabled).toBe(true);
    expect(byLevel["High"].enabled).toBe(true);
    expect(byLevel["Medium"].enabled).toBe(false);
    expect(byLevel["Medium"].hint).toBe("Not in this model's allowlist");
    expect(byLevel["Automatic"].enabled).toBe(true);
  });

  it("enables everything when reasoning is supported without an allowlist", () => {
    const { options } = availableReasoningOptions({
      ...defaultCapabilities(),
      supports_reasoning : true,
      allowed_reasoning : []
    });
    expect(options.every((o) => o.enabled)).toBe(true);
  });
});
