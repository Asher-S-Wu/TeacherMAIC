import { describe, expect, it } from 'vitest';

import { DEFAULT_MODEL_ID, getProvider } from '@/lib/ai/providers';
import {
  getDefaultThinkingConfig,
  normalizeThinkingConfig,
  supportsConfigurableThinking,
} from '@/lib/ai/thinking-config';

function getKimiThinking() {
  return getProvider('kimi')?.models.find((item) => item.id === DEFAULT_MODEL_ID)?.capabilities
    ?.thinking;
}

describe('thinking config metadata', () => {
  it('marks Kimi K2.6 as a configurable thinking model', () => {
    const thinking = getKimiThinking();

    expect(supportsConfigurableThinking(thinking)).toBe(true);
    expect(thinking?.control).toBe('toggle');
    expect(thinking?.requestAdapter).toBe('kimi');
  });

  it('normalizes Kimi thinking as an on/off toggle', () => {
    const thinking = getKimiThinking();

    expect(getDefaultThinkingConfig(thinking)).toEqual({
      mode: 'enabled',
    });
    expect(normalizeThinkingConfig(thinking, { mode: 'disabled' })).toEqual({
      mode: 'disabled',
    });
    expect(normalizeThinkingConfig(thinking, { mode: 'enabled' })).toEqual({
      mode: 'enabled',
    });
  });
});
