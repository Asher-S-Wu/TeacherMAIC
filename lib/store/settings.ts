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
import { ASR_PROVIDERS, DEFAULT_TTS_VOICES, TTS_PROVIDERS } from '@/lib/audio/constants';
import { PDF_PROVIDERS } from '@/lib/pdf/constants';
import type { PDFProviderId } from '@/lib/pdf/types';
import type { ImageProviderId, VideoProviderId } from '@/lib/media/types';
import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import { VIDEO_PROVIDERS } from '@/lib/media/video-providers';
import { WEB_SEARCH_PROVIDERS } from '@/lib/web-search/constants';
import type { WebSearchProviderId } from '@/lib/web-search/types';
import { createLogger } from '@/lib/logger';
import { validateProvider, validateModel } from '@/lib/store/settings-validation';

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

  // Auto-config lifecycle flag (persisted)
  autoConfigApplied: boolean;

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

/**
 * Check whether a provider ID exists in the given provider registry.
 */
function hasProviderId(providerMap: Record<string, unknown>, providerId?: string): boolean {
  return typeof providerId === 'string' && providerId in providerMap;
}

/**
 * Validate all persisted provider IDs against their registries.
 * Reset any stale / removed ID back to its default value.
 * Called during both migrate and merge to cover all rehydration paths.
 */
function ensureValidProviderSelections(state: Partial<SettingsState>): void {
  const defaultAudioConfig = getDefaultAudioConfig();
  const defaultPdfConfig = getDefaultPDFConfig();
  const defaultImageConfig = getDefaultImageConfig();
  const defaultVideoConfig = getDefaultVideoConfig();
  const defaultWebSearchConfig = getDefaultWebSearchConfig();

  if (!hasProviderId(PROVIDERS, state.providerId)) {
    state.providerId = DEFAULT_PROVIDER_ID;
  }

  const activeProvider = state.providerId ? PROVIDERS[state.providerId] : undefined;
  if (!activeProvider?.models.some((model) => model.id === state.modelId)) {
    state.modelId = activeProvider?.models[0]?.id || DEFAULT_MODEL_ID;
  }

  if (!hasProviderId(PDF_PROVIDERS, state.pdfProviderId)) {
    state.pdfProviderId = defaultPdfConfig.pdfProviderId;
  }

  if (!hasProviderId(WEB_SEARCH_PROVIDERS, state.webSearchProviderId)) {
    state.webSearchProviderId = defaultWebSearchConfig.webSearchProviderId;
  }

  if (!hasProviderId(IMAGE_PROVIDERS, state.imageProviderId)) {
    state.imageProviderId = defaultImageConfig.imageProviderId;
  }
  const imageModels = IMAGE_PROVIDERS[state.imageProviderId as ImageProviderId]?.models ?? [];
  if (!imageModels.some((model) => model.id === state.imageModelId)) {
    state.imageModelId = imageModels[0]?.id || defaultImageConfig.imageModelId;
  }

  if (!hasProviderId(VIDEO_PROVIDERS, state.videoProviderId)) {
    state.videoProviderId = defaultVideoConfig.videoProviderId;
  }
  const videoModels = VIDEO_PROVIDERS[state.videoProviderId as VideoProviderId]?.models ?? [];
  if (!videoModels.some((model) => model.id === state.videoModelId)) {
    state.videoModelId = videoModels[0]?.id || defaultVideoConfig.videoModelId;
  }

  if (!hasProviderId(TTS_PROVIDERS, state.ttsProviderId)) {
    state.ttsProviderId = defaultAudioConfig.ttsProviderId;
  }
  const ttsVoices = TTS_PROVIDERS[state.ttsProviderId as TTSProviderId]?.voices ?? [];
  if (!ttsVoices.some((voice) => voice.id === state.ttsVoice)) {
    state.ttsVoice = defaultAudioConfig.ttsVoice;
  }

  if (!hasProviderId(ASR_PROVIDERS, state.asrProviderId)) {
    state.asrProviderId = defaultAudioConfig.asrProviderId;
  }
  const asrLanguages = ASR_PROVIDERS[state.asrProviderId as ASRProviderId]?.supportedLanguages ?? [];
  if (!asrLanguages.includes(state.asrLanguage || '')) {
    state.asrLanguage = defaultAudioConfig.asrLanguage;
  }
}

