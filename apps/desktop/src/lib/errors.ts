/**
 * Format an IPC rejection for display.
 *
 * Tauri v2 rejects `invoke` with the serialized Rust error value, which for
 * our commands is an object shaped `{ code: string, message: string }` —
 * not an `Error` instance. Naive `String(e)` renders that as the useless
 * "[object Object]".
 */
export function formatIpcError(e : unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  if (typeof e === "string") {
    return e;
  }
  if (e !== null && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const prefix = typeof o["code"] === "string" ? `[${o["code"]}] ` : "";
    if (typeof o["message"] === "string") {
      return `${prefix}${o["message"]}`;
    }
    if (typeof o["error"] === "string") {
      return `${prefix}${o["error"]}`;
    }
    try {
      return JSON.stringify(o);
    } catch {
      return "[unprintable error]";
    }
  }
  return String(e);
}
