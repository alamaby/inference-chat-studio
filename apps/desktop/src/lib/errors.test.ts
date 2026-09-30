import { describe, expect, it } from "vitest";
import { formatIpcError } from "./errors";

describe("formatIpcError", () => {
  it("renders Tauri IPC rejection objects with code and message", () => {
    expect(formatIpcError({ code : "unauthorized", message : "bad key" })).toBe(
      "[unauthorized] bad key"
    );
  });

  it("renders plain Errors by message", () => {
    expect(formatIpcError(new Error("boom"))).toBe("boom");
  });

  it("passes strings through and never returns [object Object]", () => {
    expect(formatIpcError("plain")).toBe("plain");
    expect(formatIpcError({ code : "x" })).not.toBe("[object Object]");
  });
});
