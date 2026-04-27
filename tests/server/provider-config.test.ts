import { describe, expect, it, vi, beforeEach } from 'vitest';

const ENV_PREFIXES_TO_CLEAR = [
  'ZENMUX',
  'OPENAI',
  'ANTHROPIC',
  'GOOGLE',
  'DEEPSEEK',
  'QWEN',
  'KIMI',
  'MINIMAX',
  'GLM',
  'SILICONFLOW',
  'DOUBAO',
  'OPENROUTER',
  'GROK',
  'TENCENT',
  'TENCENT_HUNYUAN',
  'XIAOMI',
  'MIMO',
  'HY3',
  'TTS_OPENAI',
  'TTS_AZURE',
  'TTS_GLM',
  'TTS_QWEN',
  'TTS_DOUBAO',
  'TTS_ELEVENLABS',
  'TTS_MINIMAX',
  'ASR_OPENAI',
  'ASR_QWEN',
  'PDF_MINERU_CLOUD',
  'IMAGE_OPENAI',
  'IMAGE_SEEDREAM',
  'IMAGE_QWEN_IMAGE',
  'IMAGE_NANO_BANANA',
  'IMAGE_MINIMAX',
  'IMAGE_GROK',
  'VIDEO_SEEDANCE',
  'VIDEO_KLING',
  'VIDEO_VEO',
  'VIDEO_SORA',
  'VIDEO_MINIMAX',
  'VIDEO_GROK',
  'TAVILY',
];

function clearProviderEnv() {
  for (const prefix of ENV_PREFIXES_TO_CLEAR) {
    delete process.env[`${prefix}_API_KEY`];
    delete process.env[`${prefix}_BASE_URL`];
    delete process.env[`${prefix}_MODELS`];
  }
}

describe('provider-config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    clearProviderEnv();
  });

  describe('LLM provider config', () => {
    it('maps ZENMUX_API_KEY to the kimi provider', async () => {
      vi.stubEnv('ZENMUX_API_KEY', 'sk-zenmux');
      const { getServerProviders, resolveApiKey } = await import('@/lib/server/provider-config');

      expect(getServerProviders()).toEqual({ kimi: {} });
      expect(resolveApiKey('kimi')).toBe('sk-zenmux');
    });

    it('does not read legacy text model env vars', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-openai');
      vi.stubEnv('KIMI_API_KEY', 'sk-kimi');
      const { getServerProviders, resolveApiKey } = await import('@/lib/server/provider-config');

      expect(getServerProviders()).toEqual({});
      expect(resolveApiKey('openai')).toBe('');
      expect(resolveApiKey('kimi')).toBe('');
    });

    it('does not expose or resolve LLM base URL and model overrides from env', async () => {
      vi.stubEnv('ZENMUX_API_KEY', 'sk-zenmux');
      vi.stubEnv('ZENMUX_BASE_URL', 'https://proxy.example.com/v1');
      vi.stubEnv('ZENMUX_MODELS', 'other/model');
      const { getServerProviders, resolveBaseUrl } = await import('@/lib/server/provider-config');

      expect(getServerProviders()).toEqual({ kimi: {} });
      expect(resolveBaseUrl('kimi')).toBeUndefined();
      expect(resolveBaseUrl('kimi', 'https://client.example.com/v1')).toBeUndefined();
    });

    it('prefers a client ZenMux key over the server key', async () => {
      vi.stubEnv('ZENMUX_API_KEY', 'sk-server');
      const { resolveApiKey } = await import('@/lib/server/provider-config');

      expect(resolveApiKey('kimi', 'sk-client')).toBe('sk-client');
    });
  });

  describe('resolveWebSearchApiKey', () => {
    it('returns client key first', async () => {
      const { resolveWebSearchApiKey } = await import('@/lib/server/provider-config');
      expect(resolveWebSearchApiKey('client-key')).toBe('client-key');
    });

    it('returns Tavily key from Vercel env', async () => {
      vi.stubEnv('TAVILY_API_KEY', 'tvly-bare-env');
      const { resolveWebSearchApiKey } = await import('@/lib/server/provider-config');
      expect(resolveWebSearchApiKey()).toBe('tvly-bare-env');
    });
  });

  describe('MinerU Cloud PDF provider', () => {
    it('includes MinerU Cloud from env when API key is configured', async () => {
      vi.stubEnv('PDF_MINERU_CLOUD_API_KEY', 'sk-mineru-cloud');
      vi.stubEnv('PDF_MINERU_CLOUD_BASE_URL', 'https://mineru.net/api/v4');
      const { getServerPDFProviders } = await import('@/lib/server/provider-config');

      expect(getServerPDFProviders()['mineru-cloud']).toEqual({
        baseUrl: 'https://mineru.net/api/v4',
      });
    });

    it('excludes MinerU Cloud when only BASE_URL is set', async () => {
      vi.stubEnv('PDF_MINERU_CLOUD_BASE_URL', 'https://mineru.net/api/v4');
      const { getServerPDFProviders } = await import('@/lib/server/provider-config');

      expect(getServerPDFProviders()['mineru-cloud']).toBeUndefined();
    });
  });

  describe('image and video provider metadata', () => {
    it('maps IMAGE_OPENAI and exposes image baseUrl', async () => {
      vi.stubEnv('IMAGE_OPENAI_API_KEY', 'sk-openai-image');
      vi.stubEnv('IMAGE_OPENAI_BASE_URL', 'https://proxy.example.com/v1');
      const { getServerImageProviders, resolveImageBaseUrl } =
        await import('@/lib/server/provider-config');

      expect(getServerImageProviders()['openai-image']).toEqual({
        baseUrl: 'https://proxy.example.com/v1',
      });
      expect(resolveImageBaseUrl('openai-image')).toBe('https://proxy.example.com/v1');
    });

    it('exposes video provider baseUrl', async () => {
      vi.stubEnv('VIDEO_GROK_API_KEY', 'xai-secret');
      vi.stubEnv('VIDEO_GROK_BASE_URL', 'https://proxy.example.com/video');
      const { getServerVideoProviders, resolveVideoBaseUrl } =
        await import('@/lib/server/provider-config');

      expect(getServerVideoProviders()['grok-video']).toEqual({
        baseUrl: 'https://proxy.example.com/video',
      });
      expect(resolveVideoBaseUrl('grok-video')).toBe('https://proxy.example.com/video');
    });
  });
});
