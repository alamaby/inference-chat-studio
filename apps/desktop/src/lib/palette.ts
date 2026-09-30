import type { ModelInfo, ProviderDto } from "../../../../packages/api-types/src/index";

export type PaletteAction =
  | { type : "model"; providerId : string; modelId : string }
  | { type : "new-conversation" }
  | { type : "devtools" };

export interface PaletteItem {
  id : string;
  title : string;
  subtitle? : string;
  action : PaletteAction;
}

/**
 * Build command-palette entries: one per model (grouped by provider name in
 * the subtitle) plus fixed workspace actions.
 */
export function buildPaletteItems(
  providers : ProviderDto[],
  modelsByProvider : Record<string, ModelInfo[]>
): PaletteItem[] {
  const items: PaletteItem[] = [
    { id : "action:new-conversation", title : "New conversation", action : { type : "new-conversation" } },
    { id : "action:devtools", title : "Open DevTools", action : { type : "devtools" } }
  ];
  for (const p of providers) {
    for (const m of modelsByProvider[p.id] ?? []) {
      items.push({
        id : `model:${p.id}:${m.remote_model_id}`,
        title : m.display_name ?? m.remote_model_id,
        subtitle : p.name,
        action : { type : "model", providerId : p.id, modelId : m.remote_model_id }
      });
    }
  }
  return items;
}

/** Case-insensitive substring filter over title + subtitle. */
export function filterPalette(items : PaletteItem[], query : string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return items;
  }
  return items.filter((item) =>
    item.title.toLowerCase().includes(q) ||
    (item.subtitle ?? "").toLowerCase().includes(q)
  );
}
