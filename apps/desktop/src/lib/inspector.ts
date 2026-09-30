/**
 * Mask secret-bearing headers for display and logs.
 * Mirrors the Rust `mask_headers` helper (src-tauri/src/ipc.rs).
 */
export function maskHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (
      key.toLowerCase() === "authorization" ||
      key.toLowerCase().includes("secret")
    ) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

export const RAW_BODY_LIMIT = 20_000;

export function truncateRaw(body: string, limit: number = RAW_BODY_LIMIT): {
  text : string;
  truncated : boolean;
} {
  if (body.length <= limit) {
    return { text : body, truncated : false };
  }
  return { text : `${body.slice(0, limit)}…[truncated]`, truncated : true };
}
