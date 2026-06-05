/**
 * Settings Store
 * Global settings state synchronized with the signed-in account
 */

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { ProviderId } from '@/lib/ai/providers';
import type { ProvidersConfig } from '@/lib/types/settings';
import { DEFAULT_MODEL_ID, DEFAULT_PROVIDER_ID, PROVIDERS } from '@/lib/ai/providers';
import type { ThinkingConfig } from '@/lib/types/provider';
import { getThinkingConfigKey, supportsConfigurableThinking } from '@/lib/ai/thinking-config';
import type { TTSProviderId, ASRProviderId, BuiltInTTSProviderId } from '@/lib/audio/types';
import {
  ARK_ASR_MODEL_ID,
  ASR_PROVIDERS,
  DEFAULT_TTS_VOICES,
  MINIMAX_TTS_MODEL_ID,
  TTS_PROVIDERS,
} from '@/lib/audio/constants';
import { MINIMAX_IMAGE_MODEL_ID, MINIMAX_VIDEO_MODEL_ID } from '@/lib/ai/minimax-models';
import type { PDFProviderId } from '@/lib/pdf/types';
import type { ImageProviderId, VideoProviderId } from '@/lib/media/types';
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

function pruneThinkingConfigs(
  thinkingConfigs: Record<string, ThinkingConfig> | undefined,
  providersConfig: ProvidersConfig | undefined,
): Record<string, ThinkingConfig> {
  if (!thinkingConfigs || !providersConfig) return {};

  const validKeys = new Set<string>();
  for (const [providerId, providerConfig] of Object.entries(providersConfig)) {
    for (const model of providerConfig.models) {
      if (supportsConfigurableThinking(model.capabilities?.thinking)) {
        validKeys.add(getThinkingConfigKey(providerId, model.id));
      }
    }
  }

  return Object.fromEntries(
    Object.entries(thinkingConfigs).filter(([key]) => validKeys.has(key)),
  ) as Record<string, ThinkingConfig>;
}

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
  thinkingConfigs: Record<string, ThinkingConfig>;

  // Provider configurations (unified JSON storage)
  providersConfig: ProvidersConfig;

  // Audio settings
  ttsProviderId: TTSProviderId;
  ttsVoice: string;
  ttsSpeed: number;
  asrProviderId: ASRProviderId;
  asrLanguage: string;

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

  asrProvidersConfig: Record<
    ASRProviderId,
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

  // PDF settings
  pdfProviderId: PDFProviderId;
  pdfProvidersConfig: Record<
    PDFProviderId,
    {
      apiKey: string;
      enabled: boolean;
      isServerConfigured?: boolean;
    }
  >;

  // Image Generation settings
  imageProviderId: ImageProviderId;
  imageModelId: string;
  imageProvidersConfig: Record<
    ImageProviderId,
    {
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      isServerConfigured?: boolean;
      serverBaseUrl?: string;
    }
  >;

  // Video Generation settings
  videoProviderId: VideoProviderId;
  videoModelId: string;
  videoProvidersConfig: Record<
    VideoProviderId,
    {
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      isServerConfigured?: boolean;
      serverBaseUrl?: string;
    }
  >;

  // Media generation toggles
  imageGenerationEnabled: boolean;
  videoGenerationEnabled: boolean;

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

  // Global TTS/ASR toggles
  ttsEnabled: boolean;
  asrEnabled: boolean;

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
  setModelWithThinkingConfig: (
    providerId: ProviderId,
    modelId: string,
    config: ThinkingConfig,
  ) => void;
  setThinkingConfig: (
    providerId: ProviderId,
    modelId: string,
    config: ThinkingConfig | undefined,
  ) => void;
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
  setTTSSpeed: (speed: number) => void;
  setASRProvider: (providerId: ASRProviderId) => void;
  setASRLanguage: (language: string) => void;
  setTTSProviderConfig: (
    providerId: TTSProviderId,
    config: Partial<{
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      modelId: string;
    }>,
  ) => void;
  setASRProviderConfig: (
    providerId: ASRProviderId,
    config: Partial<{
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      modelId: string;
    }>,
  ) => void;
  setTTSEnabled: (enabled: boolean) => void;
  setASREnabled: (enabled: boolean) => void;

  // PDF actions
  setPDFProvider: (providerId: PDFProviderId) => void;
  setPDFProviderConfig: (
    providerId: PDFProviderId,
    config: Partial<{ apiKey: string; enabled: boolean }>,
  ) => void;

  // Image Generation actions
  setImageProvider: (providerId: ImageProviderId) => void;
  setImageModelId: (modelId: string) => void;
  setImageProviderConfig: (
    providerId: ImageProviderId,
    config: Partial<{
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
    }>,
  ) => void;

  // Video Generation actions
  setVideoProvider: (providerId: VideoProviderId) => void;
  setVideoModelId: (modelId: string) => void;
  setVideoProviderConfig: (
    providerId: VideoProviderId,
    config: Partial<{
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
    }>,
  ) => void;

  // Media generation toggle actions
  setImageGenerationEnabled: (enabled: boolean) => void;
  setVideoGenerationEnabled: (enabled: boolean) => void;

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
  ttsProviderId: 'minimax-tts' as TTSProviderId,
  ttsVoice: DEFAULT_TTS_VOICES['minimax-tts'],
  ttsSpeed: 1.0,
  asrProviderId: 'ark-asr' as ASRProviderId,
  asrLanguage: 'zh',
  ttsProvidersConfig: {
    'minimax-tts': { apiKey: '', baseUrl: '', modelId: MINIMAX_TTS_MODEL_ID, enabled: true },
  } as Record<
    TTSProviderId,
    { apiKey: string; baseUrl: string; modelId?: string; enabled: boolean }
  >,
  asrProvidersConfig: {
    'ark-asr': { apiKey: '', baseUrl: '', modelId: ARK_ASR_MODEL_ID, enabled: true },
  } as Record<ASRProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
});