function ensureBuiltInAudioProviders(state: Partial<SettingsState>): void {
  const defaultAudioConfig = getDefaultAudioConfig();

  const existingTTS = state.ttsProvidersConfig?.['qwen-tts'];
  state.ttsProvidersConfig = {
    'qwen-tts': {
      ...defaultAudioConfig.ttsProvidersConfig['qwen-tts'],
      apiKey: existingTTS?.apiKey || '',
      enabled: existingTTS?.enabled ?? true,
      isServerConfigured: existingTTS?.isServerConfigured,
      serverBaseUrl: existingTTS?.serverBaseUrl,
    },
  } as SettingsState['ttsProvidersConfig'];

  const existingASR = state.asrProvidersConfig?.['qwen-asr'];
  state.asrProvidersConfig = {
    'qwen-asr': {
      ...defaultAudioConfig.asrProvidersConfig['qwen-asr'],
      apiKey: existingASR?.apiKey || '',
      enabled: existingASR?.enabled ?? true,
      isServerConfigured: existingASR?.isServerConfigured,
      serverBaseUrl: existingASR?.serverBaseUrl,
    },
  } as SettingsState['asrProvidersConfig'];
}

/**
 * Ensure providersConfig includes all built-in providers and their latest models.
 * Called on every rehydrate (not just version migrations) so new providers
 * added in code are always picked up without clearing cache.
 */
function ensureBuiltInProviders(state: Partial<SettingsState>): void {
  if (!state.providersConfig) return;
  const defaultConfig = getDefaultProvidersConfig();
  const nextConfig = {} as ProvidersConfig;

  Object.keys(PROVIDERS).forEach((pid) => {
    const providerId = pid as ProviderId;
    const existing = state.providersConfig![providerId];
    if (!existing) {
      nextConfig[providerId] = defaultConfig[providerId];
    } else {
      const provider = PROVIDERS[providerId];
      nextConfig[providerId] = {
        apiKey: existing.apiKey || '',
        models: [...provider.models],
        name: provider.name,
        type: provider.type,
        defaultBaseUrl: provider.defaultBaseUrl,
        icon: provider.icon,
        requiresApiKey: provider.requiresApiKey,
        isBuiltIn: true,
        isServerConfigured: existing.isServerConfigured,
      };
    }
  });

  state.providersConfig = nextConfig;
}

/**
 * Ensure imageProvidersConfig includes all built-in image providers.
 * Called on every rehydrate so newly added image providers appear automatically.
 */
function ensureBuiltInImageProviders(state: Partial<SettingsState>): void {
  const defaultConfig = getDefaultImageConfig().imageProvidersConfig;
  const existing = state.imageProvidersConfig?.['qwen-image'];
  state.imageProvidersConfig = {
    'qwen-image': {
      ...defaultConfig['qwen-image'],
      apiKey: existing?.apiKey || '',
      enabled: existing?.enabled ?? false,
      isServerConfigured: existing?.isServerConfigured,
      serverBaseUrl: existing?.serverBaseUrl,
    },
  } as SettingsState['imageProvidersConfig'];
}

/**
 * Ensure videoProvidersConfig includes all built-in video providers.
 * Called on every rehydrate so newly added video providers appear automatically.
 */
function ensureBuiltInVideoProviders(state: Partial<SettingsState>): void {
  const defaultConfig = getDefaultVideoConfig().videoProvidersConfig;
  const existing = state.videoProvidersConfig?.['qwen-video'];
  state.videoProvidersConfig = {
    'qwen-video': {
      ...defaultConfig['qwen-video'],
      apiKey: existing?.apiKey || '',
      enabled: existing?.enabled ?? false,
      isServerConfigured: existing?.isServerConfigured,
      serverBaseUrl: existing?.serverBaseUrl,
    },
  } as SettingsState['videoProvidersConfig'];
}

function ensureBuiltInWebSearchProviders(state: Partial<SettingsState>): void {
  const defaultConfig = getDefaultWebSearchConfig().webSearchProvidersConfig;
  const existing = state.webSearchProvidersConfig?.bailian;
  state.webSearchProvidersConfig = {
    bailian: {
      ...defaultConfig.bailian,
      apiKey: existing?.apiKey || '',
      enabled: existing?.enabled ?? true,
      isServerConfigured: existing?.isServerConfigured,
      serverBaseUrl: existing?.serverBaseUrl,
    },
  } as SettingsState['webSearchProvidersConfig'];
}

function stripPDFBaseUrlFields(state: Partial<SettingsState>): void {
  if (!state.pdfProvidersConfig) return;
  for (const config of Object.values(state.pdfProvidersConfig)) {
    delete (config as Record<string, unknown>).baseUrl;
    delete (config as Record<string, unknown>).serverBaseUrl;
  }
}

