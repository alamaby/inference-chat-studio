import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import { useProviderStore } from "../stores/providerStore";
import type { BackupFile, ImportSummary } from "../../../../packages/api-types/src/index";
import { formatIpcError } from "../lib/errors";
import {
  MAX_BACKUP_FILE_BYTES,
  downloadBackupFile,
  parseBackupJsonText
} from "../lib/backup";
import { Collapsible } from "./Collapsible";
import { btn, btnPrimary, errorText, hintText } from "../lib/ui";

/**
 * Data & Backup section:
 * - Export: fetches a full backup (providers without secrets + models + history),
 *   downloads it as a JSON file.
 * - Import: reads a previously exported file, validates it client-side, then
 *   sends it to the backend for a pure-merge import. All ids are regenerated;
 *   existing data is never overwritten. The user must re-enter each API key
 *   after import because secrets are not part of the backup file.
 */
export function DataBackup() {
  const { loadProviders, loadConversations } = useProviderStore();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function doExport() {
    if (exporting || importing) {
      return;
    }
    setExportError(null);
    setExporting(true);
    try {
      const backup = await invoke<BackupFile>("export_backup");
      downloadBackupFile(backup);
    } catch (e) {
      setExportError(formatIpcError(e));
    } finally {
      setExporting(false);
    }
  }

  async function doImport(file : File) {
    if (importing || exporting) {
      return;
    }
    setImportError(null);
    setImportResult(null);
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      setImportError(`file too large (max ${MAX_BACKUP_FILE_BYTES / (1024 * 1024)} MB)`);
      return;
    }
    let text : string;
    try {
      text = await file.text();
    } catch (e) {
      setImportError(`could not read file: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const parsed = parseBackupJsonText(text);
    if (!parsed.ok) {
      setImportError(parsed.error);
      return;
    }
    setImporting(true);
    try {
      const summary = await invoke<ImportSummary>("import_backup", {
        backup : parsed.value
      });
      setImportResult(
        `Imported ${summary.providers} providers, ${summary.models} models, ${summary.conversations} conversations, ${summary.messages} messages, ${summary.bookmarks} bookmarks. Re-enter each provider's API key.`
      );
      await loadProviders();
      await loadConversations();
    } catch (e) {
      setImportError(formatIpcError(e));
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <Collapsible id="data" title="Data & Backup">
      <p className={`${hintText} mb-3`}>
        Export berisi provider (tanpa API key), model, dan chat history.
        Setelah import, isi ulang API key tiap provider.
      </p>
      <div className="grid gap-2">
        <button
          onClick={() => void doExport()}
          disabled={exporting || importing}
          className={btnPrimary}
          type="button"
        >
          {exporting ? "Exporting…" : "Export backup"}
        </button>
        {exportError && <p className={errorText}>{exportError}</p>}

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={exporting || importing}
          className={btn}
          type="button"
        >
          {importing ? "Importing…" : "Import backup"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) {
              return;
            }
            void doImport(file);
          }}
        />
        {(importError || importResult) && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              importError
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            }`}
          >
            {importError ?? importResult}
          </div>
        )}
      </div>
    </Collapsible>
  );
}
