import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('resolveEvalModel', () => {
  const ORIG_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIG_ENV };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = ORIG_ENV;
    vi.restoreAllMocks();
  });

  it('throws a helpful error when env var is unset and no fallback is given', async () => {
    delete process.env.EVAL_FOO_MODEL;
    vi.doMock('@/lib/server/resolve-model', () => ({
      resolveModel: vi.fn(),
    }));
    const { resolveEvalModel } = await import('@/eval/shared/resolve-model');
    await expect(resolveEvalModel('EVAL_FOO_MODEL')).rejects.toThrow(/EVAL_FOO_MODEL/);
  });

  it('uses the env var when set', async () => {
    process.env.EVAL_FOO_MODEL = 'kimi:moonshotai/kimi-k2.6';
    const resolveModel = vi.fn().mockResolvedValue({ model: 'resolved', modelInfo: {} });
    vi.doMock('@/lib/server/resolve-model', () => ({ resolveModel }));
    const { resolveEvalModel } = await import('@/eval/shared/resolve-model');
    await resolveEvalModel('EVAL_FOO_MODEL');
    expect(resolveModel).toHaveBeenCalledWith({ modelString: 'kimi:moonshotai/kimi-k2.6' });
  });

  it('uses the explicit fallback when env var is unset', async () => {
    delete process.env.EVAL_FOO_MODEL;
    const resolveModel = vi.fn().mockResolvedValue({ model: 'resolved', modelInfo: {} });
    vi.doMock('@/lib/server/resolve-model', () => ({ resolveModel }));
    const { resolveEvalModel } = await import('@/eval/shared/resolve-model');
    await resolveEvalModel('EVAL_FOO_MODEL', 'kimi:moonshotai/kimi-k2.6');
    expect(resolveModel).toHaveBeenCalledWith({ modelString: 'kimi:moonshotai/kimi-k2.6' });
  });

  it('env var takes precedence over fallback', async () => {
    process.env.EVAL_FOO_MODEL = 'kimi:moonshotai/kimi-k2.6';
    const resolveModel = vi.fn().mockResolvedValue({ model: 'resolved', modelInfo: {} });
    vi.doMock('@/lib/server/resolve-model', () => ({ resolveModel }));
    const { resolveEvalModel } = await import('@/eval/shared/resolve-model');
    await resolveEvalModel('EVAL_FOO_MODEL', 'kimi:moonshotai/kimi-k2.6');
    expect(resolveModel).toHaveBeenCalledWith({ modelString: 'kimi:moonshotai/kimi-k2.6' });
  });
});
