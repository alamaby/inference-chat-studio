import { describe, expect, it } from "vitest";
import {
  decodeContent,
  parseConversationSettings,
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
        status : "done"
      })
    ).toEqual({
      id : "msg-1",
      role : "assistant",
      content : "x",
      model : "m1",
      providerId : "p1",
      status : "done"
    });
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
