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
import { ASR_PROVIDERS, DEFAULT_TTS_VOICES } from '@/lib/audio/constants';
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
  ttsProviderId: 'qwen-tts' as TTSProviderId,
  ttsVoice: DEFAULT_TTS_VOICES['qwen-tts'],
  ttsSpeed: 1.0,
  asrProviderId: 'qwen-asr' as ASRProviderId,
  asrLanguage: 'zh',
  ttsProvidersConfig: {
    'qwen-tts': { apiKey: '', baseUrl: '', modelId: 'qwen3-tts-flash', enabled: true },
  } as Record<
    TTSProviderId,
    { apiKey: string; baseUrl: string; modelId?: string; enabled: boolean }
  >,
  asrProvidersConfig: {
    'qwen-asr': { apiKey: '', baseUrl: '', modelId: 'qwen3-asr-flash', enabled: true },
  } as Record<ASRProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
});

// Initialize default PDF config
const getDefaultPDFConfig = () => ({
  pdfProviderId: 'unpdf' as PDFProviderId,
  pdfProvidersConfig: {
    unpdf: { apiKey: '', enabled: true },
    'mineru-cloud': { apiKey: '', enabled: false },
  } as Record<PDFProviderId, { apiKey: string; enabled: boolean }>,
});

// Initialize default Image config
const getDefaultImageConfig = () => ({
  imageProviderId: 'qwen-image' as ImageProviderId,
  imageModelId: 'qwen-image-2.0-pro',
  imageProvidersConfig: {
    'qwen-image': { apiKey: '', baseUrl: '', enabled: false },
  } as Record<ImageProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
});

// Initialize default Video config
const getDefaultVideoConfig = () => ({
  videoProviderId: 'qwen-video' as VideoProviderId,
  videoModelId: 'happyhorse-1.0-t2v',
  videoProvidersConfig: {
    'qwen-video': { apiKey: '', baseUrl: '', enabled: false },
  } as Record<VideoProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>,
});

