import { NextRequest } from 'next/server';
import { transcribeAudio } from '@/lib/audio/asr-providers';
import { resolveASRApiConfig } from '@/lib/server/provider-config';
import type { ASRProviderId } from '@/lib/audio/types';
import { DOUBAO_AUC_ASR_MODEL_ID } from '@/lib/audio/constants';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { getReadableFileForUser } from '@/lib/server/file-storage';
const log = createLogger('Transcription');

function resolveAudioFormat(contentType: string, filename: string): string {
  const normalizedType = contentType.split(';')[0]?.trim().toLowerCase();
  if (normalizedType === 'audio/mpeg' || normalizedType === 'audio/mp3') return 'mp3';
  if (normalizedType === 'audio/ogg') return 'ogg';
  if (normalizedType === 'audio/wav' || normalizedType === 'audio/x-wav') return 'wav';

  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension === 'mp3' || extension === 'ogg' || extension === 'wav') return extension;

  return 'wav';
}

export async function POST(req: NextRequest) {
  let resolvedProviderId: string | undefined;
  let resolvedModelId: string | undefined;
  try {
    const user = await requireCurrentUser();
    const body = (await req.json()) as { fileId?: string; language?: string };

    if (!body.fileId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Audio file is required');
    }

    const storedAudio = await getReadableFileForUser(body.fileId, user);
    if (!storedAudio || !storedAudio.file.contentType.startsWith('audio/')) {
      return apiError('INVALID_REQUEST', 400, '音频文件不存在');
    }

    const effectiveProviderId: ASRProviderId = 'volcengine-doubao-auc-asr';
    resolvedProviderId = effectiveProviderId;
    resolvedModelId = DOUBAO_AUC_ASR_MODEL_ID;
    const apiConfig = resolveASRApiConfig(effectiveProviderId);

    const config = {
      providerId: effectiveProviderId,
      modelId: DOUBAO_AUC_ASR_MODEL_ID,
      language: body.language || 'auto',
      mimeType: storedAudio.file.contentType,
      metadataUserId: user._id.toString(),
      ...apiConfig,
    };

    const result = await transcribeAudio(config, {
      audioUrl: storedAudio.file.url,
      format: resolveAudioFormat(storedAudio.file.contentType, storedAudio.file.filename),
    });

    return apiSuccess({ text: result.text });
  } catch (error) {
    log.error(
      `Transcription failed [provider=${resolvedProviderId ?? 'unknown'}, model=${resolvedModelId ?? 'default'}]:`,
      error,
    );
    return apiError(
      'TRANSCRIPTION_FAILED',
      500,
      '语音识别失败，请稍后再试。',
    );
  }
}
