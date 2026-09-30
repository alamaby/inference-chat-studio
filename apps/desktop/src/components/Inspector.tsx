import { useState } from "react";
import { maskHeaders, truncateRaw } from "../lib/inspector";

export interface InspectorProps {
  url : string;
  method : string;
  requestBody : unknown;
  compatibility : string;
  statusCode? : number | null;
  responseHeaders? : Record<string, string> | null;
  usage? : unknown;
  durationMs? : number | null;
  ttftMs? : number | null;
  finishReason? : string | null;
  requestId? : string | null;
  rawBody? : string | null;
  eventCount? : number | null;
  cancelled? : boolean;
}

export function Inspector(props : InspectorProps) {
  const [tab, setTab] = useState<"request" | "response">("request");
  const masked = maskHeaders(props.responseHeaders ?? {});

  async function copy(text : string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore clipboard failures in WebView
    }
  }

  const { text : rawText, truncated } = truncateRaw(props.rawBody ?? "");

  return (
    <div style={{ border : "1px solid #ddd", borderRadius : 8, padding : 10, marginTop : 8 }}>
      <div style={{ display : "flex", gap : 8, marginBottom : 8 }}>
        <button onClick={() => setTab("request")} disabled={tab === "request"}>Request</button>
        <button onClick={() => setTab("response")} disabled={tab === "response"}>Response</button>
        {props.cancelled && <span style={{ color : "crimson" }}>(cancelled — partial duration)</span>}
      </div>
      {tab === "request" ? (
        <div style={{ fontSize : 13 }}>
          <div><strong>URL:</strong> <code>{props.url}</code></div>
          <div><strong>Method:</strong> <code>{props.method}</code></div>
          <div><strong>Compatibility:</strong> <code>{props.compatibility}</code></div>
          <div><strong>Headers:</strong> <code>Authorization: [REDACTED]</code></div>
          <pre style={{ background : "#f6f6f6", padding : 8, overflow : "auto" }}>
            {JSON.stringify(props.requestBody, null, 2)}
          </pre>
        </div>
      ) : (
        <div style={{ fontSize : 13 }}>
          <div><strong>Status:</strong> <code>{props.statusCode ?? "—"}</code></div>
          <div><strong>TTFT:</strong> <code>{props.ttftMs != null ? `${props.ttftMs} ms` : "—"}</code></div>
          <div><strong>Duration:</strong> <code>{props.durationMs != null ? `${props.durationMs} ms` : "—"}</code></div>
          <div><strong>Finish reason:</strong> <code>{props.finishReason ?? "—"}</code></div>
          <div><strong>Usage:</strong> <code>{props.usage ? JSON.stringify(props.usage) : "—"}</code></div>
          <div><strong>Request ID:</strong> <code>{props.requestId ?? "—"}</code></div>
          <div><strong>Events:</strong> <code>{props.eventCount ?? "—"}</code></div>
          <div><strong>Headers (masked):</strong></div>
          <pre style={{ background : "#f6f6f6", padding : 8, overflow : "auto" }}>
            {JSON.stringify(masked, null, 2)}
          </pre>
          <div>
            <strong>Raw body{truncated ? " (truncated)" : ""}:</strong>{" "}
            <button onClick={() => void copy(rawText)}>Copy</button>
          </div>
          <pre style={{ background : "#f6f6f6", padding : 8, overflow : "auto", maxHeight : 240 }}>
            {rawText || "—"}
          </pre>
        </div>
      )}
    </div>
  );
}
