import { CLAUDE_OPUS_4_7_MODEL_ID } from '@/lib/ai/anthropic-models';

// 默认页面生成并发数：最多五路并行
export const CLASSROOM_GENERATION_CONCURRENCY = 5;

// 极致模型（Anthropic Claude Opus 4.7）专用并发数：最多两路并行
export const ULTIMATE_GENERATION_CONCURRENCY = 2;

// 极致模型对应的 provider 标识
const ULTIMATE_PROVIDER_ID = 'anthropic';

/**
 * 根据当前选用的 provider 和模型，决定页面生成的并发数。
 * 极致模型由于成本与速率限制更严格，统一收敛到 ULTIMATE_GENERATION_CONCURRENCY；
 * 其他模型沿用默认的 CLASSROOM_GENERATION_CONCURRENCY。
 */
export function resolveClassroomGenerationConcurrency(
  providerId: string | undefined,
  modelId: string | undefined,
): number {
  if (providerId === ULTIMATE_PROVIDER_ID && modelId === CLAUDE_OPUS_4_7_MODEL_ID) {
    return ULTIMATE_GENERATION_CONCURRENCY;
  }
  return CLASSROOM_GENERATION_CONCURRENCY;
}

/**
 * 根据并发数生成文案中的"最多 N 路并行"片段。
 */
export function formatConcurrencyLabel(concurrency: number): string {
  const cnNumbers = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];
  const cn = concurrency >= 0 && concurrency <= 10 ? cnNumbers[concurrency] : String(concurrency);
  return `最多${cn}路`;
}
