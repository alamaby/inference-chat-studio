import { useState } from "react";
import { useProviderStore } from "../stores/providerStore";
import { sanitizeRenameTitle } from "../lib/conversation";
import { Collapsible } from "./Collapsible";
import { btn, btnPrimary, hintText, input, select } from "../lib/ui";

export function ConversationList() {
  const {
    conversations,
    activeConversationId,
    conversationSearch,
    conversationFilterProvider,
    conversationFilterModel,
    conversationFolderFilter,
    conversationTagFilter,
    folders,
    tags,
    providers,
    loadConversations,
    loadFoldersTags,
    newConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    setConversationSearch,
    setConversationFilters,
    setConversationFolderFilter,
    setConversationTagFilter,
    setConversationFolder,
    setConversationTags
  } = useProviderStore();
  const [draftTitle, setDraftTitle] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [folderAssignId, setFolderAssignId] = useState<string | null>(null);
  const [folderAssignValue, setFolderAssignValue] = useState("");
  const [tagInputId, setTagInputId] = useState<string | null>(null);
  const [tagInputValue, setTagInputValue] = useState("");

  const q = conversationSearch.trim().toLowerCase();
  const visible = conversations.filter((c) => {
    if (q && !c.title.toLowerCase().includes(q)) return false;
    if (conversationFilterProvider && c.provider_id !== conversationFilterProvider) return false;
    if (conversationFilterModel && c.default_model_id !== conversationFilterModel) return false;
    if (conversationFolderFilter && c.folder_id !== conversationFolderFilter) return false;
    if (conversationTagFilter) {
      const conv = conversations.find((x) => x.id === c.id);
      if (!conv || !conv.folder_id) return false;
    }
    return true;
  });

  async function create() {
    await newConversation(draftTitle.trim() || "New conversation");
    setDraftTitle("");
    await loadConversations();
  }

  async function commitRename(id : string) {
    const clean = sanitizeRenameTitle(renameValue);
    setRenamingId(null);
    if (!clean) {
      return;
    }
    await renameConversation(id, clean);
  }

  async function commitFolderAssign(id : string) {
    const fid = folderAssignValue || null;
    setFolderAssignId(null);
    setFolderAssignValue("");
    if (fid === "__none") {
      await setConversationFolder(id, null);
    } else {
      await setConversationFolder(id, fid);
    }
  }

  async function commitTagInput(id : string) {
    const raw = tagInputValue.trim();
    setTagInputId(null);
    setTagInputValue("");
    if (!raw) return;
    const names = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const tagIds: string[] = [];
    for (const name of names) {
      const tag = await useProviderStore.getState().setConversationTags(id, []);
      void tag;
      // Create tag via invoke
      const { invoke } = await import("@tauri-apps/api/core");
      const row = await invoke<{ id : string }>("create_tag", { name });
      tagIds.push(row.id);
    }
    await setConversationTags(id, tagIds);
  }

  return (
    <Collapsible id="conversations" title="Conversations">
      <div className="mb-2 flex gap-2">
        <input
          placeholder="New conversation title..."
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          className={`${input} flex-1`}
        />
        <button onClick={() => void create()} className={btnPrimary}>New</button>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <input
          placeholder="Search..."
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
          placeholder="Filter model..."
          value={conversationFilterModel ?? ""}
          onChange={(e) => setConversationFilters(conversationFilterProvider, e.target.value || null)}
          className={input}
        />
        <select
          value={conversationFolderFilter ?? ""}
          onChange={(e) => setConversationFolderFilter(e.target.value || null)}
          className={select}
        >
          <option value="">All folders</option>
          <option value="__none">Uncategorized</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <select
          value={conversationTagFilter ?? ""}
          onChange={(e) => setConversationTagFilter(e.target.value || null)}
          className={select}
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
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
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setRenamingId(null);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      void commitRename(c.id);
                    }
                  }}
                  autoFocus
                  className={`${input} flex-1`}
                />
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
                <button onClick={() => { setRenamingId(c.id); setRenameValue(c.title); setConfirmingId(null); }} className={btn}>Rename</button>
                {folderAssignId === c.id ? (
                  <span className="flex gap-1">
                    <select
                      value={folderAssignValue}
                      onChange={(e) => setFolderAssignValue(e.target.value)}
                      className={select}
                    >
                      <option value="">Uncategorized</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    <button onClick={() => void commitFolderAssign(c.id)} className={btn}>Set</button>
                    <button onClick={() => setFolderAssignId(null)} className={btn}>Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => { setFolderAssignId(c.id); setFolderAssignValue(c.folder_id ?? ""); }} className={btn} title="Assign folder">Folder</button>
                )}
                {tagInputId === c.id ? (
                  <span className="flex gap-1">
                    <input
                      value={tagInputValue}
                      onChange={(e) => setTagInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitTagInput(c.id);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setTagInputId(null);
                          setTagInputValue("");
                        }
                      }}
                      placeholder="tag1, tag2..."
                      autoFocus
                      className={`${input} w-28`}
                    />
                    <button onClick={() => void commitTagInput(c.id)} className={btn}>Add</button>
                    <button onClick={() => { setTagInputId(null); setTagInputValue(""); }} className={btn}>Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => { setTagInputId(c.id); setTagInputValue(""); }} className={btn} title="Add tags">Tags</button>
                )}
                {confirmingId === c.id ? (
                  <span className="flex gap-1">
                    <button onClick={() => { setConfirmingId(null); void deleteConversation(c.id); }} className={btn} title="Click again to confirm delete">Confirm?</button>
                    <button onClick={() => setConfirmingId(null)} className={btn}>Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmingId(c.id)} className={btn}>Delete</button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {visible.length === 0 && <p className={hintText}>No conversations match.</p>}
    </Collapsible>
  );
}
