import ReactMarkdown from "react-markdown";
import { useProviderStore } from "../stores/providerStore";

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
    return <p style={{ opacity : 0.7 }}>No messages yet. Send the first one below.</p>;
  }

  return (
    <div style={{ display : "grid", gap : 12 }}>
      {messages.map((m, i) => (
        <article key={i} style={{ border : "1px solid #eee", borderRadius : 8, padding : 10 }}>
          <header style={{ display : "flex", gap : 8, alignItems : "baseline" }}>
            <strong>{m.role}</strong>
            {m.model && <code style={{ fontSize : 12 }}>{m.model}</code>}
            {m.status && m.status !== "done" && <span>({m.status})</span>}
            <button style={{ marginLeft : "auto" }} onClick={() => void copy(m.content)}>
              Copy
            </button>
          </header>
          <ReactMarkdown>{m.content}</ReactMarkdown>
        </article>
      ))}
    </div>
  );
}
