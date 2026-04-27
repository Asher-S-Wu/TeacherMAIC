/**
 * Single TTS Generation API
 *
 * Generates TTS audio for a single text string and returns base64-encoded audio.
 * Called by the client in parallel for each speech action after a scene is generated.
 *
 * POST /api/generate/tts
 */

import { NextRequest } from 'next/server';
import { generateTTS } from '@/lib/audio/tts-providers';
import { resolveTTSApiKey } from '@/lib/server/provider-config';
import type { TTSProviderId } from '@/lib/audio/types';
import { QWEN_TTS_MODEL_ID } from '@/lib/audio/constants';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('TTS API');

export async function POST(req: NextRequest) {
  let ttsProviderId: string | undefined;
  let ttsVoice: string | undefined;
  let audioId: string | undefined;
  try {
    const body = await req.json();
    const { text, ttsSpeed, ttsApiKey } = body as {
      text: string;
      audioId: string;
      ttsProviderId: string;
      ttsVoice: string;
      ttsSpeed?: number;
      ttsApiKey?: string;
    };
    ttsProviderId = body.ttsProviderId;
    ttsVoice = body.ttsVoice;
    audioId = body.audioId;

    // Validate required fields
    if (!text || !audioId || !ttsProviderId || !ttsVoice) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'Missing required fields: text, audioId, ttsProviderId, ttsVoice',
      );
    }

    if (ttsProviderId !== 'qwen-tts') {
      return apiError('INVALID_REQUEST', 400, 'Only qwen-tts is supported');
    }

    const effectiveProviderId: TTSProviderId = 'qwen-tts';
    const apiKey = resolveTTSApiKey(effectiveProviderId, ttsApiKey || undefined);

    // Build TTS config
    const config = {
      providerId: effectiveProviderId,
      modelId: QWEN_TTS_MODEL_ID,
      voice: ttsVoice,
      speed: ttsSpeed ?? 1.0,
      apiKey,
    };

    log.info(
      `Generating TTS: provider=${ttsProviderId}, model=${QWEN_TTS_MODEL_ID}, voice=${ttsVoice}, audioId=${audioId}, textLen=${text.length}`,
    );

    // Generate audio
    const { audio, format } = await generateTTS(config, text);

    // Convert to base64
    const base64 = Buffer.from(audio).toString('base64');

    return apiSuccess({ audioId, base64, format });
  } catch (error) {
    log.error(
      `TTS generation failed [provider=${ttsProviderId ?? 'unknown'}, voice=${ttsVoice ?? 'unknown'}, audioId=${audioId ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      'GENERATION_FAILED',
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
