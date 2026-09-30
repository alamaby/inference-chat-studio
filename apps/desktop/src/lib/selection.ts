import type {
  ModelInfo,
  ProviderDto
} from "../../../../packages/api-types/src/index";

export interface Selection {
  activeProviderId : string | null;
  activeModelId : string | null;
}

/**
 * Normalize provider/model selection after any list change.
 *
 * - Unknown provider → first provider (or null when the list is empty).
 * - Unknown/missing model → first model of the resolved provider (or null).
 * - Valid selections are preserved untouched.
 *
 * This fixes the "Send stays disabled" bug: the dropdowns render visual
 * fallbacks (first provider) that were never written back to the store,
 * so `ChatView.canSend` stayed false forever.
 */
export function resolveSelection(
  providers : ProviderDto[],
  modelsByProvider : Record<string, ModelInfo[]>,
  activeProviderId : string | null,
  activeModelId : string | null
): Selection {
  const providerId = providers.some((p) => p.id === activeProviderId)
    ? activeProviderId
    : (providers[0]?.id ?? null);
  const models = providerId ? (modelsByProvider[providerId] ?? []) : [];
  const modelId = models.some((m) => m.remote_model_id === activeModelId)
    ? activeModelId
    : (models[0]?.remote_model_id ?? null);
  return { activeProviderId : providerId, activeModelId : modelId };
}
