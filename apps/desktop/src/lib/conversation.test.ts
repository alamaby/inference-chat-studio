import { describe, expect, it } from "vitest";
import { decodeContent, toChatMsg } from "./conversation";

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
        role : "assistant",
        content_json : JSON.stringify("x"),
        provider_id : "p1",
        model_id : "m1",
        status : "done"
      })
    ).toEqual({
      role : "assistant",
      content : "x",
      model : "m1",
      providerId : "p1",
      status : "done"
    });
  });
});
