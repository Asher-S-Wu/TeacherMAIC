// 默认页面生成并发数：最多五路并行
export const CLASSROOM_GENERATION_CONCURRENCY = 5;

/** 页面生成进度文案（面向用户，不含并发等技术细节） */
export function formatSceneGenerationProgressMessage(
  completed: number,
  total: number,
): string {
  if (total <= 0) return '正在创建学习内容...';
  if (completed <= 0) return `正在创建学习内容，共 ${total} 个页面`;
  return `正在创建学习内容，已完成 ${completed}/${total}`;
}
