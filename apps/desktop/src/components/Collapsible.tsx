import { useState } from "react";
import { card, sectionTitle } from "../lib/ui";

/**
 * Collapsible settings panel. Collapsed by default; the choice persists in
 * localStorage so the workspace keeps the user's preferred density.
 */
export function Collapsible({
  id,
  title,
  children
} : {
  id : string;
  title : string;
  children : React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`ics:panel:${id}`) !== "open";
    } catch {
      return true;
    }
  });

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(`ics:panel:${id}`, next ? "closed" : "open");
      } catch {
        // private mode etc: stay in-memory only.
      }
      return next;
    });
  }

  return (
    <section className={card}>
      <button
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className={`${sectionTitle} !mb-0 flex-1`}>{title}</span>
        <span
          aria-hidden
          className={`text-slate-400 transition-transform ${collapsed ? "" : "rotate-90"}`}
        >
          ›
        </span>
      </button>
      {!collapsed && <div className="mt-2.5">{children}</div>}
    </section>
  );
}
