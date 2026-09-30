/**
 * Shared Tailwind class tokens (Fase A design system).
 *
 * Single source of truth for card/input/button/label styling + dark mode.
 * Components must compose these instead of inline `style={{...}}`.
 */

export const card =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

export const sectionTitle =
  "mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

export const label = "grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-300";

export const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-brand-700";

export const select = input;

export const textarea = `${input} resize-y`;

export const btn =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";

export const btnPrimary =
  "rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-brand-500 dark:hover:bg-brand-600";

export const errorText = "text-sm text-red-600 dark:text-red-400";

export const hintText = "text-sm text-slate-500 dark:text-slate-400";

export const code =
  "rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-800";

export function statusDot(status : string): string {
  const base = "inline-block h-2 w-2 rounded-full";
  switch (status) {
    case "connected":
      return `${base} bg-emerald-500`;
    case "unauthorized":
    case "invalid_response":
    case "connection_failed":
      return `${base} bg-red-500`;
    case "timeout":
      return `${base} bg-amber-500`;
    default:
      return `${base} bg-slate-400`;
  }
}
