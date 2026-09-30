import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import "highlight.js/styles/github-dark.css";
import { useProviderStore } from "../stores/providerStore";
import { highlightCode, parseCodeLanguage } from "../lib/codeblock";
import { btn, code, hintText } from "../lib/ui";

function CodeBlock({ children } : { children? : React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  let language: string | null = null;
  let source = "";
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === "code") {
      const props = child.props as { className? : string; children? : React.ReactNode };
      language = parseCodeLanguage(props.className);
      source = String(props.children ?? "");
    }
  });
  const { html, language : lang } = highlightCode(source, language);

  async function copy() {
    try {
      await navigator.clipboard.writeText(source.replace(/\n$/, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable in some WebView contexts; ignore.
    }
  }

  return (
    <figure className="overflow-hidden rounded-lg border border-slate-700">
      <figcaption className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
        <span className="font-mono">{lang}</span>
        <button onClick={() => void copy()} className="ml-auto rounded px-2 py-0.5 transition-colors hover:bg-slate-700">
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="overflow-auto bg-slate-900 p-3 text-[13px] leading-relaxed">
        <code
          className={`hljs language-${lang}`}
          dangerouslySetInnerHTML={{ __html : html }}
        />
      </pre>
    </figure>
  );
}

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
          className={`message-in rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed ${
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
            <ReactMarkdown components={{ pre : CodeBlock }}>{m.content}</ReactMarkdown>
          </div>
          {m.status === "streaming" && (
            <span aria-label="generating" className="streaming-caret text-brand-600 dark:text-brand-100">▍</span>
          )}
        </article>
      ))}
    </div>
  );
}
