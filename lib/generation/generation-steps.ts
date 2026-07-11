import { Search, Bot, FileText, LayoutPanelLeft, Clapperboard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type GenerationStep = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  type: 'analysis' | 'writing' | 'visual';
};

export const ALL_GENERATION_STEPS: GenerationStep[] = [
  {
    id: 'web-search',
    title: '网络搜索',
    description: '正在判断是否需要联网获取资料',
    icon: Search,
    type: 'analysis',
  },
  {
    id: 'outline',
    title: '生成课程大纲',
    description: '正在构建学习路径...',
    icon: FileText,
    type: 'writing',
  },
  {
    id: 'agent-generation',
    title: '生成课堂角色',
    description: '正在根据课程内容生成角色...',
    icon: Bot,
    type: 'writing',
  },
  {
    id: 'slide-content',
    title: '生成页面内容',
    description: '正在创建幻灯片、测验和互动内容...',
    icon: LayoutPanelLeft,
    type: 'visual',
  },
  {
    id: 'actions',
    title: '生成教学动作',
    description: '正在编排讲解、聚焦和互动流程...',
    icon: Clapperboard,
    type: 'visual',
  },
];

export interface JobDisplayContext {
  webSearch: boolean;
  agentMode: 'preset' | 'auto';
}

export function getActiveStepsForJob(ctx: JobDisplayContext): GenerationStep[] {
  return ALL_GENERATION_STEPS.filter((step) => {
    if (step.id === 'web-search') return ctx.webSearch;
    if (step.id === 'agent-generation') return ctx.agentMode === 'auto';
    return true;
  });
}

export function resolveJobProgressStep(
  job: {
    step: string;
    progress: number;
    status: string;
    scenesGenerated: number;
    totalScenes?: number;
  },
  activeSteps: GenerationStep[],
): { stepIndex: number; stepId: string } {
  const findIndex = (id: string) => {
    const idx = activeSteps.findIndex((s) => s.id === id);
    return idx >= 0 ? idx : 0;
  };

  if (job.status === 'succeeded') {
    const last = activeSteps[activeSteps.length - 1];
    return { stepIndex: activeSteps.length - 1, stepId: last?.id ?? 'outline' };
  }

  const { step, progress, scenesGenerated, totalScenes } = job;
  let stepId = activeSteps[0]?.id ?? 'outline';

  if (step === 'queued' || step === 'initializing') {
    stepId = activeSteps[0]?.id ?? 'outline';
  } else if (step === 'researching') {
    stepId = 'web-search';
  } else if (step === 'generating_outlines') {
    stepId =
      progress >= 26 && activeSteps.some((s) => s.id === 'agent-generation')
        ? 'agent-generation'
        : 'outline';
  } else if (step === 'generating_agents') {
    stepId = 'agent-generation';
  } else if (step === 'generating_scenes') {
    const halfDone = totalScenes ? scenesGenerated >= Math.ceil(totalScenes / 2) : progress >= 60;
    stepId =
      halfDone && activeSteps.some((s) => s.id === 'actions') ? 'actions' : 'slide-content';
  } else if (
    step === 'generating_tts' ||
    step === 'persisting'
  ) {
    stepId = 'actions';
  } else if (step === 'completed') {
    stepId = activeSteps[activeSteps.length - 1]?.id ?? 'actions';
  }

  if (!activeSteps.some((s) => s.id === stepId)) {
    stepId = activeSteps[0]?.id ?? 'outline';
  }

  return { stepIndex: findIndex(stepId), stepId };
}
