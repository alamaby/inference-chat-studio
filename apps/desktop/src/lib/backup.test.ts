import { describe, expect, it } from "vitest";
import {
  buildBackupFilename,
  MAX_BACKUP_FILE_BYTES,
  MAX_CONVERSATIONS,
  MAX_PROVIDERS,
  parseBackupJsonText,
  validateBackupFile
} from "./backup";
import type { BackupFile } from "../../../../packages/api-types/src/index";

function validBackup() : BackupFile {
  return {
    format : "ics-backup",
    version : 1,
    exported_at : "2026-01-01T00:00:00.000Z",
    app_version : "0.1.0",
    providers : [
      {
        id : "p",
        name : "Local",
        base_url : "https://x",
        compatibility_type : "openai",
        api_mode : "chat_completions",
        enabled : true,
        created_at : "t",
        updated_at : "t"
      }
    ],
    models : [],
    conversations : []
  };
}

describe("validateBackupFile", () => {
  it("accepts a minimal well-formed backup", () => {
    const result = validateBackupFile(validBackup());
    expect(result.ok).toBe(true);
  });

  it("ignores unknown fields for forward compatibility", () => {
    const extra = { ...validBackup(), some_future_field : 42 };
    const result = validateBackupFile(extra);
    expect(result.ok).toBe(true);
  });

  it("rejects an unsupported format", () => {
    const result = validateBackupFile({ ...validBackup(), format : "other" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("unsupported backup format");
    }
  });

  it("rejects an unsupported version", () => {
    const result = validateBackupFile({ ...validBackup(), version : 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("unsupported backup version");
    }
  });

  it("rejects non-object payloads", () => {
    for (const value of [null, [], "text", 7]) {
      const result = validateBackupFile(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("backup must be an object");
      }
    }
  });

  it("rejects a provider with a non-http base_url", () => {
    const backup = validBackup();
    backup.providers[0]!.base_url = "ftp://x";
    const result = validateBackupFile(backup);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("base_url");
    }
  });

  it("rejects a provider with an empty name", () => {
    const backup = validBackup();
    backup.providers[0]!.name = "  ";
    const result = validateBackupFile(backup);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("name");
    }
  });

  it("rejects oversize arrays", () => {
    const backup = validBackup();
    backup.providers = Array.from({ length : MAX_PROVIDERS + 1 }, (_, i) => ({
      ...backup.providers[0]!,
      id : `p-${i}`
    }));
    const result = validateBackupFile(backup);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("backup too large");
    }

    const manyConversations = validBackup();
    manyConversations.providers = [];
    manyConversations.conversations = Array.from(
      { length : MAX_CONVERSATIONS + 1 },
      () => ({
        conversation : {
          id : "c",
          title : "t",
          pinned : false,
          archived : false,
          created_at : "t",
          updated_at : "t"
        },
        messages : [],
        bookmarks : []
      })
    );
    expect(validateBackupFile(manyConversations).ok).toBe(false);
  });

  it("accepts a conversation whose bookmark fields are strings", () => {
    const backup = validBackup();
    backup.conversations = [
      {
        conversation : {
          id : "c-1",
          title : "Chat",
          pinned : false,
          archived : false,
          created_at : "t",
          updated_at : "t"
        },
        messages : [],
        bookmarks : [
          {
            id : "b",
            conversation_id : "c-1",
            message_id : "m",
            label : "l",
            anchor_text : "a",
            created_at : "t"
          }
        ]
      }
    ];
    expect(validateBackupFile(backup).ok).toBe(true);
  });

  it("rejects a bookmark with a non-string message_id", () => {
    const backup = validBackup();
    backup.conversations = [
      {
        conversation : {
          id : "c-1",
          title : "Chat",
          pinned : false,
          archived : false,
          created_at : "t",
          updated_at : "t"
        },
        messages : [],
        bookmarks : [
          {
            id : "b",
            conversation_id : "c-1",
            message_id : 7 as unknown as string,
            label : "l",
            anchor_text : "a",
            created_at : "t"
          }
        ]
      }
    ];
    const result = validateBackupFile(backup);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("message_id");
    }
  });
});

describe("parseBackupJsonText", () => {
  it("round-trips valid JSON", () => {
    const result = parseBackupJsonText(JSON.stringify(validBackup()));
    expect(result.ok).toBe(true);
  });

  it("reports invalid JSON without throwing", () => {
    const result = parseBackupJsonText("{");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("invalid JSON");
    }
  });
});

describe("buildBackupFilename", () => {
  it("formats a versioned, Windows-safe name", () => {
    expect(buildBackupFilename("0.1.0", new Date("2026-01-02T03:04:05Z"))).toBe(
      "ics-backup-0.1.0-20260102-030405.json"
    );
  });

  it("exposes a file-size ceiling", () => {
    expect(MAX_BACKUP_FILE_BYTES).toBe(50 * 1024 * 1024);
  });
});
