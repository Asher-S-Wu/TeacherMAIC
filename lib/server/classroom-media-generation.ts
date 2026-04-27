/**
 * Server-side media and TTS generation for classrooms.
 *
 * Generates image/video files and TTS audio for a classroom,
 * saves them to MongoDB GridFS, and returns serving URL mappings.
 */

import path from 'path';
import { createLogger } from '@/lib/logger';
import type { ObjectId } from 'mongodb';
import { saveBufferForUser } from '@/lib/server/file-storage';
import { generateImage } from '@/lib/media/image-providers';
import { generateVideo, normalizeVideoOptions } from '@/lib/media/video-providers';
import { generateTTS } from '@/lib/audio/tts-providers';
import { DEFAULT_TTS_VOICES, DEFAULT_TTS_MODELS, TTS_PROVIDERS } from '@/lib/audio/constants';
import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import { VIDEO_PROVIDERS } from '@/lib/media/video-providers';
import { isMediaPlaceholder } from '@/lib/store/media-generation';
import {
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
  resolveImageApiKey,
  resolveImageBaseUrl,
  resolveVideoApiKey,
  resolveVideoBaseUrl,
  resolveTTSApiKey,
  resolveTTSBaseUrl,
} from '@/lib/server/provider-config';
import type { SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';
import type { ImageProviderId } from '@/lib/media/types';
import type { VideoProviderId } from '@/lib/media/types';
import type { TTSProviderId } from '@/lib/audio/types';
import { splitLongSpeechActions } from '@/lib/audio/tts-utils';

const log = createLogger('ClassroomMedia');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOWNLOAD_TIMEOUT_MS = 120_000; // 2 minutes
const DOWNLOAD_MAX_SIZE = 100 * 1024 * 1024; // 100 MB

async function downloadToBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  const contentLength = Number(resp.headers.get('content-length') || 0);
  if (contentLength > DOWNLOAD_MAX_SIZE) {
    throw new Error(`File too large: ${contentLength} bytes (max ${DOWNLOAD_MAX_SIZE})`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Image / Video generation
// ---------------------------------------------------------------------------

export async function generateMediaForClassroom(
  outlines: SceneOutline[],
  classroomId: string,
  baseUrl: string,
  userId: ObjectId,
): Promise<Record<string, string>> {
  // Collect all media generation requests from outlines
  const requests = outlines.flatMap((o) => o.mediaGenerations ?? []);
  if (requests.length === 0) return {};

  // Resolve providers
  const imageProviderIds = Object.keys(getServerImageProviders());
  const videoProviderIds = Object.keys(getServerVideoProviders());

  const mediaMap: Record<string, string> = {};

  // Separate image and video requests, generate each type sequentially
  // but run the two types in parallel (providers often have limited concurrency).
  const imageRequests = requests.filter((r) => r.type === 'image' && imageProviderIds.length > 0);
  const videoRequests = requests.filter((r) => r.type === 'video' && videoProviderIds.length > 0);
  if (requests.some((r) => r.type === 'image') && imageProviderIds.length === 0) {
    throw new Error('未配置图片生成服务');
  }
  if (requests.some((r) => r.type === 'video') && videoProviderIds.length === 0) {
    throw new Error('未配置视频生成服务');
  }

  const generateImages = async () => {
    for (const req of imageRequests) {
      const providerId = imageProviderIds[0] as ImageProviderId;
      const apiKey = resolveImageApiKey(providerId);
      if (!apiKey) {
        throw new Error(`图片生成服务缺少 API Key：${providerId}`);
      }
      const providerConfig = IMAGE_PROVIDERS[providerId];
      const model = providerConfig?.models?.[0]?.id;

      const result = await generateImage(
        { providerId, apiKey, baseUrl: resolveImageBaseUrl(providerId), model },
        { prompt: req.prompt, aspectRatio: req.aspectRatio || '16:9' },
      );

      let buf: Buffer;
      let ext: string;
      if (result.base64) {
        buf = Buffer.from(result.base64, 'base64');
        ext = 'png';
      } else if (result.url) {
        buf = await downloadToBuffer(result.url);
        const urlExt = path.extname(new URL(result.url).pathname).replace('.', '');
        ext = ['png', 'jpg', 'jpeg', 'webp'].includes(urlExt) ? urlExt : 'png';
      } else {
        throw new Error(`图片生成没有返回文件：${req.elementId}`);
      }

      const filename = `${req.elementId}.${ext}`;
      const saved = await saveBufferForUser(userId, buf, filename, `image/${ext}`, 'media', {
        classroomId,
        elementId: req.elementId,
        mediaType: 'image',
      });
      mediaMap[req.elementId] = `${baseUrl}${saved.url}`;
      log.info(`Generated image: ${filename}`);
    }
  };

  const generateVideos = async () => {
    for (const req of videoRequests) {
      const providerId = videoProviderIds[0] as VideoProviderId;
      const apiKey = resolveVideoApiKey(providerId);
      if (!apiKey) {
        throw new Error(`视频生成服务缺少 API Key：${providerId}`);
      }
      const providerConfig = VIDEO_PROVIDERS[providerId];
      const model = providerConfig?.models?.[0]?.id;

      const normalized = normalizeVideoOptions(providerId, {
        prompt: req.prompt,
        aspectRatio: (req.aspectRatio as '16:9' | '4:3' | '1:1' | '9:16') || '16:9',
      });

      const result = await generateVideo(
        { providerId, apiKey, baseUrl: resolveVideoBaseUrl(providerId), model },
        normalized,
      );

      const buf = await downloadToBuffer(result.url);
      const filename = `${req.elementId}.mp4`;
      const saved = await saveBufferForUser(userId, buf, filename, 'video/mp4', 'media', {
        classroomId,
        elementId: req.elementId,
        mediaType: 'video',
      });
      mediaMap[req.elementId] = `${baseUrl}${saved.url}`;
      log.info(`Generated video: ${filename}`);
    }
  };

  await Promise.all([generateImages(), generateVideos()]);

  return mediaMap;
}

// ---------------------------------------------------------------------------
// Placeholder replacement in scene content
// ---------------------------------------------------------------------------

export function replaceMediaPlaceholders(scenes: Scene[], mediaMap: Record<string, string>): void {
  if (Object.keys(mediaMap).length === 0) return;

  for (const scene of scenes) {
    if (scene.type !== 'slide') continue;
    const canvas = (
      scene.content as {
        canvas?: { elements?: Array<{ id: string; src?: string; type?: string }> };
      }
    )?.canvas;
    if (!canvas?.elements) continue;

    for (const el of canvas.elements) {
      if (
        (el.type === 'image' || el.type === 'video') &&
        typeof el.src === 'string' &&
        isMediaPlaceholder(el.src) &&
        mediaMap[el.src]
      ) {
        el.src = mediaMap[el.src];
      }
    }
  }
}

// ---------------------------------------------------------------------------
// TTS generation
// ---------------------------------------------------------------------------

export async function generateTTSForClassroom(
  scenes: Scene[],
  classroomId: string,
  baseUrl: string,
  userId: ObjectId,
): Promise<void> {
  // Resolve TTS provider (exclude browser-native-tts)
  const ttsProviderIds = Object.keys(getServerTTSProviders()).filter(
    (id) => id !== 'browser-native-tts',
  );
  if (ttsProviderIds.length === 0) {
    throw new Error('未配置服务器语音生成服务');
  }

  const providerId = ttsProviderIds[0] as TTSProviderId;
  const apiKey = resolveTTSApiKey(providerId);
  if (!apiKey) {
    throw new Error(`语音生成服务缺少 API Key：${providerId}`);
  }
  const ttsBaseUrl =
    resolveTTSBaseUrl(providerId) ||
    TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS]?.defaultBaseUrl;
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
          speed: speechAction.speed,
        },
        speechAction.text,
      );

      const filename = `${audioId}.${result.format || format}`;
      const saved = await saveBufferForUser(
        userId,
        result.audio,
        filename,
        `audio/${result.format || format}`,
        'audio',
        {
          classroomId,
          audioId,
        },
      );

      speechAction.audioId = audioId;
      speechAction.audioUrl = `${baseUrl}${saved.url}`;
      log.info(`Generated TTS: ${filename} (${result.audio.length} bytes)`);
    }
  }
}