// Initialize default Web Search config
const getDefaultWebSearchConfig = () => ({
  webSearchProviderId: 'bailian' as WebSearchProviderId,
  webSearchProvidersConfig: {
    bailian: { apiKey: '', baseUrl: '', enabled: true },
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
            const shouldUpdateVoice = state.ttsProviderId !== providerId;
            const defaultVoice = DEFAULT_TTS_VOICES[providerId as BuiltInTTSProviderId];
            return {
              ttsProviderId: providerId,
              ...(shouldUpdateVoice && { ttsVoice: defaultVoice }),
            };
          }),

        setTTSVoice: (voice) => set({ ttsVoice: voice }),

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
        setImageProvider: () => set({ imageProviderId: 'qwen-image' as ImageProviderId }),
        setImageModelId: () => set({ imageModelId: 'qwen-image-2.0-pro' }),

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
        setVideoProvider: () => set({ videoProviderId: 'qwen-video' as VideoProviderId }),
        setVideoModelId: () => set({ videoModelId: 'happyhorse-1.0-t2v' }),

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
        setWebSearchProvider: () => set({ webSearchProviderId: 'bailian' as WebSearchProviderId }),
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
              newProvidersConfig.qwen = {
                ...newProvidersConfig.qwen,
                apiKey: '',
                isServerConfigured: !!data.providers.qwen,
              };

              const defaultAudio = getDefaultAudioConfig();
              const newTTSConfig = {
                'qwen-tts': {
                  ...defaultAudio.ttsProvidersConfig['qwen-tts'],
                  enabled: state.ttsProvidersConfig['qwen-tts']?.enabled ?? true,
                  apiKey: '',
                  baseUrl: '',
                  modelId: 'qwen3-tts-flash',
                  isServerConfigured: !!data.tts['qwen-tts'],
                  serverBaseUrl: data.tts['qwen-tts']?.baseUrl,
                },
              } as SettingsState['ttsProvidersConfig'];

              const newASRConfig = {
                'qwen-asr': {
                  ...defaultAudio.asrProvidersConfig['qwen-asr'],
                  enabled: state.asrProvidersConfig['qwen-asr']?.enabled ?? true,
                  apiKey: '',
                  baseUrl: '',
                  modelId: 'qwen3-asr-flash',
                  isServerConfigured: !!data.asr['qwen-asr'],
                  serverBaseUrl: data.asr['qwen-asr']?.baseUrl,
                },
              } as SettingsState['asrProvidersConfig'];

              const defaultPDF = getDefaultPDFConfig();
              const newPDFConfig = {
                unpdf: {
                  ...defaultPDF.pdfProvidersConfig.unpdf,
                  apiKey: '',
                  enabled: true,
                },
                'mineru-cloud': {
                  ...defaultPDF.pdfProvidersConfig['mineru-cloud'],
                  apiKey: '',
                  enabled: state.pdfProvidersConfig['mineru-cloud']?.enabled ?? false,
                  isServerConfigured: !!data.pdf['mineru-cloud'],
                },
              } as SettingsState['pdfProvidersConfig'];

              const defaultImage = getDefaultImageConfig();
              const imageServerConfig = data.image['qwen-image'];
              const newImageConfig = {
                'qwen-image': {
                  ...defaultImage.imageProvidersConfig['qwen-image'],
                  enabled: state.imageProvidersConfig['qwen-image']?.enabled ?? false,
                  apiKey: '',
                  baseUrl: '',
                  isServerConfigured: !!imageServerConfig,
                  serverBaseUrl: imageServerConfig?.baseUrl,
                },
              } as SettingsState['imageProvidersConfig'];

              const defaultVideo = getDefaultVideoConfig();
              const videoServerConfig = data.video['qwen-video'];
              const newVideoConfig = {
                'qwen-video': {
                  ...defaultVideo.videoProvidersConfig['qwen-video'],
                  enabled: state.videoProvidersConfig['qwen-video']?.enabled ?? false,
                  apiKey: '',
                  baseUrl: '',
                  isServerConfigured: !!videoServerConfig,
                  serverBaseUrl: videoServerConfig?.baseUrl,
                },
              } as SettingsState['videoProvidersConfig'];

              const defaultWebSearch = getDefaultWebSearchConfig();
              const webSearchServerConfig = data.webSearch.bailian;
              const newWebSearchConfig = {
                bailian: {
                  ...defaultWebSearch.webSearchProvidersConfig.bailian,
                  enabled: state.webSearchProvidersConfig.bailian?.enabled ?? true,
                  apiKey: '',
                  baseUrl: '',
                  isServerConfigured: !!webSearchServerConfig,
                  serverBaseUrl: webSearchServerConfig?.baseUrl,
                },
              } as SettingsState['webSearchProvidersConfig'];

              const imageGenerationEnabled =
                state.imageGenerationEnabled && !!newImageConfig['qwen-image'].isServerConfigured;
              const videoGenerationEnabled =
                state.videoGenerationEnabled && !!newVideoConfig['qwen-video'].isServerConfigured;

              return {
                providersConfig: newProvidersConfig,
                ttsProvidersConfig: newTTSConfig,
                asrProvidersConfig: newASRConfig,
                pdfProvidersConfig: newPDFConfig,
                imageProvidersConfig: newImageConfig,
                videoProvidersConfig: newVideoConfig,
                webSearchProvidersConfig: newWebSearchConfig,
                providerId: DEFAULT_PROVIDER_ID,
                modelId: DEFAULT_MODEL_ID,
                ttsProviderId: 'qwen-tts' as TTSProviderId,
                asrProviderId: 'qwen-asr' as ASRProviderId,
                pdfProviderId: newPDFConfig['mineru-cloud'].isServerConfigured
                  ? ('mineru-cloud' as PDFProviderId)
                  : ('unpdf' as PDFProviderId),
                imageProviderId: 'qwen-image' as ImageProviderId,
                imageModelId: 'qwen-image-2.0-pro',
                imageGenerationEnabled,
                videoProviderId: 'qwen-video' as VideoProviderId,
                videoModelId: 'happyhorse-1.0-t2v',
                videoGenerationEnabled,
                webSearchProviderId: 'bailian' as WebSearchProviderId,
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
          ttsProviderId: 'qwen-tts' as TTSProviderId,
          asrProviderId: 'qwen-asr' as ASRProviderId,
          pdfProviderId: currentState.pdfProviderId,
          imageProviderId: 'qwen-image' as ImageProviderId,
          imageModelId: 'qwen-image-2.0-pro',
          videoProviderId: 'qwen-video' as VideoProviderId,
          videoModelId: 'happyhorse-1.0-t2v',
          webSearchProviderId: 'bailian' as WebSearchProviderId,
          thinkingConfigs,
        } as SettingsState;
      },
    },
  ),
);
