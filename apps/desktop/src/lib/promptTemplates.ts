/** Named system-prompt templates, v1: localStorage only (not in backup). */

export interface PromptTemplate {
  id : string;
  name : string;
  content : string;
  createdAt : string;
  updatedAt : string;
}

export const PROMPT_TEMPLATES_KEY = "ics.promptTemplates.v1";
export const MAX_TEMPLATES = 100;

function cleanName(name : string): string {
  return name.trim().slice(0, 80);
}

/** Pure constructor; caller supplies id/now so tests stay deterministic. */
export function createTemplateItem(id : string, name : string, content : string, now : string): PromptTemplate {
  const clean = cleanName(name);
  if (!clean) {
    throw new Error("Template name must not be empty.");
  }
  return { id, name : clean, content, createdAt : now, updatedAt : now };
}

/** Pure upsert: replaces same-id, newest first, capped at MAX_TEMPLATES. */
export function upsertTemplate(list : PromptTemplate[], item : PromptTemplate): PromptTemplate[] {
  const next = [item, ...list.filter((t) => t.id !== item.id)];
  next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return next.slice(0, MAX_TEMPLATES);
}

/** Pure delete by id. */
export function deleteTemplate(list : PromptTemplate[], id : string): PromptTemplate[] {
  return list.filter((t) => t.id !== id);
}

/** Load from localStorage; corrupt/missing → []. Never throws. */
export function loadTemplates(): PromptTemplate[] {
  try {
    const raw = localStorage.getItem(PROMPT_TEMPLATES_KEY);
    if (!raw) {
      return [];
    }
    const parsed : unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((t): t is PromptTemplate =>
      typeof t === "object" && t !== null &&
      typeof (t as Record<string, unknown>)["id"] === "string" &&
      typeof (t as Record<string, unknown>)["name"] === "string" &&
      typeof (t as Record<string, unknown>)["content"] === "string"
    );
  } catch {
    return [];
  }
}

/** Persist to localStorage. Never throws (quota errors swallowed). */
export function saveTemplates(list : PromptTemplate[]): void {
  try {
    localStorage.setItem(PROMPT_TEMPLATES_KEY, JSON.stringify(list));
  } catch {
    // ignore: templates are best-effort local convenience.
  }
}
