'use client';

import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useSettingsStore } from '@/lib/store/settings';
import { PDF_PROVIDERS } from '@/lib/pdf/constants';
import type { PDFProviderId } from '@/lib/pdf/types';
import { CheckCircle2 } from 'lucide-react';

const FEATURE_LABELS: Record<string, string> = {
  text: '文本提取',
  images: '图片提取',
  tables: '表格提取',
  formulas: '公式识别',
  'layout-analysis': '布局分析',
  metadata: '元数据',
};

interface PDFSettingsProps {
  selectedProviderId: PDFProviderId;
}

export function PDFSettings({ selectedProviderId }: PDFSettingsProps) {
  const pdfProvidersConfig = useSettingsStore((state) => state.pdfProvidersConfig);

  const pdfProvider = PDF_PROVIDERS[selectedProviderId];
  const isServerConfigured = !!pdfProvidersConfig[selectedProviderId]?.isServerConfigured;
  const showMissingNotice = !isServerConfigured && pdfProvider.requiresApiKey;

  return (
    <div className="space-y-6 max-w-3xl">
      {showMissingNotice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          此功能暂时不可用，请稍后再试。
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm">支持功能</Label>
        <div className="flex flex-wrap gap-2">
          {pdfProvider.features.map((feature) => (
            <Badge key={feature} variant="secondary" className="font-normal">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {FEATURE_LABELS[feature] || feature}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
