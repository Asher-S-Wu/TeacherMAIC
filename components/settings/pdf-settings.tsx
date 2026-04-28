'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { PDF_PROVIDERS } from '@/lib/pdf/constants';
import type { PDFProviderId } from '@/lib/pdf/types';
import { CheckCircle2, Loader2, Zap, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Get display label for feature
 */
function getFeatureLabel(feature: string, t: (key: string) => string): string {
  const labels: Record<string, string> = {
    text: t('settings.featureText'),
    images: t('settings.featureImages'),
    tables: t('settings.featureTables'),
    formulas: t('settings.featureFormulas'),
    'layout-analysis': t('settings.featureLayoutAnalysis'),
    metadata: t('settings.featureMetadata'),
  };
  return labels[feature] || feature;
}

interface PDFSettingsProps {
  selectedProviderId: PDFProviderId;
}

export function PDFSettings({ selectedProviderId }: PDFSettingsProps) {
  const { t } = useI18n();
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const pdfProvidersConfig = useSettingsStore((state) => state.pdfProvidersConfig);

  const pdfProvider = PDF_PROVIDERS[selectedProviderId];
  const isServerConfigured = !!pdfProvidersConfig[selectedProviderId]?.isServerConfigured;

  const isCloud = selectedProviderId === 'mineru-cloud';
  const needsRemoteConfig = isCloud;

  const canTest = isServerConfigured;

  // Reset state when provider changes
  const [prevSelectedProviderId, setPrevSelectedProviderId] = useState(selectedProviderId);
  if (selectedProviderId !== prevSelectedProviderId) {
    setPrevSelectedProviderId(selectedProviderId);
    setTestStatus('idle');
    setTestMessage('');
  }

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('');

    try {
      const response = await fetch('/api/verify-pdf-provider', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setTestStatus('success');
        setTestMessage(t('settings.connectionSuccess'));
      } else {
        setTestStatus('error');
        setTestMessage(`${t('settings.connectionFailed')}: ${data.error}`);
      }
    } catch (err) {
      setTestStatus('error');
      const message = err instanceof Error ? err.message : String(err);
      setTestMessage(`${t('settings.connectionFailed')}: ${message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
        {isServerConfigured || !pdfProvider.requiresApiKey
          ? t('settings.serverConfiguredNotice')
          : t('settings.serverConfigMissingNotice')}
      </div>

      {/* Configuration section (for remote providers) */}
      {(needsRemoteConfig || isServerConfigured) && (
        <>
          <div className="grid gap-4">
            {isCloud && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={testStatus === 'testing' || !canTest}
                    className="gap-1.5 shrink-0"
                  >
                    {testStatus === 'testing' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Zap className="h-3.5 w-3.5" />
                        {t('settings.testConnection')}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Test result message */}
          {testMessage && (
            <div
              className={cn(
                'rounded-lg p-3 text-sm',
                testStatus === 'success' &&
                  'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800',
                testStatus === 'error' &&
                  'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800',
              )}
            >
              <div className="flex items-center gap-2">
                {testStatus === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                {testStatus === 'error' && <XCircle className="h-4 w-4 shrink-0" />}
                <span className="break-all">{testMessage}</span>
              </div>
            </div>
          )}

        </>
      )}

      {/* Features List */}
      <div className="space-y-2">
        <Label className="text-sm">{t('settings.pdfFeatures')}</Label>
        <div className="flex flex-wrap gap-2">
          {pdfProvider.features.map((feature) => (
            <Badge key={feature} variant="secondary" className="font-normal">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {getFeatureLabel(feature, t)}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
