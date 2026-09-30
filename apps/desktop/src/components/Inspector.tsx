import { useState } from "react";
import { maskHeaders, truncateRaw } from "../lib/inspector";
import { btn, code } from "../lib/ui";

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

function Stat({ k, v } : { k : string; v : string }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 font-medium text-slate-500 dark:text-slate-400">{k}</span>
      <code className={`${code} break-all`}>{v}</code>
    </div>
  );
}

export function Inspector(props : InspectorProps) {
  const [tab, setTab] = useState<"request" | "response">("request");
  const [open, setOpen] = useState(false);
  const masked = maskHeaders(props.responseHeaders ?? {});

  async function copy(text : string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore clipboard failures in WebView
    }
  }

  const { text : rawText, truncated } = truncateRaw(props.rawBody ?? "");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`${btn} mt-2 !text-xs`}>
        Show request inspector
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px] dark:border-slate-700 dark:bg-slate-800/50">
      <div className="mb-2 flex gap-2">
        <button onClick={() => setTab("request")} disabled={tab === "request"} className={btn}>Request</button>
        <button onClick={() => setTab("response")} disabled={tab === "response"} className={btn}>Response</button>
        {props.cancelled && <span className="text-red-600 dark:text-red-400">(cancelled — partial duration)</span>}
        <button onClick={() => setOpen(false)} className={`${btn} ml-auto`}>Hide</button>
      </div>
      {tab === "request" ? (
        <div className="grid gap-1.5">
          <Stat k="URL" v={props.url} />
          <Stat k="Method" v={props.method} />
          <Stat k="Compatibility" v={props.compatibility} />
          <Stat k="Headers" v="Authorization: [REDACTED]" />
          <pre className="overflow-auto rounded-lg bg-slate-900 p-2.5 font-mono text-xs text-slate-100 dark:bg-black/40">
            {JSON.stringify(props.requestBody, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Stat k="Status" v={props.statusCode != null ? String(props.statusCode) : "—"} />
          <Stat k="TTFT" v={props.ttftMs != null ? `${props.ttftMs} ms` : "—"} />
          <Stat k="Duration" v={props.durationMs != null ? `${props.durationMs} ms` : "—"} />
          <Stat k="Finish reason" v={props.finishReason ?? "—"} />
          <Stat k="Usage" v={props.usage ? JSON.stringify(props.usage) : "—"} />
          <Stat k="Request ID" v={props.requestId ?? "—"} />
          <Stat k="Events" v={props.eventCount != null ? String(props.eventCount) : "—"} />
          <div className="font-medium text-slate-500 dark:text-slate-400">Headers (masked)</div>
          <pre className="overflow-auto rounded-lg bg-slate-900 p-2.5 font-mono text-xs text-slate-100 dark:bg-black/40">
            {JSON.stringify(masked, null, 2)}
          </pre>
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-500 dark:text-slate-400">
              Raw body{truncated ? " (truncated)" : ""}
            </span>
            <button onClick={() => void copy(rawText)} className={btn}>Copy</button>
          </div>
          <pre className="max-h-60 overflow-auto rounded-lg bg-slate-900 p-2.5 font-mono text-xs text-slate-100 dark:bg-black/40">
            {rawText || "—"}
          </pre>
        </div>
      )}
    </div>
  );
}
