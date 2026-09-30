import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { AppInfo } from "../../../../packages/api-types/src/index";
import { formatIpcError } from "../lib/errors";
import { btn, card, hintText } from "../lib/ui";

/**
 * About dialog: name, semantic version, build number, git SHA, build time
 * (epoch seconds) and Tauri version reported by the backend at build time.
 *
 * Never shows API keys — nothing here reads the secret store.
 */
export function AboutDialog({
  open,
  onClose
} : {
  open : boolean;
  onClose : () => void;
}) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    invoke<AppInfo>("get_app_info")
      .then((value) => {
        if (!alive) {
          return;
        }
        setInfo(value);
      })
      .catch((e : unknown) => {
        if (!alive) {
          return;
        }
        setInfo(null);
        setError(formatIpcError(e));
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [open, reloadKey]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(e : KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  async function copyInfo() {
    if (!info) {
      return;
    }
    const text = JSON.stringify(info, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Insecure context or missing permission: fall back instead of throwing.
      window.prompt("Copy the app info:", text);
    }
  }

  const rows: Array<[string, string]> = info
    ? [
        ["App", info.name],
        ["Version", info.version],
        ["Build number", info.build_number],
        ["Git SHA", info.git_sha],
        ["Build time (epoch)", info.build_time],
        ["Tauri", info.tauri_version]
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="About Inference Chat Studio"
        className={`${card} w-full max-w-md`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">About Inference Chat Studio</h2>
        <p className={`${hintText} mt-1`}>Prompt dikirim ke provider; history tersimpan lokal.</p>

        {loading && <p className={`${hintText} mt-4`}>Loading…</p>}
        {error && (
          <div className="mt-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className={`${btn} mt-2`}
            >
              Retry
            </button>
          </div>
        )}
        {info && (
          <table className="mt-4 w-full text-sm">
            <tbody>
              {rows.map(([key, value]) => (
                <tr key={key} className="border-t border-slate-100 dark:border-slate-800">
                  <th className="py-1.5 pr-3 text-left font-medium text-slate-500 dark:text-slate-400">
                    {key}
                  </th>
                  <td className="py-1.5 font-mono text-slate-900 dark:text-slate-100">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className={`${hintText} mt-3`}>API key tidak pernah ditampilkan di sini.</p>

        <div className="mt-4 flex justify-end gap-2">
          {info && (
            <button onClick={() => void copyInfo()} className={btn} type="button">
              Copy info
            </button>
          )}
          <button onClick={() => onClose()} className={btn} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
