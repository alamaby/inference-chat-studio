import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github-dark.css";
import { useProviderStore } from "../stores/providerStore";
import { formatMessageTime } from "../lib/conversation";
import { bookmarkLabel, normalizeAnchor } from "../lib/bookmark";
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

interface MenuState {
  messageId : string;
  text : string;
  x : number;
  y : number;
}

export function MessageList() {
  const messages = useProviderStore((s) => s.messages);
  const createBookmark = useProviderStore((s) => s.createBookmark);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    if (!menu) {
      return;
    }
    function close() {
      setMenu(null);
    }
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  // Ctrl+B (see App.tsx): bookmark the current text selection without the
  // right-click menu. Mirrors `bookmarkHere` below, minus the menu — the
  // selection itself provides the message context.
  useEffect(() => {
    function onBookmarkShortcut() {
      const sel = window.getSelection();
      const text = sel?.toString() ?? "";
      if (!sel || sel.isCollapsed || !text.trim()) {
        return;
      }
      const node = sel.anchorNode?.parentElement ?? null;
      const article = node?.closest?.("[data-message-id]") as HTMLElement | null;
      const messageId = article?.getAttribute("data-message-id") ?? null;
      if (!messageId) {
        return;
      }
      const anchor = normalizeAnchor(text).slice(0, 200);
      void createBookmark(messageId, bookmarkLabel(text), anchor)
        .then(() => sel.removeAllRanges())
        .catch(() => undefined);
    }
    window.addEventListener("ics:bookmark-from-selection", onBookmarkShortcut);
    return () => window.removeEventListener("ics:bookmark-from-selection", onBookmarkShortcut);
  }, [createBookmark]);

  async function copy(text : string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard unavailable in some WebView contexts; ignore.
    }
  }

  /**
   * Custom right-click menu on persisted assistant messages. The WebView has
   * no native context menu, so selection actions live here.
   */
  function onContextMenu(e : React.MouseEvent, messageId : string | undefined) {
    if (!messageId) {
      return;
    }
    const sel = window.getSelection();
    const text = sel?.toString() ?? "";
    if (!sel || sel.isCollapsed || !text.trim()) {
      return;
    }
    e.preventDefault();
    setMenu({ messageId, text, x : e.clientX, y : e.clientY });
  }

  async function bookmarkHere() {
    if (!menu) {
      return;
    }
    const anchor = normalizeAnchor(menu.text).slice(0, 200);
    await createBookmark(menu.messageId, bookmarkLabel(menu.text), anchor).catch(() => undefined);
    window.getSelection()?.removeAllRanges();
    setMenu(null);
  }

  if (messages.length === 0) {
    return <p className={hintText}>No messages yet. Send the first one below.</p>;
  }

  return (
    <div className="grid gap-3">
      {messages.map((m, i) => (
        <article
          key={m.id ?? i}
          data-message-id={m.id}
          onContextMenu={(e) => onContextMenu(e, m.role === "assistant" ? m.id : undefined)}
          title={m.id ? "Right-click selected text to bookmark it" : undefined}
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
            {m.timestamp && (
              <span className="text-xs text-slate-400" title={m.timestamp}>
                {formatMessageTime(m.timestamp)}
              </span>
            )}
            {m.status && m.status !== "done" && (
              <span className="text-xs text-slate-500">({m.status})</span>
            )}
            <button onClick={() => void copy(m.content)} className={`${btn} ml-auto !px-2 !py-0.5 !text-xs`}>
              Copy
            </button>
          </header>
          <div className="prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre : CodeBlock }}>{m.content}</ReactMarkdown>
          </div>
          {m.status === "streaming" && (
            <span aria-label="generating" className="streaming-caret text-brand-600 dark:text-brand-100">▍</span>
          )}
        </article>
      ))}
      {menu && (
        <div
          className="fixed z-50 min-w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          style={{ left : menu.x, top : menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => void bookmarkHere()}
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Bookmark here
          </button>
          <button
            onClick={() => {
              void copy(menu.text);
              setMenu(null);
            }}
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Copy selection
          </button>
        </div>
      )}
    </div>
  );
}
