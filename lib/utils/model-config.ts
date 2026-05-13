import { useSettingsStore } from '@/lib/store/settings';
import { DEVELOPER_MODEL_ID, DEVELOPER_PROVIDER_ID } from '@/lib/ai/providers';
import {
  getThinkingConfigKey,
  normalizeThinkingConfig,
  supportsConfigurableThinking,
} from '@/lib/ai/thinking-config';

/**
 * Get current model configuration from settings store
 */
export function getCurrentModelConfig() {
  const { providerId, modelId, providersConfig, thinkingConfigs, developerMode } =
    useSettingsStore.getState();
  const effectiveProviderId = developerMode ? DEVELOPER_PROVIDER_ID : providerId;
  const effectiveModelId = developerMode ? DEVELOPER_MODEL_ID : modelId;
  const modelString = `${effectiveProviderId}:${effectiveModelId}`;

  // Get current provider's config
  const providerConfig = providersConfig[effectiveProviderId];
  const modelInfo = providerConfig?.models.find((model) => model.id === effectiveModelId);
  const thinking = modelInfo?.capabilities?.thinking;
  const thinkingConfig = supportsConfigurableThinking(thinking)
    ? normalizeThinkingConfig(
        thinking,
        thinkingConfigs[getThinkingConfigKey(effectiveProviderId, effectiveModelId)],
      )
    : undefined;

  return {
    providerId: effectiveProviderId,
    modelId: effectiveModelId,
    modelString,
    thinkingConfig,
    developerMode,
  };
}