type LegacySettingsMigration = {
  providerId?: ProviderId;
  modelId?: string;
  thinkingConfigs?: Record<string, ThinkingConfig>;
  providersConfig?: ProvidersConfig;
  selectedAgentIds?: string[];
  maxTurns?: string | number;
};

// 旧浏览器本地设置不自动迁移到账户。
const migrateFromOldStorage = (): LegacySettingsMigration | null => {
  return null;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => {
      // Try to migrate from old storage
      const migratedData = migrateFromOldStorage();
      const defaultAudioConfig = getDefaultAudioConfig();
      const defaultPDFConfig = getDefaultPDFConfig();
      const defaultImageConfig = getDefaultImageConfig();
      const defaultVideoConfig = getDefaultVideoConfig();
      const defaultWebSearchConfig = getDefaultWebSearchConfig();

      const initialProvidersConfig = migratedData?.providersConfig || getDefaultProvidersConfig();

      return {
        // Initial state (use migrated data if available)
        providerId: migratedData?.providerId || DEFAULT_PROVIDER_ID,
        modelId: migratedData?.modelId || DEFAULT_MODEL_ID,
        thinkingConfigs: pruneThinkingConfigs(
          migratedData?.thinkingConfigs || {},
          initialProvidersConfig,
        ),
        providersConfig: initialProvidersConfig,
        selectedAgentIds: migratedData?.selectedAgentIds || ['default-1', 'default-2', 'default-3'],
        maxTurns: migratedData?.maxTurns?.toString() || '10',
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

        autoConfigApplied: false,

        // Web Search settings (use defaults)
        ...defaultWebSearchConfig,

        // Actions
        setModel: (providerId, modelId) => set({ providerId, modelId }),

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
            const providersConfig = {
              ...state.providersConfig,
              [providerId]: {
                ...state.providersConfig[providerId],
                ...config,
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
          set((state) => ({
            ttsProvidersConfig: {
              ...state.ttsProvidersConfig,
              [providerId]: {
                ...state.ttsProvidersConfig[providerId],
                ...config,
              },
            },
          })),

        setASRProviderConfig: (providerId, config) =>
          set((state) => ({
            asrProvidersConfig: {
              ...state.asrProvidersConfig,
              [providerId]: {
                ...state.asrProvidersConfig[providerId],
                ...config,
              },
            },
          })),

        // PDF actions
        setPDFProvider: (providerId) => set({ pdfProviderId: providerId }),

        setPDFProviderConfig: (providerId, config) =>
          set((state) => ({
            pdfProvidersConfig: {
              ...state.pdfProvidersConfig,
              [providerId]: (() => {
                const nextConfig = {
                  ...state.pdfProvidersConfig[providerId],
                  ...config,
                };
                delete (nextConfig as Record<string, unknown>).baseUrl;
                delete (nextConfig as Record<string, unknown>).serverBaseUrl;
                return nextConfig;
              })(),
            },
          })),

        // Image Generation actions
        setImageProvider: (providerId) => set({ imageProviderId: providerId }),
        setImageModelId: (modelId) => set({ imageModelId: modelId }),

        setImageProviderConfig: (providerId, config) =>
          set((state) => ({
            imageProvidersConfig: {
              ...state.imageProvidersConfig,
              [providerId]: {
                ...state.imageProvidersConfig[providerId],
                ...config,
              },
            },
          })),

        // Video Generation actions
        setVideoProvider: (providerId) => set({ videoProviderId: providerId }),
        setVideoModelId: (modelId) => set({ videoModelId: modelId }),

        setVideoProviderConfig: (providerId, config) =>
          set((state) => ({
            videoProvidersConfig: {
              ...state.videoProvidersConfig,
              [providerId]: {
                ...state.videoProvidersConfig[providerId],
                ...config,
              },
            },
          })),

        // Media generation toggle actions
        setImageGenerationEnabled: (enabled) => {
          if (enabled) {
            const cfg = get().imageProvidersConfig;
            const hasUsable = Object.values(cfg).some((c) => c.isServerConfigured || c.apiKey);
            if (!hasUsable) return;
          }
          set({ imageGenerationEnabled: enabled });
        },
        setVideoGenerationEnabled: (enabled) => {
          if (enabled) {
            const cfg = get().videoProvidersConfig;
            const hasUsable = Object.values(cfg).some((c) => c.isServerConfigured || c.apiKey);
            if (!hasUsable) return;
          }
          set({ videoGenerationEnabled: enabled });
        },
        setTTSEnabled: (enabled) => set({ ttsEnabled: enabled }),
        setASREnabled: (enabled) => set({ asrEnabled: enabled }),

        // Web Search actions
        setWebSearchProvider: (providerId) => set({ webSearchProviderId: providerId }),
        setWebSearchProviderConfig: (providerId, config) =>
          set((state) => ({
            webSearchProvidersConfig: {
              ...state.webSearchProvidersConfig,
              [providerId]: {
                ...state.webSearchProvidersConfig[providerId],
                ...config,
              },
            },
          })),

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
              // Merge LLM providers
              const newProvidersConfig = getDefaultProvidersConfig();
              for (const pid of Object.keys(PROVIDERS)) {
                const key = pid as ProviderId;
                const provider = PROVIDERS[key];
                const existing = state.providersConfig[key];
                newProvidersConfig[key] = {
                  ...newProvidersConfig[key],
                  apiKey: existing?.apiKey || '',
                  isServerConfigured: false,
                  models: [...provider.models],
                };
              }
              // Set flags for server-configured providers
              for (const pid of Object.keys(data.providers)) {
                const key = pid as ProviderId;
                const provider = PROVIDERS[key];
                if (provider && newProvidersConfig[key]) {
                  newProvidersConfig[key] = {
                    ...newProvidersConfig[key],
                    isServerConfigured: true,
                    models: [...provider.models],
                  };
                }
              }

              // Merge TTS providers
              const defaultAudio = getDefaultAudioConfig();
              const newTTSConfig = {
                'qwen-tts': {
                  ...defaultAudio.ttsProvidersConfig['qwen-tts'],
                  ...state.ttsProvidersConfig['qwen-tts'],
                  modelId: 'qwen3-tts-flash',
                  baseUrl: '',
                },
              } as SettingsState['ttsProvidersConfig'];
              for (const pid of Object.keys(newTTSConfig)) {
                const key = pid as TTSProviderId;
                if (newTTSConfig[key]) {
                  newTTSConfig[key] = {
                    ...newTTSConfig[key],
                    isServerConfigured: false,
                    serverBaseUrl: undefined,
                  };
                }
              }
              for (const [pid, info] of Object.entries(data.tts)) {
                const key = pid as TTSProviderId;
                if (newTTSConfig[key]) {
                  newTTSConfig[key] = {
                    ...newTTSConfig[key],
                    isServerConfigured: true,
                    serverBaseUrl: info.baseUrl,
                  };
                }
              }

              // Merge ASR providers
              const newASRConfig = {
                'qwen-asr': {
                  ...defaultAudio.asrProvidersConfig['qwen-asr'],
                  ...state.asrProvidersConfig['qwen-asr'],
                  modelId: 'qwen3-asr-flash',
                  baseUrl: '',
                },
              } as SettingsState['asrProvidersConfig'];
              for (const pid of Object.keys(newASRConfig)) {
                const key = pid as ASRProviderId;
                if (newASRConfig[key]) {
                  newASRConfig[key] = {
                    ...newASRConfig[key],
                    isServerConfigured: false,
                    serverBaseUrl: undefined,
                  };
                }
              }
              for (const [pid, info] of Object.entries(data.asr)) {
                const key = pid as ASRProviderId;
                if (newASRConfig[key]) {
                  newASRConfig[key] = {
                    ...newASRConfig[key],
                    isServerConfigured: true,
                    serverBaseUrl: info.baseUrl,
                  };
                }
              }

              // Merge PDF providers
              const newPDFConfig = { ...state.pdfProvidersConfig };
              for (const pid of Object.keys(newPDFConfig)) {
                const key = pid as PDFProviderId;
                if (newPDFConfig[key]) {
                  delete (newPDFConfig[key] as Record<string, unknown>).baseUrl;
                  delete (newPDFConfig[key] as Record<string, unknown>).serverBaseUrl;
                  newPDFConfig[key] = {
                    ...newPDFConfig[key],
                    isServerConfigured: false,
                  };
                }
              }
              for (const pid of Object.keys(data.pdf)) {
                const key = pid as PDFProviderId;
                if (newPDFConfig[key]) {
                  newPDFConfig[key] = {
                    ...newPDFConfig[key],
                    isServerConfigured: true,
                  };
                }
              }

              // Merge Image providers
              const defaultImage = getDefaultImageConfig();
              const newImageConfig = {
                'qwen-image': {
                  ...defaultImage.imageProvidersConfig['qwen-image'],
                  ...state.imageProvidersConfig['qwen-image'],
                  baseUrl: '',
                },
              } as SettingsState['imageProvidersConfig'];
              for (const pid of Object.keys(newImageConfig)) {
                const key = pid as ImageProviderId;
                if (newImageConfig[key]) {
                  newImageConfig[key] = {
                    ...newImageConfig[key],
                    isServerConfigured: false,
                    serverBaseUrl: undefined,
                  };
                }
              }
              for (const [pid, info] of Object.entries(data.image)) {
                const key = pid as ImageProviderId;
                if (newImageConfig[key]) {
                  newImageConfig[key] = {
                    ...newImageConfig[key],
                    isServerConfigured: true,
                    serverBaseUrl: info.baseUrl,
                  };
                }
              }

              // Merge Video providers
              const defaultVideo = getDefaultVideoConfig();
              const newVideoConfig = {
                'qwen-video': {
                  ...defaultVideo.videoProvidersConfig['qwen-video'],
                  ...state.videoProvidersConfig['qwen-video'],
                  baseUrl: '',
                },
              } as SettingsState['videoProvidersConfig'];
              for (const pid of Object.keys(newVideoConfig)) {
                const key = pid as VideoProviderId;
                if (newVideoConfig[key]) {
                  newVideoConfig[key] = {
                    ...newVideoConfig[key],
                    isServerConfigured: false,
                    serverBaseUrl: undefined,
                  };
                }
              }
              if (data.video) {
                for (const [pid, info] of Object.entries(data.video)) {
                  const key = pid as VideoProviderId;
                  if (newVideoConfig[key]) {
                    newVideoConfig[key] = {
                      ...newVideoConfig[key],
                      isServerConfigured: true,
                      serverBaseUrl: info.baseUrl,
                    };
                  }
                }
              }

              // Merge Web Search config — reset all first, then mark server-configured
              const newWebSearchConfig = { ...state.webSearchProvidersConfig };
              for (const key of Object.keys(newWebSearchConfig) as WebSearchProviderId[]) {
                newWebSearchConfig[key] = {
                  ...newWebSearchConfig[key],
                  isServerConfigured: false,
                  serverBaseUrl: undefined,
                };
              }
              if (data.webSearch) {
                for (const [pid, info] of Object.entries(data.webSearch)) {
                  const key = pid as WebSearchProviderId;
                  if (newWebSearchConfig[key]) {
                    newWebSearchConfig[key] = {
                      ...newWebSearchConfig[key],
                      isServerConfigured: true,
                      serverBaseUrl: info.baseUrl,
                    };
                  }
                }
              }

              // === Validate current selections against updated configs ===
              // Build fallback: server-configured first, then client-key-only
              const buildFallback = <T extends string>(
                config: Record<string, { isServerConfigured?: boolean; apiKey?: string }>,
              ): T[] => [
                ...Object.entries(config)
                  .filter(([, c]) => c.isServerConfigured)
                  .map(([id]) => id as T),
                ...Object.entries(config)
                  .filter(([, c]) => !c.isServerConfigured && !!c.apiKey)
                  .map(([id]) => id as T),
              ];

              const llmFallback = buildFallback<ProviderId>(newProvidersConfig);
              const ttsFallback = buildFallback<TTSProviderId>(newTTSConfig);
              const asrFallback = buildFallback<ASRProviderId>(newASRConfig);
              const pdfFallback = buildFallback<PDFProviderId>(newPDFConfig);
              const imageFallback = buildFallback<ImageProviderId>(newImageConfig);
              const videoFallback = buildFallback<VideoProviderId>(newVideoConfig);

              const validLLMProvider = validateProvider(
                state.providerId,
                newProvidersConfig,
                llmFallback,
                DEFAULT_PROVIDER_ID,
              );
              const validTTSProvider = validateProvider(
                state.ttsProviderId,
                newTTSConfig,
                ttsFallback,
                'qwen-tts' as TTSProviderId,
              );
              const validASRProvider = validateProvider(
                state.asrProviderId,
                newASRConfig,
                asrFallback,
                'qwen-asr' as ASRProviderId,
              );
              const validPDFProvider = validateProvider(
                state.pdfProviderId,
                newPDFConfig,
                pdfFallback,
                'unpdf' as PDFProviderId,
              );
              let validImageProvider = validateProvider(
                state.imageProviderId,
                newImageConfig,
                imageFallback,
                'qwen-image' as ImageProviderId,
              );
              let validVideoProvider = validateProvider(
                state.videoProviderId,
                newVideoConfig,
                videoFallback,
                'qwen-video' as VideoProviderId,
              );

              // Auto-recover: when provider is empty but server has available ones
              let recoveredImageModel = '';
              if (!validImageProvider && imageFallback.length > 0) {
                validImageProvider = imageFallback[0];
                const models = IMAGE_PROVIDERS[validImageProvider as ImageProviderId]?.models;
                if (models?.length) recoveredImageModel = models[0].id;
              }
              let recoveredVideoModel = '';
              if (!validVideoProvider && videoFallback.length > 0) {
                validVideoProvider = videoFallback[0];
                const models = VIDEO_PROVIDERS[validVideoProvider as VideoProviderId]?.models;
                if (models?.length) recoveredVideoModel = models[0].id;
              }

              const validLLMModel = validLLMProvider
                ? validateModel(
                    state.modelId,
                    newProvidersConfig[validLLMProvider as ProviderId]?.models ?? [],
                  )
                : '';
              const imageModels =
                IMAGE_PROVIDERS[validImageProvider as ImageProviderId]?.models ?? [];
              const validImageModel = validImageProvider
                ? recoveredImageModel ||
                  validateModel(state.imageModelId, imageModels) ||
                  // validateModel('', ...) returns '' — fallback to first model when modelId is empty
                  imageModels[0]?.id ||
                  ''
                : '';
              const videoModels =
                VIDEO_PROVIDERS[validVideoProvider as VideoProviderId]?.models ?? [];
              const validVideoModel = validVideoProvider
                ? recoveredVideoModel ||
                  validateModel(state.videoModelId, videoModels) ||
                  videoModels[0]?.id ||
                  ''
                : '';

              const validTTSVoice =
                validTTSProvider !== state.ttsProviderId
                  ? DEFAULT_TTS_VOICES[validTTSProvider as BuiltInTTSProviderId] || 'default'
                  : state.ttsVoice;

              // Auto-disable image/video generation when no provider is usable
              const shouldDisableImage = !validImageProvider && state.imageGenerationEnabled;
              const shouldDisableVideo = !validVideoProvider && state.videoGenerationEnabled;

              // === Auto-select / auto-enable (only on first run) ===
              let autoTtsProvider: TTSProviderId | undefined;
              let autoTtsVoice: string | undefined;
              let autoAsrProvider: ASRProviderId | undefined;
              let autoPdfProvider: PDFProviderId | undefined;
              let autoImageProvider: ImageProviderId | undefined;
              let autoImageModel: string | undefined;
              let autoVideoProvider: VideoProviderId | undefined;
              let autoVideoModel: string | undefined;
              let autoImageEnabled: boolean | undefined;
              let autoVideoEnabled: boolean | undefined;

              if (!state.autoConfigApplied) {
                // PDF: unpdf → mineru-cloud if server has it
                if (state.pdfProviderId === 'unpdf') {
                  if (newPDFConfig['mineru-cloud']?.isServerConfigured) {
                    autoPdfProvider = 'mineru-cloud' as PDFProviderId;
                  }
                }

                // TTS: select first server provider if current is not server-configured
                const serverTtsIds = (Object.keys(data.tts) as TTSProviderId[]).filter(
                  (id) => !!newTTSConfig[id],
                );
                if (
                  serverTtsIds.length > 0 &&
                  !newTTSConfig[state.ttsProviderId]?.isServerConfigured
                ) {
                  autoTtsProvider = serverTtsIds[0];
                  autoTtsVoice =
                    DEFAULT_TTS_VOICES[autoTtsProvider as BuiltInTTSProviderId] || 'default';
                }

                // ASR: select first server provider if current is not server-configured
                const serverAsrIds = (Object.keys(data.asr) as ASRProviderId[]).filter(
                  (id) => !!newASRConfig[id],
                );
                if (
                  serverAsrIds.length > 0 &&
                  !newASRConfig[state.asrProviderId]?.isServerConfigured
                ) {
                  autoAsrProvider = serverAsrIds[0];
                }

                // Image: first server provider
                const serverImageIds = (Object.keys(data.image) as ImageProviderId[]).filter(
                  (id) => !!newImageConfig[id],
                );
                if (
                  serverImageIds.length > 0 &&
                  !newImageConfig[state.imageProviderId]?.isServerConfigured
                ) {
                  autoImageProvider = serverImageIds[0];
                  const models = IMAGE_PROVIDERS[autoImageProvider]?.models;
                  if (models?.length) autoImageModel = models[0].id;
                }
                if (serverImageIds.length > 0 && !state.imageGenerationEnabled) {
                  autoImageEnabled = true;
                }

                // Video: first server provider
                const serverVideoIds = (Object.keys(data.video || {}) as VideoProviderId[]).filter(
                  (id) => !!newVideoConfig[id],
                );
                if (
                  serverVideoIds.length > 0 &&
                  !newVideoConfig[state.videoProviderId]?.isServerConfigured
                ) {
                  autoVideoProvider = serverVideoIds[0];
                  const models = VIDEO_PROVIDERS[autoVideoProvider]?.models;
                  if (models?.length) autoVideoModel = models[0].id;
                }
                if (serverVideoIds.length > 0 && !state.videoGenerationEnabled) {
                  autoVideoEnabled = true;
                }
              }

              // LLM auto-select: only on true first load (no provider selected yet)
              let autoProviderId: ProviderId | undefined;
              let autoModelId: string | undefined;
              if (!state.providerId && !state.modelId) {
                for (const [pid, cfg] of Object.entries(newProvidersConfig)) {
                  if (cfg.isServerConfigured) {
                    const modelId = PROVIDERS[pid as ProviderId]?.models[0]?.id;
                    if (modelId) {
                      autoProviderId = pid as ProviderId;
                      autoModelId = modelId;
                      break;
                    }
                  }
                }
              }

              return {
                providersConfig: newProvidersConfig,
                ttsProvidersConfig: newTTSConfig,
                asrProvidersConfig: newASRConfig,
                pdfProvidersConfig: newPDFConfig,
                imageProvidersConfig: newImageConfig,
                videoProvidersConfig: newVideoConfig,
                webSearchProvidersConfig: newWebSearchConfig,
                autoConfigApplied: true,
                // Validated selections
                ...(validLLMProvider !== state.providerId && {
                  providerId: validLLMProvider as ProviderId,
                }),
                ...(validLLMModel !== state.modelId && { modelId: validLLMModel }),
                ...(validTTSProvider !== state.ttsProviderId && {
                  ttsProviderId: validTTSProvider as TTSProviderId,
                  ttsVoice: validTTSVoice,
                }),
                ...(validASRProvider !== state.asrProviderId && {
                  asrProviderId: validASRProvider as ASRProviderId,
                }),
                ...(validPDFProvider !== state.pdfProviderId && {
                  pdfProviderId: validPDFProvider as PDFProviderId,
                }),
                ...(validImageProvider !== state.imageProviderId && {
                  imageProviderId: validImageProvider as ImageProviderId,
                }),
                ...(validImageModel !== state.imageModelId && {
                  imageModelId: validImageModel,
                }),
                ...(validVideoProvider !== state.videoProviderId && {
                  videoProviderId: validVideoProvider as VideoProviderId,
                }),
                ...(validVideoModel !== state.videoModelId && {
                  videoModelId: validVideoModel,
                }),
                ...(shouldDisableImage && { imageGenerationEnabled: false }),
                ...(shouldDisableVideo && { videoGenerationEnabled: false }),
                // First-run auto-select overrides validation (autoConfigApplied guard).
                // On first sync, auto-select picks the best provider. On subsequent syncs,
                // auto* variables stay undefined so only validation spreads take effect.
                ...(autoPdfProvider && { pdfProviderId: autoPdfProvider }),
                ...(autoTtsProvider && {
                  ttsProviderId: autoTtsProvider,
                  ttsVoice: autoTtsVoice,
                }),
                ...(autoAsrProvider && { asrProviderId: autoAsrProvider }),
                ...(autoImageProvider && {
                  imageProviderId: autoImageProvider,
                }),
                ...(autoImageModel && { imageModelId: autoImageModel }),
                ...(autoVideoProvider && {
                  videoProviderId: autoVideoProvider,
                }),
                ...(autoVideoModel && { videoModelId: autoVideoModel }),
                ...(autoImageEnabled !== undefined && {
                  imageGenerationEnabled: autoImageEnabled,
                }),
                ...(autoVideoEnabled !== undefined && {
                  videoGenerationEnabled: autoVideoEnabled,
                }),
                ...(autoProviderId && { providerId: autoProviderId }),
                ...(autoModelId && { modelId: autoModelId }),
              };
            });
          } catch (e) {
            // Silently fail — server providers are optional
            log.warn('Failed to fetch server providers:', e);
          }
        },
      };
    },
    {
      name: 'settings-storage',
      version: 2,
      storage: createJSONStorage(() => accountSettingsStorage),
      skipHydration: true,
      // Migrate persisted state
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Partial<SettingsState>;

        // Ensure providersConfig has all built-in providers (also in merge below)
        if (!state.providersConfig) {
          state.providersConfig = getDefaultProvidersConfig();
        }
        ensureBuiltInProviders(state);

        // Ensure image/video configs have all built-in providers
        ensureBuiltInImageProviders(state);
        ensureBuiltInVideoProviders(state);
        ensureBuiltInWebSearchProviders(state);

        // Add default audio config if missing
        if (!state.ttsProvidersConfig || !state.asrProvidersConfig) {
          const defaultAudioConfig = getDefaultAudioConfig();
          Object.assign(state, defaultAudioConfig);
        }
        ensureBuiltInAudioProviders(state);
        state.ttsProviderId = 'qwen-tts';
        state.ttsVoice = DEFAULT_TTS_VOICES['qwen-tts'];
        state.asrProviderId = 'qwen-asr';
        state.asrLanguage = 'zh';
        delete (state as Record<string, unknown>).ttsModel;
        delete (state as Record<string, unknown>).ttsModelId;
        delete (state as Record<string, unknown>).asrModelId;

        // Add default PDF config if missing
        if (!state.pdfProvidersConfig) {
          const defaultPDFConfig = getDefaultPDFConfig();
          Object.assign(state, defaultPDFConfig);
        }
        stripPDFBaseUrlFields(state);

        // Add default Image config if missing
        if (!state.imageProvidersConfig) {
          const defaultImageConfig = getDefaultImageConfig();
          Object.assign(state, defaultImageConfig);
        }
        ensureBuiltInImageProviders(state);
        state.imageProviderId = 'qwen-image';
        state.imageModelId = 'qwen-image-2.0-pro';

        // Add default Video config if missing
        if (!state.videoProvidersConfig) {
          const defaultVideoConfig = getDefaultVideoConfig();
          Object.assign(state, defaultVideoConfig);
        }
        ensureBuiltInVideoProviders(state);
        state.videoProviderId = 'qwen-video';
        state.videoModelId = 'happyhorse-1.0-t2v';

        // v1 → v2: Replace deep research with web search
        if (version < 2) {
          delete (state as Record<string, unknown>).deepResearchProviderId;
          delete (state as Record<string, unknown>).deepResearchProvidersConfig;
        }

        // Add default media generation toggles if missing
        if (state.imageGenerationEnabled === undefined) {
          state.imageGenerationEnabled = false;
        }
        if (state.videoGenerationEnabled === undefined) {
          state.videoGenerationEnabled = false;
        }

        // Add default audio toggles if missing
        if ((state as Record<string, unknown>).ttsEnabled === undefined) {
          (state as Record<string, unknown>).ttsEnabled = true;
        }
        if ((state as Record<string, unknown>).asrEnabled === undefined) {
          (state as Record<string, unknown>).asrEnabled = true;
        }

        // Existing users already have their config set up — mark auto-config as done
        if ((state as Record<string, unknown>).autoConfigApplied === undefined) {
          (state as Record<string, unknown>).autoConfigApplied = true;
        }

        if ((state as Record<string, unknown>).agentMode === undefined) {
          (state as Record<string, unknown>).agentMode = 'preset';
        }
        if ((state as Record<string, unknown>).autoAgentCount === undefined) {
          (state as Record<string, unknown>).autoAgentCount = 3;
        }

        if ((state as Record<string, unknown>).thinkingConfigs === undefined) {
          (state as Record<string, unknown>).thinkingConfigs = {};
        }

        // Migrate Web Search: old flat fields → new provider-based config
        if (!state.webSearchProvidersConfig) {
          const stateRecord = state as Record<string, unknown>;
          state.webSearchProviderId = 'bailian' as WebSearchProviderId;
          state.webSearchProvidersConfig = getDefaultWebSearchConfig()
            .webSearchProvidersConfig as SettingsState['webSearchProvidersConfig'];
          delete stateRecord.webSearchApiKey;
          delete stateRecord.webSearchIsServerConfigured;
        }
        ensureBuiltInWebSearchProviders(state);

        ensureValidProviderSelections(state);
        ensureBuiltInAudioProviders(state);
        state.thinkingConfigs = pruneThinkingConfigs(state.thinkingConfigs, state.providersConfig);

        return state;
      },
      // Custom merge: always sync built-in providers on every rehydrate,
      // so newly added providers/models appear without clearing cache.
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...(persistedState as object) };
        ensureBuiltInProviders(merged as Partial<SettingsState>);
        ensureBuiltInAudioProviders(merged as Partial<SettingsState>);
        ensureBuiltInImageProviders(merged as Partial<SettingsState>);
        ensureBuiltInVideoProviders(merged as Partial<SettingsState>);
        ensureBuiltInWebSearchProviders(merged as Partial<SettingsState>);
        stripPDFBaseUrlFields(merged as Partial<SettingsState>);
        ensureValidProviderSelections(merged as Partial<SettingsState>);
        const typedMerged = merged as Partial<SettingsState>;
        typedMerged.thinkingConfigs = pruneThinkingConfigs(
          typedMerged.thinkingConfigs,
          typedMerged.providersConfig,
        );
        return merged as SettingsState;
      },
    },
  ),
);
