import { useState } from "react";
import { useProviderStore } from "../stores/providerStore";

export function ConversationList() {
  const {
    conversations,
    activeConversationId,
    conversationSearch,
    conversationFilterProvider,
    conversationFilterModel,
    providers,
    loadConversations,
    newConversation,
    renameConversation,
    deleteConversation,
    setConversationSearch,
    setConversationFilters
  } = useProviderStore();
  const [draftTitle, setDraftTitle] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const q = conversationSearch.trim().toLowerCase();
  const visible = conversations.filter((c) => {
    if (q && !c.title.toLowerCase().includes(q)) return false;
    if (conversationFilterProvider && c.provider_id !== conversationFilterProvider) return false;
    if (conversationFilterModel && c.default_model_id !== conversationFilterModel) return false;
    return true;
  });

  async function create() {
    await newConversation(draftTitle.trim() || "New conversation");
    setDraftTitle("");
    await loadConversations();
  }

  async function commitRename(id : string) {
    if (renameValue.trim()) {
      await renameConversation(id, renameValue.trim());
    }
    setRenamingId(null);
  }

  return (
    <section style={{ border : "1px solid #ddd", borderRadius : 8, padding : 12, marginBottom : 12 }}>
      <h3 style={{ margin : "0 0 8px" }}>Conversations</h3>
      <div style={{ display : "flex", gap : 8, marginBottom : 8 }}>
        <input
          placeholder="New conversation title…"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          style={{ flex : 1 }}
        />
        <button onClick={() => void create()}>New</button>
      </div>
      <div style={{ display : "flex", gap : 8, marginBottom : 8, flexWrap : "wrap" }}>
        <input
          placeholder="Search…"
          value={conversationSearch}
          onChange={(e) => setConversationSearch(e.target.value)}
        />
        <select
          value={conversationFilterProvider ?? ""}
          onChange={(e) => setConversationFilters(e.target.value || null, conversationFilterModel)}
        >
          <option value="">All providers</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          placeholder="Filter model…"
          value={conversationFilterModel ?? ""}
          onChange={(e) => setConversationFilters(conversationFilterProvider, e.target.value || null)}
        />
      </div>
      <ul style={{ paddingLeft : 18, margin : 0 }}>
        {visible.map((c) => (
          <li key={c.id} style={{ fontWeight : c.id === activeConversationId ? "bold" : "normal" }}>
            {renamingId === c.id ? (
              <>
                <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
                <button onClick={() => void commitRename(c.id)}>Save</button>
              </>
            ) : (
              <>
                {c.title}{" "}
                <button onClick={() => { setRenamingId(c.id); setRenameValue(c.title); }}>
                  Rename
                </button>{" "}
                <button onClick={() => void deleteConversation(c.id)}>Delete</button>
              </>
            )}
          </li>
        ))}
      </ul>
      {visible.length === 0 && <p style={{ opacity : 0.7 }}>No conversations match.</p>}
    </section>
  );
}