// Initialize default PDF config
const getDefaultPDFConfig = () => ({
  pdfProviderId: 'mineru-cloud' as PDFProviderId,
  pdfProvidersConfig: {
    'mineru-cloud': { apiKey: '', enabled: false },
  } as Record<PDFProviderId, { apiKey: string; enabled: boolean }>,
});

// Initialize default Image config
const getDefaultImageConfig = () => ({
  imageProviderId: 'minimax-image' as ImageProviderId,
  imageModelId: MINIMAX_IMAGE_MODEL_ID,
  imageProvidersConfig: {
    'minimax-image': { apiKey: '', baseUrl: '', enabled: false },
  } as Record<ImageProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
});

// Initialize default Video config
const getDefaultVideoConfig = () => ({
  videoProviderId: 'minimax-video' as VideoProviderId,
  videoModelId: MINIMAX_VIDEO_MODEL_ID,
  videoProvidersConfig: {
    'minimax-video': { apiKey: '', baseUrl: '', enabled: false },
  } as Record<VideoProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
});

// Initialize default Web Search config
const getDefaultWebSearchConfig = () => ({
  webSearchProviderId: 'xcrawl' as WebSearchProviderId,
  webSearchProvidersConfig: {
    xcrawl: { apiKey: '', baseUrl: '', enabled: true },
  } as Record<WebSearchProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
});

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => {
      const defaultAudioConfig = getDefaultAudioConfig();
      const defaultPDFConfig = getDefaultPDFConfig();
      const defaultImageConfig = getDefaultImageConfig();
      const defaultVideoConfig = getDefaultVideoConfig();
      const defaultWebSearchConfig = getDefaultWebSearchConfig();
      const initialProvidersConfig = getDefaultProvidersConfig();

      return {
        providerId: DEFAULT_PROVIDER_ID,
        modelId: DEFAULT_MODEL_ID,
        thinkingConfigs: {},
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

        // PDF settings (use defaults)
        ...defaultPDFConfig,

        // Image settings (use defaults)
        ...defaultImageConfig,

        // Video settings (use defaults)
        ...defaultVideoConfig,

        // Media generation toggles (off by default)
        imageGenerationEnabled: false,
        videoGenerationEnabled: false,

        // Audio feature toggles (on by default)
        ttsEnabled: true,
        asrEnabled: true,

        // Web Search settings (use defaults)
        ...defaultWebSearchConfig,

        // Actions
        setModel: () => set({ providerId: DEFAULT_PROVIDER_ID, modelId: DEFAULT_MODEL_ID }),

        setModelWithThinkingConfig: (_providerId, _modelId, config) =>
          set((state) => {
            const key = getThinkingConfigKey(DEFAULT_PROVIDER_ID, DEFAULT_MODEL_ID);
            return {
              providerId: DEFAULT_PROVIDER_ID,
              modelId: DEFAULT_MODEL_ID,
              thinkingConfigs: {
                ...state.thinkingConfigs,
                [key]: config,
              },
            };
          }),

        setThinkingConfig: (providerId, modelId, config) =>
          set((state) => {
            const key = getThinkingConfigKey(providerId, modelId);
            const next = { ...state.thinkingConfigs };
            if (config) {
              next[key] = config;
            } else {
              delete next[key];
            }
            return { thinkingConfigs: next };
          }),

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
            return {
              providersConfig,
              thinkingConfigs: pruneThinkingConfigs(state.thinkingConfigs, providersConfig),
            };
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

        setTTSSpeed: (speed) => set({ ttsSpeed: speed }),

        setASRProvider: (providerId) =>
          set((state) => {
            const supportedLanguages =
              ASR_PROVIDERS[providerId as keyof typeof ASR_PROVIDERS]?.supportedLanguages || [];
            const isLanguageValid = supportedLanguages.includes(state.asrLanguage);
            return {
              asrProviderId: providerId,
              ...(isLanguageValid ? {} : { asrLanguage: supportedLanguages[0] || 'auto' }),
            };
          }),

        setASRLanguage: (language) => set({ asrLanguage: language }),

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

        setASRProviderConfig: (providerId, config) =>
          set((state) => {
            const { apiKey: _apiKey, baseUrl: _baseUrl, ...safeConfig } = config;
            return {
              asrProvidersConfig: {
                ...state.asrProvidersConfig,
                [providerId]: {
                  ...state.asrProvidersConfig[providerId],
                  ...safeConfig,
                  apiKey: '',
                  baseUrl: '',
                },
              },
            };
          }),

        // PDF actions
        setPDFProvider: () => set({ pdfProviderId: get().pdfProviderId }),

        setPDFProviderConfig: (providerId, config) =>
          set((state) => ({
            pdfProvidersConfig: {
              ...state.pdfProvidersConfig,
              [providerId]: (() => {
                const { apiKey: _apiKey, ...safeConfig } = config;
                const nextConfig = {
                  ...state.pdfProvidersConfig[providerId],
                  ...safeConfig,
                  apiKey: '',
                };
                delete (nextConfig as Record<string, unknown>).baseUrl;
                delete (nextConfig as Record<string, unknown>).serverBaseUrl;
                return nextConfig;
              })(),
            },
          })),

        // Image Generation actions
        setImageProvider: () => set({ imageProviderId: 'minimax-image' as ImageProviderId }),
        setImageModelId: () => set({ imageModelId: MINIMAX_IMAGE_MODEL_ID }),

        setImageProviderConfig: (providerId, config) =>
          set((state) => {
            const { apiKey: _apiKey, baseUrl: _baseUrl, ...safeConfig } = config;
            return {
              imageProvidersConfig: {
                ...state.imageProvidersConfig,
                [providerId]: {
                  ...state.imageProvidersConfig[providerId],
                  ...safeConfig,
                  apiKey: '',
                  baseUrl: '',
                },
              },
            };
          }),

        // Video Generation actions
        setVideoProvider: () => set({ videoProviderId: 'minimax-video' as VideoProviderId }),
        setVideoModelId: () => set({ videoModelId: MINIMAX_VIDEO_MODEL_ID }),

        setVideoProviderConfig: (providerId, config) =>
          set((state) => {
            const { apiKey: _apiKey, baseUrl: _baseUrl, ...safeConfig } = config;
            return {
              videoProvidersConfig: {
                ...state.videoProvidersConfig,
                [providerId]: {
                  ...state.videoProvidersConfig[providerId],
                  ...safeConfig,
                  apiKey: '',
                  baseUrl: '',
                },
              },
            };
          }),

        // Media generation toggle actions
        setImageGenerationEnabled: (enabled) => {
          if (enabled) {
            const cfg = get().imageProvidersConfig;
            const hasUsable = Object.values(cfg).some((c) => c.isServerConfigured);
            if (!hasUsable) return;
          }
          set({ imageGenerationEnabled: enabled });
        },
        setVideoGenerationEnabled: (enabled) => {
          if (enabled) {
            const cfg = get().videoProvidersConfig;
            const hasUsable = Object.values(cfg).some((c) => c.isServerConfigured);
            if (!hasUsable) return;
          }
          set({ videoGenerationEnabled: enabled });
        },
        setTTSEnabled: (enabled) => set({ ttsEnabled: enabled }),
        setASREnabled: (enabled) => set({ asrEnabled: enabled }),

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
              asr: Record<string, { baseUrl?: string }>;
              pdf: Record<string, object>;
              image: Record<string, { baseUrl?: string }>;
              video: Record<string, { baseUrl?: string }>;
              webSearch: Record<string, { baseUrl?: string }>;
            };

            set((state) => {
              const newProvidersConfig = getDefaultProvidersConfig();
              newProvidersConfig.minimax = {
                ...newProvidersConfig.minimax,
                apiKey: '',
                isServerConfigured: !!data.providers.minimax,
              };

              const defaultAudio = getDefaultAudioConfig();
              const newTTSConfig = {
                'minimax-tts': {
                  ...defaultAudio.ttsProvidersConfig['minimax-tts'],
                  enabled: state.ttsProvidersConfig['minimax-tts']?.enabled ?? true,
                  apiKey: '',
                  baseUrl: '',
                  modelId: MINIMAX_TTS_MODEL_ID,
                  isServerConfigured: !!data.tts['minimax-tts'],
                  serverBaseUrl: data.tts['minimax-tts']?.baseUrl,
                },
              } as SettingsState['ttsProvidersConfig'];

              const newASRConfig = {
                'ark-asr': {
                  ...defaultAudio.asrProvidersConfig['ark-asr'],
                  enabled: state.asrProvidersConfig['ark-asr']?.enabled ?? true,
                  apiKey: '',
                  baseUrl: '',
                  modelId: ARK_ASR_MODEL_ID,
                  isServerConfigured: !!data.asr['ark-asr'],
                  serverBaseUrl: data.asr['ark-asr']?.baseUrl,
                },
              } as SettingsState['asrProvidersConfig'];

              const defaultPDF = getDefaultPDFConfig();
              const newPDFConfig = {
                'mineru-cloud': {
                  ...defaultPDF.pdfProvidersConfig['mineru-cloud'],
                  apiKey: '',
                  enabled: state.pdfProvidersConfig['mineru-cloud']?.enabled ?? false,
                  isServerConfigured: !!data.pdf['mineru-cloud'],
                },
              } as SettingsState['pdfProvidersConfig'];

              const defaultImage = getDefaultImageConfig();
              const imageServerConfig = data.image['minimax-image'];
              const newImageConfig = {
                'minimax-image': {
                  ...defaultImage.imageProvidersConfig['minimax-image'],
                  enabled: state.imageProvidersConfig['minimax-image']?.enabled ?? false,
                  apiKey: '',
                  baseUrl: '',
                  isServerConfigured: !!imageServerConfig,
                  serverBaseUrl: imageServerConfig?.baseUrl,
                },
              } as SettingsState['imageProvidersConfig'];

              const defaultVideo = getDefaultVideoConfig();
              const videoServerConfig = data.video['minimax-video'];
              const newVideoConfig = {
                'minimax-video': {
                  ...defaultVideo.videoProvidersConfig['minimax-video'],
                  enabled: state.videoProvidersConfig['minimax-video']?.enabled ?? false,
                  apiKey: '',
                  baseUrl: '',
                  isServerConfigured: !!videoServerConfig,
                  serverBaseUrl: videoServerConfig?.baseUrl,
                },
              } as SettingsState['videoProvidersConfig'];

              const defaultWebSearch = getDefaultWebSearchConfig();
              const webSearchServerConfig = data.webSearch.xcrawl;
              const newWebSearchConfig = {
                xcrawl: {
                  ...defaultWebSearch.webSearchProvidersConfig.xcrawl,
                  enabled: state.webSearchProvidersConfig.xcrawl?.enabled ?? true,
                  apiKey: '',
                  baseUrl: '',
                  isServerConfigured: !!webSearchServerConfig,
                  serverBaseUrl: webSearchServerConfig?.baseUrl,
                },
              } as SettingsState['webSearchProvidersConfig'];

              const imageGenerationEnabled =
                state.imageGenerationEnabled && !!newImageConfig['minimax-image'].isServerConfigured;
              const videoGenerationEnabled =
                state.videoGenerationEnabled && !!newVideoConfig['minimax-video'].isServerConfigured;
              const ttsVoice = isValidTTSVoice('minimax-tts', state.ttsVoice)
                ? state.ttsVoice
                : DEFAULT_TTS_VOICES['minimax-tts'];
              const ttsEnabled =
                state.ttsEnabled && !!newTTSConfig['minimax-tts'].isServerConfigured;

              return {
                providersConfig: newProvidersConfig,
                thinkingConfigs: pruneThinkingConfigs(state.thinkingConfigs, newProvidersConfig),
                ttsProvidersConfig: newTTSConfig,
                asrProvidersConfig: newASRConfig,
                pdfProvidersConfig: newPDFConfig,
                imageProvidersConfig: newImageConfig,
                videoProvidersConfig: newVideoConfig,
                webSearchProvidersConfig: newWebSearchConfig,
                providerId: DEFAULT_PROVIDER_ID,
                modelId: DEFAULT_MODEL_ID,
                ttsProviderId: 'minimax-tts' as TTSProviderId,
                ttsVoice,
                ttsEnabled,
                asrProviderId: 'ark-asr' as ASRProviderId,
                pdfProviderId: 'mineru-cloud' as PDFProviderId,
                imageProviderId: 'minimax-image' as ImageProviderId,
                imageModelId: MINIMAX_IMAGE_MODEL_ID,
                imageGenerationEnabled,
                videoProviderId: 'minimax-video' as VideoProviderId,
                videoModelId: MINIMAX_VIDEO_MODEL_ID,
                videoGenerationEnabled,
                webSearchProviderId: 'xcrawl' as WebSearchProviderId,
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
        const persisted = (persistedState ?? {}) as Partial<SettingsState>;
        const merged = { ...currentState, ...persisted };
        const thinkingConfigs = pruneThinkingConfigs(
          persisted.thinkingConfigs,
          currentState.providersConfig,
        );
        const ttsVoice = isValidTTSVoice('minimax-tts', persisted.ttsVoice)
          ? persisted.ttsVoice
          : DEFAULT_TTS_VOICES['minimax-tts'];
        return {
          ...merged,
          providersConfig: currentState.providersConfig,
          ttsProvidersConfig: currentState.ttsProvidersConfig,
          asrProvidersConfig: currentState.asrProvidersConfig,
          pdfProvidersConfig: currentState.pdfProvidersConfig,
          imageProvidersConfig: currentState.imageProvidersConfig,
          videoProvidersConfig: currentState.videoProvidersConfig,
          webSearchProvidersConfig: currentState.webSearchProvidersConfig,
          providerId: DEFAULT_PROVIDER_ID,
          modelId: DEFAULT_MODEL_ID,
          ttsProviderId: 'minimax-tts' as TTSProviderId,
          ttsVoice,
          asrProviderId: 'ark-asr' as ASRProviderId,
          pdfProviderId: currentState.pdfProviderId,
          imageProviderId: 'minimax-image' as ImageProviderId,
          imageModelId: MINIMAX_IMAGE_MODEL_ID,
          videoProviderId: 'minimax-video' as VideoProviderId,
          videoModelId: MINIMAX_VIDEO_MODEL_ID,
          webSearchProviderId: 'xcrawl' as WebSearchProviderId,
          thinkingConfigs,
        } as SettingsState;
      },
    },
  ),
);
