import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { formatIpcError } from "../lib/errors";
import { resolveSelection } from "../lib/selection";
import {
  parseConversationSettings,
  serializeConversationSettings,
  toChatMsg,
  type ChatMsg,
  type PersistedMessage
} from "../lib/conversation";
import type {
  BookmarkDto,
  ConnectionStatus,
  ModelInfo,
  ProviderDto,
  ReasoningLevel
} from "../../../../packages/api-types/src/index";

interface ConversationDto {
  id : string;
  title : string;
  provider_id? : string | null;
  default_model_id? : string | null;
  system_prompt? : string | null;
  settings_json? : string | null;
}

interface ProviderState {
  providers : ProviderDto[];
  modelsByProvider : Record<string, ModelInfo[]>;
  activeProviderId : string | null;
  activeModelId : string | null;
  reasoningLevel : ReasoningLevel;
  customReasoningJson : string;
  systemPrompt : string;
  temperature : number | null;
  maxOutput : number | null;
  statusByProvider : Record<string, ConnectionStatus>;
  testingByProvider : Record<string, boolean>;
  testErrorByProvider : Record<string, string | null>;
  conversations : ConversationDto[];
  activeConversationId : string | null;
  conversationSearch : string;
  conversationFilterProvider : string | null;
  conversationFilterModel : string | null;
  messages : ChatMsg[];
  bookmarks : BookmarkDto[];
  streaming : boolean;
  error : string | null;

  loadProviders : () => Promise<void>;
  testConnection : (id : string) => Promise<void>;
  refreshModels : (providerId : string) => Promise<void>;
  addModelManual : (providerId : string, remoteModelId : string, displayName? : string) => Promise<void>;
  deleteProvider : (id : string) => Promise<void>;
  setActive : (providerId : string | null, modelId : string | null) => void;
  setReasoning : (level : ReasoningLevel, customJson : string) => void;
  setSimple : (patch : Partial<Pick<ProviderState, "systemPrompt" | "temperature" | "maxOutput">>) => void;
  setError : (msg : string | null) => void;
  setMessages : (msgs : ChatMsg[]) => void;
  setStreaming : (v : boolean) => void;
  loadConversations : () => Promise<void>;
  newConversation : (title : string) => Promise<string>;
  selectConversation : (id : string) => Promise<void>;
  saveConversationSettings : (id : string) => Promise<void>;
  loadBookmarks : (conversationId : string) => Promise<void>;
  createBookmark : (messageId : string, label : string, anchorText : string) => Promise<void>;
  deleteBookmark : (id : string) => Promise<void>;
  renameConversation : (id : string, title : string) => Promise<void>;
  deleteConversation : (id : string) => Promise<void>;
  setConversationSearch : (q : string) => void;
  setConversationFilters : (providerId : string | null, modelId : string | null) => void;
  clearProviderError : (id : string) => void;
}

/**
 * Build the state patch that restores a conversation's saved UI state
 * (provider/model selection, system prompt, reasoning, sampling).
 * Invalid or missing values fall back without touching anything else.
 */
