/**
 * Tests for fetchServerProviders() after text models were reduced to Kimi only.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { isProviderUsable } from '@/lib/store/settings-validation';

vi.mock('@/lib/ai/providers', () => ({
  DEFAULT_PROVIDER_ID: 'kimi',
  DEFAULT_MODEL_ID: 'moonshotai/kimi-k2.6',
  PROVIDERS: {
    kimi: {
      id: 'kimi',
      name: 'Kimi',
      type: 'openai',
      defaultBaseUrl: 'https://zenmux.ai/api/v1',
      requiresApiKey: true,
      icon: '/logos/kimi.png',
      models: [
        {
          id: 'moonshotai/kimi-k2.6',
          name: 'Kimi K2.6',
          contextWindow: 256000,
          capabilities: { streaming: true, tools: true, vision: true },
        },
      ],
    },
  },
}));

vi.mock('@/lib/audio/constants', () => ({
  TTS_PROVIDERS: {
    'browser-native-tts': {
      id: 'browser-native-tts',
      name: 'Browser Native TTS',
      requiresApiKey: false,
      defaultModelId: '',
      models: [],
      voices: [{ id: 'default', name: 'Default', language: 'en', gender: 'neutral' }],
      supportedFormats: ['browser'],
      speedRange: { min: 0.1, max: 10, default: 1 },
    },
    'openai-tts': {
      id: 'openai-tts',
      name: 'OpenAI TTS',
      requiresApiKey: true,
      defaultModelId: 'gpt-4o-mini-tts',
      models: [{ id: 'gpt-4o-mini-tts', name: 'GPT-4o Mini TTS' }],
      voices: [{ id: 'alloy', name: 'Alloy', language: 'en', gender: 'neutral' }],
      supportedFormats: ['mp3'],
    },
  },
  ASR_PROVIDERS: {
    'browser-native': {
      id: 'browser-native',
      name: 'Browser Native ASR',
      requiresApiKey: false,
      defaultModelId: '',
      models: [],
      supportedLanguages: ['zh'],
      supportedFormats: ['browser'],
    },
    'openai-whisper': {
      id: 'openai-whisper',
      name: 'OpenAI Whisper',
      requiresApiKey: true,
      defaultModelId: 'gpt-4o-mini-transcribe',
      models: [{ id: 'gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe' }],
      supportedLanguages: ['auto', 'zh'],
      supportedFormats: ['webm'],
    },
  },
  DEFAULT_TTS_VOICES: {
    'openai-tts': 'alloy',
    'browser-native-tts': 'default',
  },
}));

vi.mock('@/lib/audio/types', () => ({
  isCustomTTSProvider: (id: string) => id.startsWith('custom-tts-'),
  isCustomASRProvider: (id: string) => id.startsWith('custom-asr-'),
}));

vi.mock('@/lib/pdf/constants', () => ({
  PDF_PROVIDERS: {
    unpdf: { id: 'unpdf', requiresApiKey: false },
    'mineru-cloud': { id: 'mineru-cloud', requiresApiKey: true },
  },
}));

vi.mock('@/lib/media/image-providers', () => ({
  IMAGE_PROVIDERS: {
    seedream: {
      id: 'seedream',
      requiresApiKey: true,
      models: [{ id: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0' }],
    },
  },
}));

vi.mock('@/lib/media/video-providers', () => ({
  VIDEO_PROVIDERS: {
    seedance: {
      id: 'seedance',
      requiresApiKey: true,
      models: [{ id: 'doubao-seedance-1-5-pro-251215', name: 'Seedance 1.5 Pro' }],
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

const storage = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};
vi.stubGlobal('localStorage', localStorageStub);
vi.stubGlobal('window', { localStorage: localStorageStub });

interface MockServerResponse {
  providers?: Record<string, object>;
  tts?: Record<string, { baseUrl?: string }>;
  asr?: Record<string, { baseUrl?: string }>;
  pdf?: Record<string, { baseUrl?: string }>;
  image?: Record<string, { baseUrl?: string }>;
  video?: Record<string, { baseUrl?: string }>;
  webSearch?: Record<string, { baseUrl?: string }>;
}

function mockServerResponse(overrides: MockServerResponse = {}) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      providers: {},
      tts: {},
      asr: {},
      pdf: {},
      image: {},
      video: {},
      webSearch: {},
      ...overrides,
    }),
  });
}

describe('settings server sync — Kimi text provider', () => {
  beforeEach(() => {
    vi.resetModules();
    storage.clear();
    mockFetch.mockReset();
  });

  async function getStore() {
    const { useSettingsStore } = await import('@/lib/store/settings');
    return useSettingsStore;
  }

  it('starts with Kimi K2.6 as the only text model', async () => {
    const store = await getStore();
    const state = store.getState();

    expect(state.providerId).toBe('kimi');
    expect(state.modelId).toBe('moonshotai/kimi-k2.6');
    expect(Object.keys(state.providersConfig)).toEqual(['kimi']);
    expect(state.providersConfig.kimi.models.map((model) => model.id)).toEqual([
      'moonshotai/kimi-k2.6',
    ]);
  });

  it('marks kimi as server-configured when /api/server-providers returns it', async () => {
    const store = await getStore();
    mockServerResponse({ providers: { kimi: {} } });

    await store.getState().fetchServerProviders();

    expect(store.getState().providersConfig.kimi.isServerConfigured).toBe(true);
    expect(store.getState().providersConfig.kimi.models.map((model) => model.id)).toEqual([
      'moonshotai/kimi-k2.6',
    ]);
  });

  it('ignores removed text providers from the server response', async () => {
    const store = await getStore();
    mockServerResponse({ providers: { openai: {}, anthropic: {} } });

    await store.getState().fetchServerProviders();

    expect(Object.keys(store.getState().providersConfig)).toEqual(['kimi']);
    expect(store.getState().providersConfig.kimi.isServerConfigured).toBe(false);
  });

  it('requires either a local ZenMux key or server ZenMux key', async () => {
    const store = await getStore();
    mockServerResponse({});

    await store.getState().fetchServerProviders();

    const config = store.getState().providersConfig.kimi;
    expect(config.apiKey).toBe('');
    expect(config.isServerConfigured).toBe(false);
    expect(isProviderUsable(config)).toBe(false);
  });
});
