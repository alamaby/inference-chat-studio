import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupFile
} from "../../../../packages/api-types/src/index";

/**
 * Validation, parsing and download helpers for the export/import backup file.
 *
 * Pure functions (except `downloadBackupFile`) so the rules can be unit-tested
 * without a DOM. Field names are snake_case and match the Rust DTOs exactly.
 *
 * A backup never carries secrets: providers are exported without
 * `credential_reference`/`api_key`, and the importer ignores those keys even
 * when a hand-crafted file contains them (Rust drops unknown fields).
 */

export const MAX_PROVIDERS = 10_000;
export const MAX_CONVERSATIONS = 50_000;
/** Frontend ceiling for the picked file; keeps a stray 500 MB file from
 *  freezing the renderer. Mirrors the backend's structural caps. */
export const MAX_BACKUP_FILE_BYTES = 50 * 1024 * 1024;

export type ValidateResult =
  | { ok : true; value : BackupFile }
  | { ok : false; error : string };

function isRecord(value : unknown) : value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value : unknown) : value is string {
  return typeof value === "string";
}

function fail(error : string) : ValidateResult {
  return { ok : false, error };
}

function validateProvider(provider : unknown, index : number) : string | null {
  const where = `provider[${index}]`;
  if (!isRecord(provider)) {
    return `${where}: must be an object`;
  }
  if (!isString(provider["id"]) || provider["id"].trim() === "") {
    return `${where}.id must be a non-empty string`;
  }
  if (!isString(provider["name"]) || provider["name"].trim() === "") {
    return `${where}.name must be a non-empty string`;
  }
  if (!isString(provider["base_url"])) {
    return `${where}.base_url must be a string`;
  }
  if (!/^https?:\/\//.test(provider["base_url"].trim())) {
    return `${where}.base_url must start with http:// or https://`;
  }
  return null;
}

function validateConversation(entry : unknown, index : number) : string | null {
  const where = `conversation[${index}]`;
  if (!isRecord(entry)) {
    return `${where}: must be an object`;
  }
  const conversation = entry["conversation"];
  if (!isRecord(conversation) || !isString(conversation["id"]) || conversation["id"] === "") {
    return `${where}.conversation.id must be a non-empty string`;
  }
  if (!Array.isArray(entry["messages"])) {
    return `${where}.messages must be an array`;
  }
  if (!Array.isArray(entry["bookmarks"])) {
    return `${where}.bookmarks must be an array`;
  }
  for (const bookmark of entry["bookmarks"]) {
    if (!isRecord(bookmark)) {
      return `${where}.bookmarks: every entry must be an object`;
    }
    for (const field of ["id", "conversation_id", "message_id"]) {
      const value = bookmark[field];
      if (typeof value !== "string") {
        return `${where}.bookmarks.${field} must be a string`;
      }
    }
  }
  return null;
}

/**
 * Validate an already-parsed backup payload. Unknown fields are ignored so a
 * newer writer stays readable. Message payloads are NOT inspected: they are
 * copied verbatim by the backend.
 */
export function validateBackupFile(data : unknown) : ValidateResult {
  if (!isRecord(data)) {
    return fail("backup must be an object");
  }
  if (data["format"] !== BACKUP_FORMAT) {
    return fail(`unsupported backup format: ${String(data["format"])}`);
  }
  if (data["version"] !== BACKUP_VERSION) {
    return fail(`unsupported backup version: ${String(data["version"])}`);
  }
  const providers = data["providers"];
  if (!Array.isArray(providers)) {
    return fail("providers must be an array");
  }
  if (providers.length > MAX_PROVIDERS) {
    return fail(`backup too large: providers (${providers.length})`);
  }
  const models = data["models"];
  if (!Array.isArray(models)) {
    return fail("models must be an array");
  }
  const conversations = data["conversations"];
  if (!Array.isArray(conversations)) {
    return fail("conversations must be an array");
  }
  if (conversations.length > MAX_CONVERSATIONS) {
    return fail(`backup too large: conversations (${conversations.length})`);
  }
  for (let i = 0; i < providers.length; i += 1) {
    const error = validateProvider(providers[i], i);
    if (error) {
      return fail(error);
    }
  }
  for (let i = 0; i < conversations.length; i += 1) {
    const error = validateConversation(conversations[i], i);
    if (error) {
      return fail(error);
    }
  }
  return { ok : true, value : data as unknown as BackupFile };
}

/** Parse raw file text into a validated backup, or an error to show. */
export function parseBackupJsonText(text : string) : ValidateResult {
  let data : unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch (e) {
    return fail(`invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  return validateBackupFile(data);
}

function pad(value : number, length : number) : string {
  return String(value).padStart(length, "0");
}

/**
 * `ics-backup-<version>-<YYYYMMDD>-<HHmmss>.json`
 * Digits only after the version, so the name is safe on Windows.
 * UTC-based so the name is identical on every machine.
 */
export function buildBackupFilename(appVersion : string, d : Date = new Date()) : string {
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}`;
  const clock = `${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}${pad(d.getUTCSeconds(), 2)}`;
  return `ics-backup-${appVersion}-${stamp}-${clock}.json`;
}

/**
 * Trigger a browser download of the backup. DOM-only; throws on failure so
 * the caller can surface a message instead of a silent no-op.
 */
export function downloadBackupFile(backup : BackupFile) : void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type : "application/json"
  });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = buildBackupFilename(backup.app_version);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    throw new Error("failed to download backup");
  } finally {
    // Revoke after a tick so Safari/Firefox have read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
