import { describe, expect, it } from "vitest";
import { maskHeaders, truncateRaw } from "./inspector";

describe("maskHeaders", () => {
  it("redacts authorization and secret headers", () => {
    const masked = maskHeaders({
      authorization : "Bearer x",
      "X-Custom-Secret" : "s3cr3t",
      "Content-Type" : "application/json"
    });
    expect(masked["authorization"]).toBe("[REDACTED]");
    expect(masked["X-Custom-Secret"]).toBe("[REDACTED]");
    expect(masked["Content-Type"]).toBe("application/json");
  });
});

describe("truncateRaw", () => {
  it("passes short bodies through untouched", () => {
    const { text, truncated } = truncateRaw("{\"ok\":true}");
    expect(truncated).toBe(false);
    expect(text).toBe("{\"ok\":true}");
  });

  it("truncates long bodies with a label", () => {
    const { text, truncated } = truncateRaw("a".repeat(25_000));
    expect(truncated).toBe(true);
    expect(text.endsWith("[truncated]")).toBe(true);
    expect(text.length).toBeLessThan(25_000);
  });
});
