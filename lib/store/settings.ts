/**
 * Settings Store
 * Global settings state synchronized with the signed-in account
 */

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { ProviderId } from '@/lib/ai/providers';
import type { ProvidersConfig } from '@/lib/types/settings';
import { DEFAULT_MODEL_ID, DEFAULT_PROVIDER_ID, PROVIDERS } from '@/lib/ai/providers';
import type { TTSProviderId, BuiltInTTSProviderId } from '@/lib/audio/types';
import {
  DEFAULT_TTS_MODELS,
  DEFAULT_TTS_VOICES,
  TTS_PROVIDERS,
} from '@/lib/audio/constants';
import type { WebSearchProviderId } from '@/lib/web-search/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('Settings');

const accountSettingsStorage: StateStorage = {
  getItem: async (name) => {
    if (typeof window === 'undefined') return null;
    const res = await fetch(`/api/user-settings/${encodeURIComponent(name)}`, {
      cache: 'no-store',
    });
    if (res.status === 401) return null;
    if (!res.ok) {
      throw new Error('设置读取失败');
    }
    const data = (await res.json()) as { value?: unknown };
    return typeof data.value === 'string' ? data.value : null;
  },
  setItem: async (name, value) => {
    if (typeof window === 'undefined') return;
    const res = await fetch(`/api/user-settings/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) {
      throw new Error('设置保存失败');
    }
  },
  removeItem: async (name) => {
    if (typeof window === 'undefined') return;
    const res = await fetch(`/api/user-settings/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error('设置删除失败');
    }
  },
};

const DEFAULT_TTS_PROVIDER_ID: TTSProviderId = 'aliyun-cosyvoice-tts';
const DEFAULT_WEB_SEARCH_PROVIDER_ID: WebSearchProviderId = 'firecrawl';

function isValidTTSVoice(providerId: TTSProviderId, voice: string | undefined): voice is string {
  if (!voice) return false;
  return TTS_PROVIDERS[providerId]?.voices.some((item) => item.id === voice) ?? false;
}

/** Available playback speed tiers */
export const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export interface SettingsState {
  // Model selection
  providerId: ProviderId;
  modelId: string;

  // Provider configurations (unified JSON storage)
  providersConfig: ProvidersConfig;

  // Audio settings
  ttsProviderId: TTSProviderId;
  ttsVoice: string;

  // Audio provider configurations
  ttsProvidersConfig: Record<
    TTSProviderId,
    {
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      modelId?: string;
      isServerConfigured?: boolean;
      serverBaseUrl?: string;
      isBuiltIn?: boolean;
      requiresApiKey?: boolean;
    }
  >;

  // Web Search settings
  webSearchProviderId: WebSearchProviderId;
  webSearchProvidersConfig: Record<
    WebSearchProviderId,
    {
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      isServerConfigured?: boolean;
      serverBaseUrl?: string;
    }
  >;

  // Global TTS toggle
  ttsEnabled: boolean;

  // Playback controls
  ttsMuted: boolean;
  ttsVolume: number; // 0-1, actual volume level
  autoPlayLecture: boolean;
  playbackSpeed: PlaybackSpeed;

  // Agent settings
  selectedAgentIds: string[];
  maxTurns: string;
  agentMode: 'preset' | 'auto';
  autoAgentCount: number;

  // Layout preferences
  sidebarCollapsed: boolean;
  chatAreaCollapsed: boolean;
  chatAreaWidth: number;

  // Actions
  setModel: (providerId: ProviderId, modelId: string) => void;
  setProviderConfig: (providerId: ProviderId, config: Partial<ProvidersConfig[ProviderId]>) => void;
  setTTSMuted: (muted: boolean) => void;
  setTTSVolume: (volume: number) => void;
  setAutoPlayLecture: (autoPlay: boolean) => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  setSelectedAgentIds: (ids: string[]) => void;
  setMaxTurns: (turns: string) => void;
  setAgentMode: (mode: 'preset' | 'auto') => void;
  setAutoAgentCount: (count: number) => void;

  // Layout actions
  setSidebarCollapsed: (collapsed: boolean) => void;
  setChatAreaCollapsed: (collapsed: boolean) => void;
  setChatAreaWidth: (width: number) => void;

  // Audio actions
  setTTSProvider: (providerId: TTSProviderId) => void;
  setTTSVoice: (voice: string) => void;
  setTTSProviderConfig: (
    providerId: TTSProviderId,
    config: Partial<{
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      modelId: string;
    }>,
  ) => void;
  setTTSEnabled: (enabled: boolean) => void;

  // Web Search actions
  setWebSearchProvider: (providerId: WebSearchProviderId) => void;
  setWebSearchProviderConfig: (
    providerId: WebSearchProviderId,
    config: Partial<{ apiKey: string; baseUrl: string; enabled: boolean }>,
  ) => void;

  // Server provider actions
  fetchServerProviders: () => Promise<void>;
}

