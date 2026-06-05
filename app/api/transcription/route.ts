import { NextRequest } from 'next/server';
import { transcribeAudio } from '@/lib/audio/asr-providers';
import { resolveASRApiConfig } from '@/lib/server/provider-config';
import type { ASRProviderId } from '@/lib/audio/types';
import { DOUBAO_ASR_MODEL_ID } from '@/lib/audio/constants';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { getFileBufferForUser } from '@/lib/server/file-storage';
const log = createLogger('Transcription');

export async function POST(req: NextRequest) {
  let resolvedProviderId: string | undefined;
  let resolvedModelId: string | undefined;
  try {
    const user = await requireCurrentUser();
    const body = (await req.json()) as { fileId?: string; language?: string };

    if (!body.fileId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Audio file is required');
    }

    const storedAudio = await getFileBufferForUser(body.fileId, user);
    if (!storedAudio || !storedAudio.file.contentType.startsWith('audio/')) {
      return apiError('INVALID_REQUEST', 400, '音频文件不存在');
    }

    const effectiveProviderId: ASRProviderId = 'doubao-asr';
    resolvedProviderId = effectiveProviderId;
    resolvedModelId = DOUBAO_ASR_MODEL_ID;
    const apiConfig = resolveASRApiConfig(effectiveProviderId);

    const config = {
      providerId: effectiveProviderId,
      modelId: DOUBAO_ASR_MODEL_ID,
      language: body.language || 'auto',
      ...apiConfig,
    };

    // Transcribe using the provider system
    const result = await transcribeAudio(config, storedAudio.buffer);

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
