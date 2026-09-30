import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { formatIpcError } from "../lib/errors";
import type { ChatDoneEvent, ChatErrorEvent } from "../../../../packages/api-types/src/index";
import { useProviderStore } from "../stores/providerStore";
import { availableReasoningOptions } from "../lib/reasoning";
import { MessageList } from "./MessageList";
import { Inspector, type InspectorProps } from "./Inspector";

export function ChatView() {
  const {
    activeProviderId,
    activeModelId,
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
    setMessages
  } = useProviderStore();
  const messages = useProviderStore((s) => s.messages);
  const [draft, setDraft] = useState("");
  const [activeStream, setActiveStream] = useState<string | null>(null);
  const [lastDiagnostics, setLastDiagnostics] = useState<InspectorProps | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIdx = useRef<number>(-1);

  useEffect(() => {
    let unlistenDone: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    void listen<ChatDoneEvent>("chat-done", (event) => {
      const done = event.payload;
      setMessages([
        ...useProviderStore.getState().messages.filter((m) => m.status !== "streaming"),
        {
          role : "assistant",
          content : done.text,
          model : done.model,
          providerId : useProviderStore.getState().activeProviderId ?? undefined,
          status : "done"
        }
      ]);
      setLastDiagnostics({
        url : done.request_url,
        method : "POST",
        requestBody : { model : done.model },
        compatibility : "chat_completions",
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
      unlistenDone = fn;
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
      unlistenError = fn;
    });
    return () => {
      unlistenDone?.();
      unlistenError?.();
    };
  }, [setError, setMessages, setStreaming]);

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
    setError(null);
    if (!canSend || !activeProviderId || !activeModelId) return;
    const text = draft.trim();
    historyRef.current.push(text);
    historyIdx.current = historyRef.current.length;
    setDraft("");

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
    setMessages([
      ...messages,
      { role : "user", content : text, model : activeModelId, providerId : activeProviderId, status : "done" },
      { role : "assistant", content : "Waiting for response…", model : activeModelId, providerId : activeProviderId, status : "streaming" }
    ]);
    setStreaming(true);
    try {
      const streamId = await invoke<string>("stream_chat_cmd", {
        input : {
          conversation_id : useProviderStore.getState().activeConversationId ?? "local",
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

  async function stop() {
    if (activeStream) {
      await invoke("cancel_stream", { streamId : activeStream }).catch(() => undefined);
    }
    setStreaming(false);
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
    <section style={{ border : "1px solid #ddd", borderRadius : 8, padding : 12 }}>
      <MessageList />
      {reasoningBlocked && (
        <p style={{ color : "crimson" }}>
          Reasoning effort is not supported by this model — switch to Automatic/None or pick another model.
        </p>
      )}
      {error && (
        <p style={{ color : "crimson" }}>
          {error} <button onClick={() => void send()}>Retry</button>
        </p>
      )}
      {!canSend && sendBlockers.length > 0 && (
        <ul style={{ color : "#8a6d00", margin : "8px 0 0", paddingLeft : 18 }}>
          {sendBlockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <div style={{ display : "flex", gap : 8, marginTop : 12 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          style={{ flex : 1 }}
        />
        {streaming
          ? <button onClick={() => void stop()}>Stop</button>
          : <button onClick={() => void send()} disabled={!canSend}>Send</button>}
      </div>
      {lastDiagnostics && <Inspector {...lastDiagnostics} />}
    </section>
  );
}