// Initialize default providers config
const getDefaultProvidersConfig = (): ProvidersConfig => {
  const config: ProvidersConfig = {} as ProvidersConfig;
  Object.keys(PROVIDERS).forEach((pid) => {
    const provider = PROVIDERS[pid as ProviderId];
    config[pid as ProviderId] = {
      apiKey: '',
      models: provider.models,
      name: provider.name,
      type: provider.type,
      defaultBaseUrl: provider.defaultBaseUrl,
      icon: provider.icon,
      requiresApiKey: provider.requiresApiKey,
      isBuiltIn: true,
    };
  });
  return config;
};

// Initialize default audio config
const getDefaultAudioConfig = () => ({
  ttsProviderId: DEFAULT_TTS_PROVIDER_ID,
  ttsVoice: DEFAULT_TTS_VOICES[DEFAULT_TTS_PROVIDER_ID],
  ttsProvidersConfig: {
    [DEFAULT_TTS_PROVIDER_ID]: {
      apiKey: '',
      baseUrl: '',
      modelId: DEFAULT_TTS_MODELS[DEFAULT_TTS_PROVIDER_ID],
      enabled: true,
    },
  } as Record<
    TTSProviderId,
    { apiKey: string; baseUrl: string; modelId?: string; enabled: boolean }
  >,
});

