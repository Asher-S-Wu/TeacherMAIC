import { ScanLine, Search, Bot, FileText, LayoutPanelLeft, Clapperboard } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settings';
import type {
  SceneOutline,
  UserRequirements,
  PdfImage,
} from '@/lib/types/generation';

// Session state stored in sessionStorage
export interface GenerationSessionState {
  sessionId: string;
  requirements: UserRequirements;
  pdfText: string;
  pdfImages?: PdfImage[];
  imageStorageIds?: string[];
  sceneOutlines?: SceneOutline[] | null;
  currentStep: 'generating' | 'complete';
  // PDF deferred parsing fields
  pdfStorageKey?: string;
  pdfFileName?: string;
  pdfProviderId?: string;
  // Web search context
  researchContext?: string;
  researchSources?: Array<{ title: string; url: string }>;
  // Language directive inferred from outline generation
  languageDirective?: string;
}

export type GenerationStep = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  type: 'analysis' | 'writing' | 'visual';
};

export const ALL_STEPS: GenerationStep[] = [
  {
    id: 'pdf-analysis',
    title: '解析 PDF 文档',
    description: '正在提取文档结构和内容...',
    icon: ScanLine,
    type: 'analysis',
  },
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

export const getActiveSteps = (session: GenerationSessionState | null) => {
  return ALL_STEPS.filter((step) => {
    if (step.id === 'pdf-analysis') return !!session?.pdfStorageKey;
    if (step.id === 'web-search') return !!session?.requirements?.webSearch;
    if (step.id === 'agent-generation') return useSettingsStore.getState().agentMode === 'auto';
    return true;
  });
};
