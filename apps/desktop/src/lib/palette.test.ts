import { describe, expect, it } from "vitest";
import { buildPaletteItems, filterPalette } from "./palette";
import { defaultCapabilities } from "./reasoning";

describe("buildPaletteItems", () => {
  it("lists actions plus one entry per model", () => {
    const items = buildPaletteItems(
      [{ id : "p1", name : "P1", compatibility_type : "openai", api_mode : "chat_completions", base_url : "http://x", enabled : true, created_at : "", updated_at : "" }],
      { p1 : [{ remote_model_id : "m1", display_name : "M One", capabilities : defaultCapabilities() }] }
    );
    expect(items.map((i) => i.id)).toEqual([
      "action:new-conversation",
      "action:devtools",
      "model:p1:m1"
    ]);
    expect(items[2].subtitle).toBe("P1");
  });
});

describe("filterPalette", () => {
  const items = buildPaletteItems(
    [{ id : "p1", name : "Electron", compatibility_type : "openai", api_mode : "chat_completions", base_url : "http://x", enabled : true, created_at : "", updated_at : "" }],
    { p1 : [{ remote_model_id : "gpt-oss-20b:free", display_name : null, capabilities : defaultCapabilities() }] }
  );

  it("matches model ids case-insensitively", () => {
    expect(filterPalette(items, "OSS").map((i) => i.id)).toEqual(["model:p1:gpt-oss-20b:free"]);
  });

  it("matches provider names via subtitle", () => {
    expect(filterPalette(items, "electron").length).toBe(1);
  });

  it("returns everything on empty query and nothing on no match", () => {
    expect(filterPalette(items, "").length).toBe(3);
    expect(filterPalette(items, "zzz-nope")).toEqual([]);
  });
});
