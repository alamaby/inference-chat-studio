import { describe, expect, it } from "vitest";
import {
  decodeContent,
  formatMessageTime,
  parseConversationSettings,
  sanitizeRenameTitle,
  serializeConversationSettings,
  toChatMsg
} from "./conversation";

describe("decodeContent", () => {
  it("decodes assistant JSON-encoded strings", () => {
    expect(decodeContent(JSON.stringify("hello"))).toBe("hello");
  });

  it("decodes user message objects by their content field", () => {
    expect(
      decodeContent(JSON.stringify({ role : "user", content : "hi there" }))
    ).toBe("hi there");
  });

  it("returns anything else verbatim", () => {
    expect(decodeContent("not json at all")).toBe("not json at all");
    expect(decodeContent("null")).toBe("null");
  });
});

describe("toChatMsg", () => {
  it("maps provider/model metadata and drops nulls", () => {
    expect(
      toChatMsg({
        id : "msg-1",
        role : "assistant",
        content_json : JSON.stringify("x"),
        provider_id : "p1",
        model_id : "m1",
        status : "done",
        created_at : "2026-09-30T10:05:00.000Z"
      })
    ).toEqual({
      id : "msg-1",
      role : "assistant",
      content : "x",
      model : "m1",
      providerId : "p1",
      status : "done",
      timestamp : "2026-09-30T10:05:00.000Z"
    });
  });
});

describe("formatMessageTime", () => {
  it("renders today as HH:mm", () => {
    const now = new Date();
    const iso = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      14,
      5
    ).toISOString();
    // toISOString shifts to UTC; only assert shape, not exact digits.
    expect(formatMessageTime(iso)).toMatch(/^\d{1,2}[:.]\d{2}/);
  });

  it("prefixes older dates", () => {
    const out = formatMessageTime("2020-01-02T03:04:00.000Z");
    expect(out.length).toBeGreaterThan(5);
  });

  it("returns empty for missing or invalid input", () => {
    expect(formatMessageTime(null)).toBe("");
    expect(formatMessageTime(undefined)).toBe("");
    expect(formatMessageTime("not-a-date")).toBe("");
  });
});

describe("parseConversationSettings", () => {
  it("round-trips through the serializer", () => {
    const settings = {
      reasoningLevel : "High",
      reasoningCustomJson : "{\"a\":1}",
      temperature : 0.5,
      maxOutput : 1024
    } as const;
    expect(parseConversationSettings(serializeConversationSettings({ ...settings }))).toEqual({
      ...settings
    });
  });

  it("falls back field-by-field on corrupt input", () => {
    expect(parseConversationSettings(null).reasoningLevel).toBe("Automatic");
    expect(parseConversationSettings("not json").temperature).toBeNull();
    const partial = parseConversationSettings(
      JSON.stringify({ reasoning_level : "Bogus", temperature : 0.7 })
    );
    expect(partial.reasoningLevel).toBe("Automatic");
    expect(partial.temperature).toBe(0.7);
  });
});

describe("sanitizeRenameTitle", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitizeRenameTitle("  hi  ")).toBe("hi");
  });

  it("returns null for empty string", () => {
    expect(sanitizeRenameTitle("")).toBeNull();
  });

  it("returns null for whitespace-only", () => {
    expect(sanitizeRenameTitle("   ")).toBeNull();
  });

  it("passes through non-empty titles", () => {
    expect(sanitizeRenameTitle("Sprint 12")).toBe("Sprint 12");
  });
});
