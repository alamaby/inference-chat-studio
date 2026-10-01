import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { formatIpcError } from "../lib/errors";
import {
  buildSingleConversationJson,
  buildSingleConversationMarkdown,
  buildSingleExportFilename,
  downloadTextFile
} from "../lib/singleExport";
import type { ChatDoneEvent, ChatErrorEvent } from "../../../../packages/api-types/src/index";
import { useProviderStore } from "../stores/providerStore";
import { availableReasoningOptions } from "../lib/reasoning";
import { MessageList } from "./MessageList";
import { ConversationUsage } from "./ConversationUsage";
import { Inspector, type InspectorProps } from "./Inspector";

export function ChatView() {
  const {
    providers,
    activeProviderId,
    activeModelId,
    setActive,
    reasoningLevel,
    customReasoningJson,
    systemPrompt,
    temperature,
    maxOutput,
    modelsByProvider,
    streaming,
    error,
    setStreaming,
    setError,
    setMessages,
    activeConversationId
  } = useProviderStore();
  const messages = useProviderStore((s) => s.messages);
  const [draft, setDraft] = useState("");
  const [activeStream, setActiveStream] = useState<string | null>(null);
  const [lastDiagnostics, setLastDiagnostics] = useState<InspectorProps | null>(null);
  const [stuckToBottom, setStuckToBottom] = useState(true);
  const historyRef = useRef<string[]>([]);
  const historyIdx = useRef<number>(-1);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // Guards against double-processing one backend event when two listeners
  // are briefly alive (React StrictMode remounts effects; the async
  // `listen()` promise can resolve after cleanup ran).
  const handledStreamsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let unlistenDone: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    void listen<ChatDoneEvent>("chat-done", (event) => {
      const done = event.payload;
      if (handledStreamsRef.current.has(done.stream_id)) {
        return;
      }
      handledStreamsRef.current.add(done.stream_id);
      setMessages([
        ...useProviderStore.getState().messages.filter((m) => m.status !== "streaming"),
        {
          id : done.message_id,
          role : "assistant",
          content : done.text,
          model : done.model,
          providerId : useProviderStore.getState().activeProviderId ?? undefined,
          status : "done",
          timestamp : done.created_at
        }
      ]);
      setLastDiagnostics({
        url : done.request_url,
        method : "POST",
        requestBody : { model : done.model },
        compatibility : "chat_completions",
        modelName : done.model,
        statusCode : done.status_code,
        responseHeaders : null,
        usage : done.usage,
        durationMs : done.duration_ms,
        ttftMs : done.ttft_ms,
        finishReason : done.finish_reason,
        requestId : null,
        rawBody : done.usage ? JSON.stringify(done.usage) : null,
        eventCount : null,
        cancelled : false
      });
      setStreaming(false);
      setActiveStream(null);
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenDone = fn;
      }
    });
    void listen<ChatErrorEvent>("chat-error", (event) => {
      setMessages(
        useProviderStore.getState().messages.filter((m) => m.status !== "streaming")
      );
      setError(`[${event.payload.code}] ${event.payload.message}`);
      if (event.payload.request_url) {
        setLastDiagnostics({
          url : event.payload.request_url,
          method : "POST",
          requestBody : event.payload.request_body ?? null,
          compatibility : "chat_completions",
          modelName : useProviderStore.getState().activeModelId,
          statusCode : null,
          responseHeaders : null,
          usage : null,
          durationMs : null,
          ttftMs : null,
          finishReason : null,
          requestId : null,
          rawBody : `[${event.payload.code}] ${event.payload.message}`,
          eventCount : null,
          cancelled : false
        });
      }
      setStreaming(false);
      setActiveStream(null);
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenError = fn;
      }
    });
    return () => {
      cancelled = true;
      unlistenDone?.();
      unlistenError?.();
    };
  }, [setError, setMessages, setStreaming]);

  // Composer autogrow (capped): keeps short prompts compact while long
  // pastes stay usable without manual resizing.
  useEffect(() => {
    const el = composerRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    }
  }, [draft]);

  // Smart auto-scroll: follow new messages only while the user is already
  // near the bottom. Reading history never yanks the viewport.
  useEffect(() => {
    const el = document.getElementById("chat-scroll");
    if (el && stuckToBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streaming, stuckToBottom]);

  useEffect(() => {
    const el = document.getElementById("chat-scroll");
    if (!el) {
      return;
    }
    function onScroll() {
      setStuckToBottom(el!.scrollHeight - el!.scrollTop - el!.clientHeight < 120);
    }
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToBottom() {
    const el = document.getElementById("chat-scroll");
    if (el) {
      el.scrollTop = el.scrollHeight;
      setStuckToBottom(true);
    }
  }
  const caps = activeProviderId
    ? (modelsByProvider[activeProviderId] ?? []).find((m) => m.remote_model_id === activeModelId)?.capabilities ?? null
    : null;
  const { supported } = availableReasoningOptions(caps);
  const reasoningBlocked =
    !!caps && !supported && reasoningLevel !== "Automatic" && reasoningLevel !== "None";
  const canSend =
    !!activeProviderId && !!activeModelId && draft.trim().length > 0 && !streaming && !reasoningBlocked;
  const sendBlockers: string[] = [];
  if (!activeProviderId || !activeModelId) {
    sendBlockers.push("Select a provider and model first.");
  }
  if (streaming) {
    sendBlockers.push("Waiting for the current response — Stop it to send again.");
  }
  if (reasoningBlocked) {
    sendBlockers.push("Reasoning effort is not supported by this model.");
  }

  async function send() {
    const text = draft.trim();
    if (!text || !canSend) {
      return;
    }
    await sendText(text);
  }

  /**
   * Send an explicit text, bypassing the composer draft.
   * Retry uses this so it resends the last user message instead of the
   * (already cleared) draft — previously Retry only cleared the error.
   */
  async function sendText(text : string) {
    setError(null);
    if (!activeProviderId || !activeModelId || streaming || reasoningBlocked) {
      return;
    }
    // Never send under a placeholder id: without a real conversation row the
    // backend message insert would fail its foreign key. Auto-create instead.
    let conversationId = useProviderStore.getState().activeConversationId;
    if (!conversationId) {
      try {
        conversationId = await useProviderStore.getState().newConversation("New conversation");
      } catch (e) {
        setError(formatIpcError(e));
        return;
      }
    }
    if (historyRef.current[historyRef.current.length - 1] !== text) {
      historyRef.current.push(text);
    }
    historyIdx.current = historyRef.current.length;
    setDraft("");
    // Persist UI settings with the conversation (best effort: a settings
    // failure must never block the send itself).
    await useProviderStore.getState().saveConversationSettings(conversationId).catch(() => undefined);

    let customJson: unknown = null;
    if (reasoningLevel === "Custom") {
      try {
        customJson = JSON.parse(customReasoningJson);
      } catch {
        setError("Custom reasoning JSON is invalid.");
        return;
      }
    }

    const history = [...messages, { role : "user", content : text }];
    const sentAt = new Date().toISOString();
    setMessages([
      ...messages,
      { role : "user", content : text, model : activeModelId, providerId : activeProviderId, status : "done", timestamp : sentAt },
      { role : "assistant", content : "Waiting for response…", model : activeModelId, providerId : activeProviderId, status : "streaming", timestamp : sentAt }
    ]);
    setStreaming(true);
    try {
      const streamId = await invoke<string>("stream_chat_cmd", {
        input : {
          conversation_id : conversationId,
          provider_id : activeProviderId,
          model : activeModelId,
          messages : history.map((m) => ({ role : m.role, content : m.content })),
          system_prompt : systemPrompt || null,
          temperature,
          max_output_tokens : maxOutput,
          reasoning_level : reasoningLevel,
          reasoning_custom_json : customJson,
          timeout_ms : 60000
        }
      });
      setActiveStream(streamId);
    } catch (e) {
      setMessages(messages);
      setError(formatIpcError(e));
      setStreaming(false);
    }
  }

  /**
   * Resend the last user message. Used by the Retry button: the composer
   * draft is already cleared at this point, so reusing it would no-op.
   */
  async function retry() {
    const msgs = useProviderStore.getState().messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        await sendText(msgs[i].content);
        return;
      }
    }
  }
  async function stop() {
    if (activeStream) {
      await invoke("cancel_stream", { streamId : activeStream }).catch(() => undefined);
    }
    setStreaming(false);
  }

  /**
   * Export the active conversation as Markdown or JSON, entirely from store
   * state (no IPC): sharing/debugging without a full backup round-trip.
   */
  async function exportSingle(ext : "md" | "json") {
    const s = useProviderStore.getState();
    const conv = s.conversations.find((c) => c.id === s.activeConversationId);
    if (!conv) {
      setError("Select a conversation first.");
      return;
    }
    try {
      const input = {
        conversation : {
          id : conv.id,
          title : conv.title,
          provider_id : conv.provider_id ?? null,
          default_model_id : conv.default_model_id ?? null,
          system_prompt : conv.system_prompt ?? null,
          created_at : "",
          updated_at : ""
        },
        messages : s.messages,
        bookmarks : s.bookmarks,
        exportedAt : new Date().toISOString()
      };
      const text = ext === "md" ? buildSingleConversationMarkdown(input) : buildSingleConversationJson(input);
      downloadTextFile(
        buildSingleExportFilename(conv.title, ext),
        text,
        ext === "md" ? "text/markdown" : "application/json"
      );
    } catch (e) {
      setError(formatIpcError(e));
    }
  }

  function onKeyDown(e : React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    } else if (e.key === "ArrowUp" && draft === "" && historyRef.current.length > 0) {
      e.preventDefault();
      historyIdx.current = Math.max(0, historyIdx.current - 1);
      setDraft(historyRef.current[historyIdx.current] ?? "");
    }
  }

  return (
    <section className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <MessageList />
      {reasoningBlocked && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          Reasoning effort is not supported by this model — switch to Automatic/None or pick another model.
        </p>
      )}
      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <p className="min-w-0 flex-1">
            {error} <button onClick={() => void retry()} className="ml-2 rounded-lg border border-red-300 px-2 py-0.5 font-medium transition-colors hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900">Retry</button>
          </p>
          <button onClick={() => setError(null)} title="Dismiss" className="rounded px-1.5 hover:bg-red-100 dark:hover:bg-red-900">×</button>
        </div>
      )}
      {!canSend && sendBlockers.length > 0 && (
        <ul className="mb-0 mt-2 list-disc pl-5 text-sm text-amber-700 dark:text-amber-400">
          {sendBlockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <select
          value={activeProviderId ?? ""}
          onChange={(e) => setActive(e.target.value || null, null)}
          title="Active provider"
          className="max-w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={activeModelId ?? ""}
          onChange={(e) => setActive(activeProviderId, e.target.value || null)}
          title="Active model"
          className="max-w-56 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="">Select model…</option>
          {(activeProviderId ? (modelsByProvider[activeProviderId] ?? []) : []).map((m) => (
            <option key={m.remote_model_id} value={m.remote_model_id}>
              {m.display_name ?? m.remote_model_id}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => void exportSingle("md")}
          disabled={!activeConversationId}
          title={activeConversationId ? "Export active conversation as Markdown" : "Select a conversation first"}
          className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Export MD
        </button>
        <button
          onClick={() => void exportSingle("json")}
          disabled={!activeConversationId}
          title={activeConversationId ? "Export active conversation as JSON" : "Select a conversation first"}
          className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Export JSON
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline, Ctrl+K for quick switch)"
          className="max-h-[240px] w-full flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-800 dark:focus:ring-brand-700"
        />
        {streaming
          ? <button onClick={() => void stop()} className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700">Stop</button>
          : <button onClick={() => void send()} disabled={!canSend} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-brand-500 dark:hover:bg-brand-600">Send</button>}
      </div>
      {lastDiagnostics && <Inspector {...lastDiagnostics} />}
      <ConversationUsage conversationId={activeConversationId} />
      {!stuckToBottom && messages.length > 0 && (
        <button
          onClick={scrollToBottom}
          title="Jump to latest"
          className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm shadow-md transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          ↓ Latest
        </button>
      )}
    </section>
  );
}
