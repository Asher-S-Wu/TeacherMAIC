import { beforeEach, describe, expect, it, vi } from 'vitest';

const openAiMock = vi.hoisted(() => ({
  chat: vi.fn((modelId: string) => ({ endpoint: 'chat', modelId })),
  createOpenAI: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: openAiMock.createOpenAI,
}));

import {
  DEFAULT_MODEL_ID,
  DEFAULT_MODEL_STRING,
  getModel,
  getModelInfo,
  getProvider,
  parseModelString,
} from '@/lib/ai/providers';

async function captureInjectedRequestBody(thinkingConfig: Record<string, unknown>) {
  const originalFetch = globalThis.fetch;
  const globalRecord = globalThis as Record<string, unknown>;
  const originalThinkingContext = globalRecord.__thinkingContext;
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  try {
    globalThis.fetch = fetchMock as typeof fetch;
    globalRecord.__thinkingContext = {
      getStore: () => thinkingConfig,
    };

    getModel({
      providerId: 'kimi',
      modelId: DEFAULT_MODEL_ID,
      apiKey: 'sk-test',
    });

    const lastCall = openAiMock.createOpenAI.mock.calls.at(-1);
    const options = lastCall?.[0] as { fetch?: typeof fetch; baseURL?: string } | undefined;

    await options?.fetch?.('https://zenmux.ai/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: DEFAULT_MODEL_ID,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    return {
      body: JSON.parse(init.body as string),
      baseURL: options?.baseURL,
    };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalThinkingContext === undefined) {
      delete globalRecord.__thinkingContext;
    } else {
      globalRecord.__thinkingContext = originalThinkingContext;
    }
  }
}

describe('Kimi provider defaults', () => {
  beforeEach(() => {
    openAiMock.chat.mockClear();
    openAiMock.createOpenAI.mockReset();
    openAiMock.createOpenAI.mockReturnValue({
      chat: openAiMock.chat,
    });
  });

  it('only exposes ZenMux Kimi K2.6 as the built-in text model', () => {
    expect(getProvider('kimi')).toMatchObject({
      id: 'kimi',
      name: 'Kimi',
      type: 'openai',
      defaultBaseUrl: 'https://zenmux.ai/api/v1',
    });
    expect(getProvider('openai')).toBeUndefined();
    expect(getModelInfo('kimi', DEFAULT_MODEL_ID)).toMatchObject({
      id: DEFAULT_MODEL_ID,
      name: 'Kimi K2.6',
      contextWindow: 256000,
      capabilities: {
        streaming: true,
        tools: true,
        vision: true,
      },
    });
  });

  it('uses the OpenAI-compatible chat adapter against ZenMux', () => {
    const { model } = getModel({
      providerId: 'kimi',
      modelId: DEFAULT_MODEL_ID,
      apiKey: 'sk-test',
    });

    expect(openAiMock.createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-test',
        baseURL: 'https://zenmux.ai/api/v1',
      }),
    );
    expect(openAiMock.chat).toHaveBeenCalledWith(DEFAULT_MODEL_ID);
    expect(model).toEqual({ endpoint: 'chat', modelId: DEFAULT_MODEL_ID });
  });

  it('parses bare model IDs as Kimi and rejects removed providers', () => {
    expect(parseModelString(DEFAULT_MODEL_ID)).toEqual({
      providerId: 'kimi',
      modelId: DEFAULT_MODEL_ID,
    });
    expect(parseModelString(DEFAULT_MODEL_STRING)).toEqual({
      providerId: 'kimi',
      modelId: DEFAULT_MODEL_ID,
    });
    expect(() => parseModelString('openai:gpt-5.4-mini')).toThrow(/Unsupported/);
  });

  it('injects Kimi thinking params into the OpenAI-compatible request body', async () => {
    const disabled = await captureInjectedRequestBody({ mode: 'disabled' });
    const enabled = await captureInjectedRequestBody({ mode: 'enabled' });

    expect(disabled.baseURL).toBe('https://zenmux.ai/api/v1');
    expect(disabled.body).toMatchObject({ thinking: { type: 'disabled' } });
    expect(enabled.body).toMatchObject({ thinking: { type: 'enabled' } });
  });
});
