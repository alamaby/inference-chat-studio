import ReactMarkdown from "react-markdown";
import { useProviderStore } from "../stores/providerStore";
import { btn, code, hintText } from "../lib/ui";

export function MessageList() {
  const messages = useProviderStore((s) => s.messages);

  async function copy(text : string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard unavailable in some WebView contexts; ignore.
    }
  }

  if (messages.length === 0) {
    return <p className={hintText}>No messages yet. Send the first one below.</p>;
  }

  return (
    <div className="grid gap-3">
      {messages.map((m, i) => (
        <article
          key={i}
          className={`rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed ${
            m.role === "user"
              ? "ml-12 border-brand-100 bg-brand-50 dark:border-brand-700/40 dark:bg-brand-700/15"
              : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          }`}
        >
          <header className="mb-1 flex items-baseline gap-2">
            <strong className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {m.role}
            </strong>
            {m.model && <code className={code}>{m.model}</code>}
            {m.status && m.status !== "done" && (
              <span className="text-xs text-slate-500">({m.status})</span>
            )}
            <button onClick={() => void copy(m.content)} className={`${btn} ml-auto !px-2 !py-0.5 !text-xs`}>
              Copy
            </button>
          </header>
          <div className="prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{m.content}</ReactMarkdown>
          </div>
        </article>
      ))}
    </div>
  );
}
