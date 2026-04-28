import { NextRequest } from 'next/server';
import { transcribeAudio } from '@/lib/audio/asr-providers';
import { resolveASRApiKey } from '@/lib/server/provider-config';
import type { ASRProviderId } from '@/lib/audio/types';
import { QWEN_ASR_MODEL_ID } from '@/lib/audio/constants';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
const log = createLogger('Transcription');

export async function POST(req: NextRequest) {
  let resolvedProviderId: string | undefined;
  let resolvedModelId: string | undefined;
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    const language = formData.get('language') as string | null;

    if (!audioFile) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Audio file is required');
    }

    const effectiveProviderId: ASRProviderId = 'qwen-asr';
    resolvedProviderId = effectiveProviderId;
    resolvedModelId = QWEN_ASR_MODEL_ID;

    const config = {
      providerId: effectiveProviderId,
      modelId: QWEN_ASR_MODEL_ID,
      language: language || 'auto',
      apiKey: resolveASRApiKey(effectiveProviderId),
    };

    // Convert audio file to buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Transcribe using the provider system
    const result = await transcribeAudio(config, buffer);

    return apiSuccess({ text: result.text });
  } catch (error) {
    log.error(
      `Transcription failed [provider=${resolvedProviderId ?? 'unknown'}, model=${resolvedModelId ?? 'default'}]:`,
      error,
    );
    return apiError(
      'TRANSCRIPTION_FAILED',
      500,
      'Transcription failed',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
