import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke : vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { useProviderStore } from "./providerStore";

const mockInvoke = vi.mocked(invoke);

const CONVERSATION = {
  id : "c1",
  title : "t",
  provider_id : "p1",
  default_model_id : "m1",
  system_prompt : "sys",
  settings_json : null
};

/**
 * Regression tests for the Tauri v2 argument-name rule: multi-word command
 * parameters MUST be camelCase on the JS side (the backend macro generates
 * camelCase keys). snake_case keys either hard-fail (required params) or
 * silently become None (optional params) — the latter once wiped every
 * saved system prompt without any error.
 */
describe("IPC argument shapes", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    useProviderStore.setState({
      conversations : [CONVERSATION],
      activeConversationId : null,
      messages : [],
      bookmarks : [],
      activeProviderId : "p1",
      activeModelId : "m1",
      systemPrompt : "sys",
      error : null
    });
  });

  it("selectConversation requests messages and bookmarks by conversationId", async () => {
    mockInvoke
      .mockResolvedValueOnce([
        { id : "m1", role : "user", content_json : "\"hi\"", status : "done", created_at : "2026-09-30T10:00:00.000Z" }
      ])
      .mockResolvedValueOnce([]);
    await useProviderStore.getState().selectConversation("c1");
    expect(mockInvoke).toHaveBeenCalledWith("list_messages_cmd", {
      conversationId : "c1"
    });
    expect(mockInvoke).toHaveBeenCalledWith("list_bookmarks_cmd", {
      conversationId : "c1"
    });
    expect(useProviderStore.getState().messages).toEqual([
      { id : "m1", role : "user", content : "hi", status : "done", timestamp : "2026-09-30T10:00:00.000Z" }
    ]);
  });

  it("newConversation sends providerId/defaultModelId/systemPrompt", async () => {
    mockInvoke.mockResolvedValueOnce({ ...CONVERSATION, id : "c9" });
    const id = await useProviderStore.getState().newConversation("hello");
    expect(id).toBe("c9");
    expect(mockInvoke).toHaveBeenCalledWith("create_conversation", {
      title : "hello",
      providerId : "p1",
      defaultModelId : "m1",
      systemPrompt : "sys"
    });
  });

  it("saveConversationSettings uses systemPrompt/settingsJson/defaultModelId", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await useProviderStore.getState().saveConversationSettings("c1");
    expect(mockInvoke).toHaveBeenCalledWith(
      "update_conversation_settings",
      expect.objectContaining({
        id : "c1",
        systemPrompt : "sys",
        defaultModelId : "m1"
      })
    );
    const body = mockInvoke.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(typeof body["settingsJson"]).toBe("string");
    expect(body).not.toHaveProperty("system_prompt");
  });

  it("createBookmark sends conversationId/messageId/anchorText", async () => {
    useProviderStore.setState({ activeConversationId : "c1" });
    mockInvoke.mockResolvedValueOnce({
      id : "b1",
      conversation_id : "c1",
      message_id : "m1",
      label : "hi",
      anchor_text : "hi",
      created_at : ""
    });
    await useProviderStore.getState().createBookmark("m1", "hi", "hi");
    expect(mockInvoke).toHaveBeenCalledWith("create_bookmark", {
      conversationId : "c1",
      messageId : "m1",
      label : "hi",
      anchorText : "hi"
    });
    expect(useProviderStore.getState().bookmarks.map((b) => b.id)).toEqual(["b1"]);
  });
});
