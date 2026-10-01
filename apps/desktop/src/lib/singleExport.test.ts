import { describe, expect, it } from "vitest";
import {
  buildSingleConversationJson,
  buildSingleConversationMarkdown,
  buildSingleExportFilename,
  type SingleExportInput
} from "./singleExport";

const INPUT: SingleExportInput = {
  conversation : {
    id : "c1",
    title : "Sprint Review!",
    provider_id : "p1",
    default_model_id : "m1",
    system_prompt : null,
    created_at : "t1",
    updated_at : "t2"
  },
  messages : [
    { role : "user", content : "hello", model : "m1", providerId : "p1", status : "done", timestamp : "2026-10-01T00:00:00.000Z" },
    { role : "assistant", content : "hi there", model : "m1", providerId : "p1", status : "done", timestamp : "2026-10-01T00:01:00.000Z" }
  ],
  bookmarks : [],
  exportedAt : "2026-10-01T00:02:00.000Z"
};

describe("single export", () => {
  it("builds a slugged UTC filename", () => {
    expect(buildSingleExportFilename("Sprint Review!", "md", new Date("2026-10-01T01:02:03.000Z")))
      .toBe("ics-chat-sprint-review-20261001-010203.md");
  });

  it("falls back for empty titles", () => {
    expect(buildSingleExportFilename("   ", "json", new Date("2026-10-01T01:02:03.000Z")))
      .toBe("ics-chat-conversation-20261001-010203.json");
  });

  it("json carries format/version plus decoded messages", () => {
    const parsed = JSON.parse(buildSingleConversationJson(INPUT));
    expect(parsed.format).toBe("ics-single-conversation");
    expect(parsed.version).toBe(1);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].content).toBe("hello");
  });

  it("markdown contains headers and message bodies", () => {
    const md = buildSingleConversationMarkdown(INPUT);
    expect(md).toContain("# Sprint Review!");
    expect(md).toContain("### 1. user");
    expect(md).toContain("hello");
    expect(md).toContain("_No bookmarks._");
  });

  it("markdown handles empty messages", () => {
    const md = buildSingleConversationMarkdown({ ...INPUT, messages : [] });
    expect(md).toContain("_No messages._");
  });
});