// Initialize default Web Search config
const getDefaultWebSearchConfig = () => ({
  webSearchProviderId: DEFAULT_WEB_SEARCH_PROVIDER_ID,
  webSearchProvidersConfig: {
    [DEFAULT_WEB_SEARCH_PROVIDER_ID]: { apiKey: '', baseUrl: '', enabled: true },
  } as Record<WebSearchProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
});

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => {
      const defaultAudioConfig = getDefaultAudioConfig();
      const defaultWebSearchConfig = getDefaultWebSearchConfig();
      const initialProvidersConfig = getDefaultProvidersConfig();

      return {
        providerId: DEFAULT_PROVIDER_ID,
        modelId: DEFAULT_MODEL_ID,
        providersConfig: initialProvidersConfig,
        selectedAgentIds: ['default-1', 'default-2', 'default-3'],
        maxTurns: '10',
        agentMode: 'auto' as const,
        autoAgentCount: 3,

        // Playback controls
        ttsMuted: false,
        ttsVolume: 1,
        autoPlayLecture: false,
        playbackSpeed: 1,

        // Layout preferences
        sidebarCollapsed: true,
        chatAreaCollapsed: true,
        chatAreaWidth: 320,

        // Audio settings (use defaults)
        ...defaultAudioConfig,

        // Audio feature toggle (on by default)
        ttsEnabled: true,

        // Web Search settings (use defaults)
        ...defaultWebSearchConfig,

        // Actions
        setModel: () => set({ providerId: DEFAULT_PROVIDER_ID, modelId: DEFAULT_MODEL_ID }),

        setProviderConfig: (providerId, config) =>
          set((state) => {
            const { apiKey: _apiKey, ...safeConfig } = config;
            const providersConfig = {
              ...state.providersConfig,
              [providerId]: {
                ...state.providersConfig[providerId],
                ...safeConfig,
                apiKey: '',
              },
            };
            return { providersConfig };
          }),
        setTTSMuted: (muted) => set({ ttsMuted: muted }),

        setTTSVolume: (volume) => set({ ttsVolume: Math.max(0, Math.min(1, volume)) }),

        setAutoPlayLecture: (autoPlay) => set({ autoPlayLecture: autoPlay }),

        setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

        setSelectedAgentIds: (ids) => set({ selectedAgentIds: ids }),

        setMaxTurns: (turns) => set({ maxTurns: turns }),
        setAgentMode: (mode) => set({ agentMode: mode }),
        setAutoAgentCount: (count) => set({ autoAgentCount: count }),

        // Layout actions
        setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
        setChatAreaCollapsed: (collapsed) => set({ chatAreaCollapsed: collapsed }),
        setChatAreaWidth: (width) => set({ chatAreaWidth: width }),

        // Audio actions
        setTTSProvider: (providerId) =>
          set((state) => {
            const defaultVoice = DEFAULT_TTS_VOICES[providerId as BuiltInTTSProviderId];
            const voice = isValidTTSVoice(providerId, state.ttsVoice)
              ? state.ttsVoice
              : defaultVoice;
            return {
              ttsProviderId: providerId,
              ttsVoice: voice,
            };
          }),

        setTTSVoice: (voice) =>
          set((state) => ({
            ttsVoice: isValidTTSVoice(state.ttsProviderId, voice)
              ? voice
              : DEFAULT_TTS_VOICES[state.ttsProviderId as BuiltInTTSProviderId],
          })),

        setTTSProviderConfig: (providerId, config) =>
          set((state) => {
            const { apiKey: _apiKey, baseUrl: _baseUrl, ...safeConfig } = config;
            return {
              ttsProvidersConfig: {
                ...state.ttsProvidersConfig,
                [providerId]: {
                  ...state.ttsProvidersConfig[providerId],
                  ...safeConfig,
                  apiKey: '',
                  baseUrl: '',
                },
              },
            };
          }),

        setTTSEnabled: (enabled) => set({ ttsEnabled: enabled }),

        // Web Search actions
        setWebSearchProvider: (providerId) => set({ webSearchProviderId: providerId }),
        setWebSearchProviderConfig: (providerId, config) =>
          set((state) => {
            const { apiKey: _apiKey, baseUrl: _baseUrl, ...safeConfig } = config;
            return {
              webSearchProvidersConfig: {
                ...state.webSearchProvidersConfig,
                [providerId]: {
                  ...state.webSearchProvidersConfig[providerId],
                  ...safeConfig,
                  apiKey: '',
                  baseUrl: '',
                },
              },
            };
          }),

        // Fetch server-configured providers and merge into local state
        fetchServerProviders: async () => {
          try {
            const res = await fetch('/api/server-providers');
            if (!res.ok) return;
            const data = (await res.json()) as {
              providers: Record<string, object>;
              tts: Record<string, { baseUrl?: string }>;
              webSearch: Record<string, { baseUrl?: string }>;
            };

            set((state) => {
              const newProvidersConfig = getDefaultProvidersConfig();
              newProvidersConfig[DEFAULT_PROVIDER_ID] = {
                ...newProvidersConfig[DEFAULT_PROVIDER_ID],
                apiKey: '',
                isServerConfigured: !!data.providers[DEFAULT_PROVIDER_ID],
              };

              const defaultAudio = getDefaultAudioConfig();
              const newTTSConfig = {
                [DEFAULT_TTS_PROVIDER_ID]: {
                  ...defaultAudio.ttsProvidersConfig[DEFAULT_TTS_PROVIDER_ID],
                  enabled: state.ttsProvidersConfig[DEFAULT_TTS_PROVIDER_ID]?.enabled ?? true,
                  apiKey: '',
                  baseUrl: '',
                  modelId: DEFAULT_TTS_MODELS[DEFAULT_TTS_PROVIDER_ID],
                  isServerConfigured: !!data.tts[DEFAULT_TTS_PROVIDER_ID],
                  serverBaseUrl: data.tts[DEFAULT_TTS_PROVIDER_ID]?.baseUrl,
                },
              } as SettingsState['ttsProvidersConfig'];

              const defaultWebSearch = getDefaultWebSearchConfig();
              const webSearchServerConfig = data.webSearch[DEFAULT_WEB_SEARCH_PROVIDER_ID];
              const newWebSearchConfig = {
                [DEFAULT_WEB_SEARCH_PROVIDER_ID]: {
                  ...defaultWebSearch.webSearchProvidersConfig[DEFAULT_WEB_SEARCH_PROVIDER_ID],
                  enabled: state.webSearchProvidersConfig[DEFAULT_WEB_SEARCH_PROVIDER_ID]?.enabled ?? true,
                  apiKey: '',
                  baseUrl: '',
                  isServerConfigured: !!webSearchServerConfig,
                  serverBaseUrl: webSearchServerConfig?.baseUrl,
                },
              } as SettingsState['webSearchProvidersConfig'];

              const ttsVoice = isValidTTSVoice(DEFAULT_TTS_PROVIDER_ID, state.ttsVoice)
                ? state.ttsVoice
                : DEFAULT_TTS_VOICES[DEFAULT_TTS_PROVIDER_ID];
              const ttsEnabled =
                state.ttsEnabled && !!newTTSConfig[DEFAULT_TTS_PROVIDER_ID].isServerConfigured;

              return {
                providersConfig: newProvidersConfig,
                ttsProvidersConfig: newTTSConfig,
                webSearchProvidersConfig: newWebSearchConfig,
                providerId: DEFAULT_PROVIDER_ID,
                modelId: DEFAULT_MODEL_ID,
                ttsProviderId: DEFAULT_TTS_PROVIDER_ID,
                ttsVoice,
                ttsEnabled,
                webSearchProviderId: DEFAULT_WEB_SEARCH_PROVIDER_ID,
              };
            });
          } catch (e) {
            log.warn('Failed to fetch server providers:', e);
          }
        },
      };
    },
    {
      name: 'settings-storage',
      version: 1,
      storage: createJSONStorage(() => accountSettingsStorage),
      skipHydration: true,
      merge: (persistedState, currentState) => {
        // 历史版本曾持久化 thinkingConfigs，丢弃这个遗留键，下次写入时即被清除
        const persisted = {
          ...((persistedState ?? {}) as Partial<SettingsState> & { thinkingConfigs?: unknown }),
        };
        delete persisted.thinkingConfigs;
        const merged = { ...currentState, ...persisted };
        const ttsVoice = isValidTTSVoice(DEFAULT_TTS_PROVIDER_ID, persisted.ttsVoice)
          ? persisted.ttsVoice
          : DEFAULT_TTS_VOICES[DEFAULT_TTS_PROVIDER_ID];
        return {
          ...merged,
          providersConfig: currentState.providersConfig,
          ttsProvidersConfig: currentState.ttsProvidersConfig,
          webSearchProvidersConfig: currentState.webSearchProvidersConfig,
          providerId: DEFAULT_PROVIDER_ID,
          modelId: DEFAULT_MODEL_ID,
          ttsProviderId: DEFAULT_TTS_PROVIDER_ID,
          ttsVoice,
          webSearchProviderId: DEFAULT_WEB_SEARCH_PROVIDER_ID,
        } as SettingsState;
      },
    },
  ),
);
