import { useState } from "react";
import { useProviderStore } from "../stores/providerStore";
import { btn, btnPrimary, card, hintText, input, sectionTitle, select } from "../lib/ui";

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
    selectConversation,
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
    <section className={card}>
      <h3 className={sectionTitle}>Conversations</h3>
      <div className="mb-2 flex gap-2">
        <input
          placeholder="New conversation title…"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          className={`${input} flex-1`}
        />
        <button onClick={() => void create()} className={btnPrimary}>New</button>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <input
          placeholder="Search…"
          value={conversationSearch}
          onChange={(e) => setConversationSearch(e.target.value)}
          className={`${input} flex-1`}
        />
        <select
          value={conversationFilterProvider ?? ""}
          onChange={(e) => setConversationFilters(e.target.value || null, conversationFilterModel)}
          className={select}
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
          className={input}
        />
      </div>
      <ul className="m-0 space-y-1">
        {visible.map((c) => (
          <li
            key={c.id}
            className={`rounded-lg px-2.5 py-1.5 text-sm ${
              c.id === activeConversationId
                ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-700/20 dark:text-brand-100"
                : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
            }`}
          >
            {renamingId === c.id ? (
              <span className="flex gap-2">
                <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className={`${input} flex-1`} />
                <button onClick={() => void commitRename(c.id)} className={btn}>Save</button>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <button
                  onClick={() => void selectConversation(c.id)}
                  title="Open conversation"
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                >
                  {c.title}
                </button>
                <button onClick={() => { setRenamingId(c.id); setRenameValue(c.title); }} className={btn}>Rename</button>
                <button onClick={() => void deleteConversation(c.id)} className={btn}>Delete</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {visible.length === 0 && <p className={hintText}>No conversations match.</p>}
    </section>
  );
}
