'use client';

import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { ASR_PROVIDERS } from '@/lib/audio/constants';
import type { ASRProviderId } from '@/lib/audio/types';
import { CheckCircle2, Eye, EyeOff, Loader2, Mic, MicOff, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/logger';

const log = createLogger('ASRSettings');

interface ASRSettingsProps {
  selectedProviderId: ASRProviderId;
}

export function ASRSettings({ selectedProviderId }: ASRSettingsProps) {
  const { t } = useI18n();
  const provider = ASR_PROVIDERS['qwen-asr'];
  const asrLanguage = useSettingsStore((state) => state.asrLanguage);
  const providerConfig = useSettingsStore((state) => state.asrProvidersConfig['qwen-asr']);
  const setASRLanguage = useSettingsStore((state) => state.setASRLanguage);
  const setASRProviderConfig = useSettingsStore((state) => state.setASRProviderConfig);

  const [showApiKey, setShowApiKey] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [asrResult, setASRResult] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    setShowApiKey(false);
    setTestStatus('idle');
    setTestMessage('');
    setASRResult('');
  }, [selectedProviderId]);

  const handleToggleASRRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    setASRResult('');
    setTestStatus('testing');
    setTestMessage('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsProcessing(true);

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('providerId', 'qwen-asr');
        formData.append('language', asrLanguage);
        if (providerConfig?.apiKey?.trim()) {
          formData.append('apiKey', providerConfig.apiKey);
        }

        try {
          const response = await fetch('/api/transcription', {
            method: 'POST',
            body: formData,
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok && data.text?.trim()) {
            setASRResult(data.text);
            setTestStatus('success');
            setTestMessage(t('settings.asrTestSuccess'));
          } else {
            setTestStatus('error');
            setTestMessage(data.details || data.error || t('settings.asrNoTranscription'));
          }
        } catch (error) {
          log.error('ASR test failed:', error);
          setTestStatus('error');
          setTestMessage(
            error instanceof Error && error.message
              ? `${t('settings.asrTestFailed')}: ${error.message}`
              : t('settings.asrTestFailed'),
          );
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      log.error('Failed to access microphone:', error);
      setTestStatus('error');
      setTestMessage(t('settings.microphoneAccessFailed'));
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {providerConfig?.isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          {t('settings.serverConfiguredNotice')}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm">{t('settings.asrApiKey')}</Label>
          <div className="relative">
            <Input
              name="asr-api-key-qwen"
              type={showApiKey ? 'text' : 'password'}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={
                providerConfig?.isServerConfigured
                  ? t('settings.optionalOverride')
                  : t('settings.enterApiKey')
              }
              value={providerConfig?.apiKey || ''}
              onChange={(e) => setASRProviderConfig('qwen-asr', { apiKey: e.target.value })}
              className="font-mono text-sm pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">{t('settings.asrLanguage')}</Label>
          <Select value={asrLanguage} onValueChange={setASRLanguage}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {provider.supportedLanguages.map((language) => (
                <SelectItem key={language} value={language}>
                  {language}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">{t('settings.availableModels')}</Label>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border border-border/40 text-xs font-mono text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500/70" />
          {provider.models[0].name}
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t">
        <Label className="text-sm">{t('settings.testConnection')}</Label>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleToggleASRRecording}
            disabled={isProcessing}
            variant={isRecording ? 'destructive' : 'default'}
            className="gap-2"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {isProcessing
              ? t('settings.asrProcessing')
              : isRecording
                ? t('settings.stopRecording')
                : t('settings.startRecording')}
          </Button>
          {isRecording && (
            <span className="text-sm text-muted-foreground">{t('settings.recording')}</span>
          )}
        </div>

        {testStatus !== 'idle' && testMessage && (
          <div
            className={cn(
              'flex items-center gap-2 text-sm',
              testStatus === 'success' && 'text-emerald-600 dark:text-emerald-400',
              testStatus === 'error' && 'text-destructive',
            )}
          >
            {testStatus === 'success' && <CheckCircle2 className="h-4 w-4" />}
            {testStatus === 'error' && <XCircle className="h-4 w-4" />}
            <span>{testMessage}</span>
          </div>
        )}

        {asrResult && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="text-muted-foreground mb-1">{t('settings.transcriptionResult')}</div>
            <div>{asrResult}</div>
          </div>
        )}
      </div>
    </div>
  );
}
