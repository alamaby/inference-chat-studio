import { describe, expect, it } from "vitest";
import {
  MAX_TEMPLATES,
  createTemplateItem,
  deleteTemplate,
  upsertTemplate,
  type PromptTemplate
} from "./promptTemplates";

const NOW = "2026-10-01T00:00:00.000Z";

function item(id : string, name = "Code review", updatedAt = NOW): PromptTemplate {
  return { id, name, content : "Review carefully.", createdAt : NOW, updatedAt };
}

describe("prompt templates (pure)", () => {
  it("trims names and rejects empty", () => {
    expect(createTemplateItem("a", "  Review  ", "x", NOW).name).toBe("Review");
    expect(() => createTemplateItem("a", "   ", "x", NOW)).toThrow("Template name must not be empty.");
  });

  it("upserts by id with newest first", () => {
    const next = upsertTemplate([item("a")], { ...item("b"), updatedAt : "2026-10-02T00:00:00.000Z" });
    expect(next.map((t) => t.id)).toEqual(["b", "a"]);
    const replaced = upsertTemplate(next, {
      ...item("a"),
      name : "New",
      updatedAt : "2026-10-03T00:00:00.000Z"
    });
    expect(replaced[0]).toMatchObject({ id : "a", name : "New" });
  });

  it("caps at MAX_TEMPLATES", () => {
    const big : PromptTemplate[] = Array.from(
      { length : MAX_TEMPLATES + 5 },
      (_, i) => item(`id-${i}`)
    );
    expect(upsertTemplate(big, item("new")).length).toBe(MAX_TEMPLATES);
  });

  it("deletes by id", () => {
    expect(deleteTemplate([item("a"), item("b")], "a").map((t) => t.id)).toEqual(["b"]);
  });
});
