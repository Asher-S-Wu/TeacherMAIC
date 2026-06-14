import type { TTSProviderId } from '@/lib/audio/types';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import { DEFAULT_TTS_VOICES, TTS_PROVIDERS } from '@/lib/audio/constants';

export interface ResolvedVoice {
  providerId: TTSProviderId;
  modelId?: string;
  voiceId: string;
}

export interface ModelVoiceGroup {
  modelId: string;
  modelName: string;
  voices: Array<{ id: string; name: string; language?: string }>;
}

export interface ProviderWithVoices {
  providerId: TTSProviderId;
  providerName: string;
  voices: Array<{ id: string; name: string; language?: string }>;
  modelGroups: ModelVoiceGroup[];
}

export function resolveAgentVoice(
  agent: AgentConfig,
  agentIndex: number,
  availableProviders: ProviderWithVoices[],
): ResolvedVoice {
  if (agent.voiceConfig?.providerId === 'bailian-tts') {
    const allVoiceIds = new Set(getServerVoiceList('bailian-tts'));
    if (allVoiceIds.has(agent.voiceConfig.voiceId)) {
      return {
        providerId: 'bailian-tts',
        modelId: agent.voiceConfig.modelId,
        voiceId: agent.voiceConfig.voiceId,
      };
    }
  }

  if (availableProviders.length > 0) {
    const first = availableProviders[0];
    return {
      providerId: first.providerId,
      modelId: first.modelGroups[0]?.modelId,
      voiceId: first.voices[agentIndex % first.voices.length].id,
    };
  }

  return { providerId: 'bailian-tts', voiceId: DEFAULT_TTS_VOICES['bailian-tts'] };
}

export function getServerVoiceList(providerId: TTSProviderId): string[] {
  return TTS_PROVIDERS[providerId].voices.map((voice) => voice.id);
}

export function getAvailableProvidersWithVoices(
  ttsProvidersConfig: Record<
    string,
    {
      enabled?: boolean;
      isServerConfigured?: boolean;
      modelId?: string;
    }
  >,
): ProviderWithVoices[] {
  const provider = TTS_PROVIDERS['bailian-tts'];
  const providerConfig = ttsProvidersConfig['bailian-tts'];
  const isServerConfigured = providerConfig?.isServerConfigured === true;
  if (!isServerConfigured) return [];

  const voices = provider.voices.map((voice) => ({
    id: voice.id,
    name: voice.name,
    language: voice.language,
  }));

  return [
    {
      providerId: 'bailian-tts',
      providerName: provider.name,
      voices,
      modelGroups: provider.models.map((model) => ({
        modelId: model.id,
        modelName: model.name,
        voices,
      })),
    },
  ];
}
