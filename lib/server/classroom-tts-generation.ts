/**
 * Server-side TTS generation for classrooms.
 *
 * Generates TTS audio for a classroom, saves it to public account files,
 * and attaches serving URLs to speech actions.
 */

import { createLogger } from '@/lib/logger';
import { ObjectId } from 'mongodb';
import { saveBufferForUser } from '@/lib/server/file-storage';
import { generateTTS } from '@/lib/audio/tts-providers';
import { DEFAULT_TTS_VOICES, DEFAULT_TTS_MODELS, TTS_PROVIDERS } from '@/lib/audio/constants';
import {
  getServerTTSProviders,
  resolveTTSApiKey,
  resolveTTSBaseUrl,
} from '@/lib/server/provider-config';
import type { Scene } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';
import type { TTSProviderId } from '@/lib/audio/types';
import { splitLongSpeechActions } from '@/lib/audio/tts-utils';

const log = createLogger('ClassroomTTS');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function audioMimeType(format: string): string {
  if (format === 'mp3') return 'audio/mpeg';
  if (format === 'ogg_opus') return 'audio/ogg';
  return `audio/${format}`;
}

// ---------------------------------------------------------------------------
// TTS generation
// ---------------------------------------------------------------------------

export async function generateTTSForClassroom(
  scenes: Scene[],
  classroomId: string,
  userId: ObjectId,
): Promise<void> {
  const ttsProviderIds = Object.keys(getServerTTSProviders());
  if (ttsProviderIds.length === 0) {
    throw new Error('未配置服务器语音生成服务');
  }

  const providerId = ttsProviderIds[0] as TTSProviderId;
  const apiKey = resolveTTSApiKey(providerId);
  const ttsBaseUrl = resolveTTSBaseUrl(providerId);
  if (!apiKey) {
    throw new Error(`语音生成服务缺少 API Key：${providerId}`);
  }
  const voice = DEFAULT_TTS_VOICES[providerId as keyof typeof DEFAULT_TTS_VOICES] || 'default';
  const format =
    TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS]?.supportedFormats?.[0] || 'mp3';
  for (const scene of scenes) {
    if (!scene.actions) continue;

    // Split long speech actions into multiple shorter ones before TTS generation,
    // mirroring the client-side approach. Each sub-action gets its own audio file.
    scene.actions = splitLongSpeechActions(scene.actions, providerId);

    // Use scene order to make audio IDs unique across scenes
    const sceneOrder = scene.order;

    for (const action of scene.actions) {
      if (action.type !== 'speech' || !(action as SpeechAction).text) continue;
      const speechAction = action as SpeechAction;
      // Include scene order in audioId to prevent collision across scenes
      const audioId = `tts_s${sceneOrder}_${action.id}`;

      const result = await generateTTS(
        {
          providerId,
          modelId: DEFAULT_TTS_MODELS[providerId as keyof typeof DEFAULT_TTS_MODELS] || '',
          apiKey,
          baseUrl: ttsBaseUrl,
          voice,
        },
        speechAction.text,
      );

      const filename = `${audioId}.${result.format || format}`;
      const audioBuffer = Buffer.from(result.audio);
      const saved = await saveBufferForUser(
        userId,
        audioBuffer,
        filename,
        audioMimeType(result.format || format),
        'audio',
        {
          classroomId,
          audioId,
        },
      );

      speechAction.audioId = audioId;
      speechAction.audioUrl = saved.url;
      log.info(`Generated TTS: ${filename} (${audioBuffer.length} bytes)`);
    }
  }
}