function conversationPatch(
  s : ProviderState,
  row : ConversationDto
): Partial<ProviderState> {
  const settings = parseConversationSettings(row.settings_json);
  return {
    systemPrompt : row.system_prompt ?? "",
    reasoningLevel : settings.reasoningLevel,
    customReasoningJson : settings.reasoningCustomJson,
    temperature : settings.temperature,
    maxOutput : settings.maxOutput,
    ...resolveSelection(
      s.providers,
      s.modelsByProvider,
      row.provider_id ?? s.activeProviderId,
      row.default_model_id ?? s.activeModelId
    )
  };
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers : [],
  modelsByProvider : {},
  activeProviderId : null,
  activeModelId : null,
  reasoningLevel : "Automatic",
  customReasoningJson : "{\"reasoning_effort\": \"high\"}",
  systemPrompt : "",
  temperature : null,
  maxOutput : null,
  statusByProvider : {},
  testingByProvider : {},
  testErrorByProvider : {},
  conversations : [],
  activeConversationId : null,
  conversationSearch : "",
  conversationFilterProvider : null,
  conversationFilterModel : null,
  messages : [],
  bookmarks : [],
  streaming : false,
  error : null,

  loadProviders : async () => {
    const providers = await invoke<ProviderDto[]>("list_providers");
    const modelsByProvider: Record<string, ModelInfo[]> = {};
    for (const p of providers) {
      try {
        modelsByProvider[p.id] = await invoke<ModelInfo[]>("list_models_cmd", {
          providerId : p.id
        });
      } catch {
        modelsByProvider[p.id] = [];
      }
    }
    set((s) => ({
      providers,
      modelsByProvider,
      ...resolveSelection(providers, modelsByProvider, s.activeProviderId, s.activeModelId)
    }));
  },

  testConnection : async (id : string) => {
    set((s) => ({
      testingByProvider : { ...s.testingByProvider, [id] : true },
      testErrorByProvider : { ...s.testErrorByProvider, [id] : null }
    }));
    try {
      const status = await invoke<ConnectionStatus>("test_connection_cmd", { id });
      set((s) => ({ statusByProvider : { ...s.statusByProvider, [id] : status } }));
    } catch (e) {
      set((s) => ({
        testErrorByProvider : {
          ...s.testErrorByProvider,
          [id] : formatIpcError(e)
        }
      }));
    } finally {
      set((s) => ({ testingByProvider : { ...s.testingByProvider, [id] : false } }));
    }
  },

  refreshModels : async (providerId : string) => {
    const models = await invoke<ModelInfo[]>("refresh_models", { providerId });
    set((s) => {
      const modelsByProvider = { ...s.modelsByProvider, [providerId] : models };
      return {
        modelsByProvider,
        ...resolveSelection(s.providers, modelsByProvider, s.activeProviderId, s.activeModelId)
      };
    });
  },

  addModelManual : async (providerId : string, remoteModelId : string, displayName? : string) => {
    const model = await invoke<ModelInfo>("add_model_manual", {
      input : { provider_id : providerId, remote_model_id : remoteModelId, display_name : displayName ?? null }
    });
    set((s) => {
      const modelsByProvider = {
        ...s.modelsByProvider,
        [providerId] : [...(s.modelsByProvider[providerId] ?? []), model]
      };
      return {
        modelsByProvider,
        ...resolveSelection(s.providers, modelsByProvider, s.activeProviderId, s.activeModelId)
      };
    });
  },

  deleteProvider : async (id : string) => {
    await invoke("delete_provider", { id });
    set((s) => {
      const providers = s.providers.filter((p) => p.id !== id);
      const modelsByProvider = { ...s.modelsByProvider };
      delete modelsByProvider[id];
      const statusByProvider = { ...s.statusByProvider };
      delete statusByProvider[id];
      const testingByProvider = { ...s.testingByProvider };
      delete testingByProvider[id];
      const testErrorByProvider = { ...s.testErrorByProvider };
      delete testErrorByProvider[id];
      return {
        providers,
        modelsByProvider,
        statusByProvider,
        testingByProvider,
        testErrorByProvider,
        ...resolveSelection(
          providers,
          modelsByProvider,
          s.activeProviderId === id ? null : s.activeProviderId,
          s.activeProviderId === id ? null : s.activeModelId
        )
      };
    });
  },

  setActive : (providerId, modelId) => set((s) => ({
    ...resolveSelection(s.providers, s.modelsByProvider, providerId, modelId)
  })),
  setReasoning : (level, customJson) => set({ reasoningLevel : level, customReasoningJson : customJson }),
  setSimple : (patch) => set(patch),
  setError : (msg) => set({ error : msg }),
  setMessages : (msgs) => set({ messages : msgs }),
  setStreaming : (v) => set({ streaming : v }),
  loadConversations : async () => {
    const conversations = await invoke<ConversationDto[]>("list_conversations");
    const current = get();
    // Default: continue the most recent conversation (backend orders by
    // updated_at DESC) instead of opening an empty view. Creating via New
    // is the explicit way to start fresh.
    const activeId = current.activeConversationId ?? conversations[0]?.id ?? null;
    let messages = current.messages;
    let bookmarks = current.bookmarks;
    let patch: Partial<ProviderState> = {};
    if (activeId && activeId !== current.activeConversationId) {
      const active = conversations.find((c) => c.id === activeId);
      if (active) {
        patch = conversationPatch(current, active);
      }
      try {
        const rows = await invoke<PersistedMessage[]>("list_messages_cmd", {
          conversationId : activeId
        });
        messages = rows.map(toChatMsg);
      } catch {
        // keep current messages; the error surfaces on next send/select.
      }
      try {
        bookmarks = await invoke<BookmarkDto[]>("list_bookmarks_cmd", {
          conversationId : activeId
        });
      } catch {
        bookmarks = [];
      }
    }
    set({ conversations, activeConversationId : activeId, messages, bookmarks, ...patch });
  },
  newConversation : async (title : string) => {
    const { activeProviderId, activeModelId, systemPrompt } = get();
    const row = await invoke<ConversationDto>("create_conversation", {
      title,
      providerId : activeProviderId,
      defaultModelId : activeModelId,
      systemPrompt : systemPrompt || null
    });
    set((s) => ({
      conversations : [row, ...s.conversations],
      activeConversationId : row.id,
      messages : [],
      bookmarks : []
    }));
    return row.id;
  },
  selectConversation : async (id : string) => {
    const rows = await invoke<PersistedMessage[]>("list_messages_cmd", {
      conversationId : id
    });
    const bookmarks = await invoke<BookmarkDto[]>("list_bookmarks_cmd", {
      conversationId : id
    }).catch(() : BookmarkDto[] => []);
    set((s) => {
      const row = s.conversations.find((c) => c.id === id);
      return {
        activeConversationId : id,
        messages : rows.map(toChatMsg),
        bookmarks,
        error : null,
        ...(row ? conversationPatch(s, row) : {})
      };
    });
  },
  loadBookmarks : async (conversationId : string) => {
    const bookmarks = await invoke<BookmarkDto[]>("list_bookmarks_cmd", {
      conversationId
    });
    set({ bookmarks });
  },
  createBookmark : async (messageId : string, label : string, anchorText : string) => {
    const { activeConversationId } = get();
    if (!activeConversationId) {
      return;
    }
    const row = await invoke<BookmarkDto>("create_bookmark", {
      conversationId : activeConversationId,
      messageId,
      label,
      anchorText
    });
    set((s) => ({ bookmarks : [...s.bookmarks, row] }));
  },
  deleteBookmark : async (id : string) => {
    await invoke("delete_bookmark", { id });
    set((s) => ({ bookmarks : s.bookmarks.filter((b) => b.id !== id) }));
  },
  saveConversationSettings : async (id : string) => {
    const s = get();
    await invoke("update_conversation_settings", {
      id,
      systemPrompt : s.systemPrompt || null,
      settingsJson : serializeConversationSettings({
        reasoningLevel : s.reasoningLevel,
        reasoningCustomJson : s.customReasoningJson,
        temperature : s.temperature,
        maxOutput : s.maxOutput
      }),
      defaultModelId : s.activeModelId
    });
  },
  renameConversation : async (id : string, title : string) => {
    await invoke("rename_conversation", { id, title });
    set((s) => ({
      conversations : s.conversations.map((c) => (c.id === id ? { ...c, title } : c))
    }));
  },
  deleteConversation : async (id : string) => {
    await invoke("delete_conversation", { id });
    set((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id);
      const switched = s.activeConversationId === id;
      return {
        conversations,
        activeConversationId : switched
          ? (conversations[0]?.id ?? null)
          : s.activeConversationId,
        messages : switched ? [] : s.messages,
        bookmarks : switched ? [] : s.bookmarks
      };
    });
    // Reload the newly active conversation's content (bookmarks cascade-
    // deleted with their conversation in the backend).
    const next = get().activeConversationId;
    if (next) {
      await get().selectConversation(next).catch(() => undefined);
    }
  },
  setConversationSearch : (q : string) => set({ conversationSearch : q }),
  setConversationFilters : (providerId, modelId) => set({
    conversationFilterProvider : providerId,
    conversationFilterModel : modelId
  }),
  clearProviderError : (id : string) => set((s) => {
    const testErrorByProvider = { ...s.testErrorByProvider };
    delete testErrorByProvider[id];
    return { testErrorByProvider };
  })
}));
