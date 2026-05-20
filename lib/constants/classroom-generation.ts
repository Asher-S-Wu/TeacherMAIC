// 默认页面生成并发数：最多五路并行
export const CLASSROOM_GENERATION_CONCURRENCY = 5;

/**
 * 根据并发数生成文案中的"最多 N 路并行"片段。
 */
export function formatConcurrencyLabel(concurrency: number): string {
  const cnNumbers = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];
  const cn = concurrency >= 0 && concurrency <= 10 ? cnNumbers[concurrency] : String(concurrency);
  return `最多${cn}路`;
}
