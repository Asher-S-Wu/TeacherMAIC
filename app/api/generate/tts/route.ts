/**
 * Single TTS Generation API
 *
 * Generates TTS audio for a single text string and stores it as a private account file.
 * Called by the client in parallel for each speech action after a scene is generated.
 *
 * POST /api/generate/tts
 */

import { NextRequest } from 'next/server';
import { generateTTS } from '@/lib/audio/tts-providers';
import { resolveTTSApiKey, resolveTTSBaseUrl } from '@/lib/server/provider-config';
import type { TTSProviderId } from '@/lib/audio/types';
import { DOUBAO_AUDIO_TTS_MODEL_ID, TTS_PROVIDERS } from '@/lib/audio/constants';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { saveBufferForUser } from '@/lib/server/file-storage';

const log = createLogger('TTS API');

function audioMimeType(format: string): string {
  if (format === 'mp3') return 'audio/mpeg';
  if (format === 'ogg_opus') return 'audio/ogg';
  return `audio/${format}`;
}

export async function POST(req: NextRequest) {
  let ttsVoice: string | undefined;
  let audioId: string | undefined;
  try {
    const body = await req.json();
    const user = await requireCurrentUser();
    const { text } = body as {
      text: string;
      audioId: string;
      ttsVoice: string;
    };
    ttsVoice = body.ttsVoice;
    audioId = body.audioId;

    // Validate required fields
    if (!text || !audioId || !ttsVoice) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'Missing required fields: text, audioId, ttsVoice',
      );
    }

    const effectiveProviderId: TTSProviderId = 'volcengine-doubao-tts';
    const apiKey = resolveTTSApiKey(effectiveProviderId);
    const baseUrl = resolveTTSBaseUrl(effectiveProviderId);
    if (!apiKey) {
      return apiError(
        'MISSING_API_KEY',
        401,
        '语音生成暂时不可用，请稍后再试。',
      );
    }

    const validVoiceIds = new Set(
      TTS_PROVIDERS[effectiveProviderId].voices.map((voice) => voice.id),
    );
    if (!validVoiceIds.has(ttsVoice)) {
      return apiError('INVALID_REQUEST', 400, '当前语音角色不可用，请重新选择语音。');
    }

    // Build TTS config
    const config = {
      providerId: effectiveProviderId,
      modelId: DOUBAO_AUDIO_TTS_MODEL_ID,
      voice: ttsVoice,
      apiKey,
      baseUrl,
    };

    log.info(
      `Generating TTS: provider=volcengine-doubao-tts, model=${DOUBAO_AUDIO_TTS_MODEL_ID}, voice=${ttsVoice}, audioId=${audioId}, textLen=${text.length}`,
    );

    // Generate audio
    const { audio, format } = await generateTTS(config, text);

    const file = await saveBufferForUser(
      user._id,
      Buffer.from(audio),
      `${audioId}.${format}`,
      audioMimeType(format),
      'audio',
      { audioId },
    );

    return apiSuccess({ audioId, file, format });
  } catch (error) {
    log.error(
      `TTS generation failed [provider=volcengine-doubao-tts, voice=${ttsVoice ?? 'unknown'}, audioId=${audioId ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      'GENERATION_FAILED',
      500,
      '语音生成失败，请稍后再试。',
    );
  }
}
