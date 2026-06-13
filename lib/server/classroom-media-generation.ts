/**
 * Server-side media and TTS generation for classrooms.
 *
 * Generates image/video files and TTS audio for a classroom,
 * saves them to private account files, and returns serving URL mappings.
 */

import path from 'path';
import { createLogger } from '@/lib/logger';
import { ObjectId } from 'mongodb';
import { del } from '@vercel/blob';
import { saveBufferForUser, saveRemoteFileForUser } from '@/lib/server/file-storage';
import { getCollections, getMongo } from '@/lib/server/mongodb';
import { generateImage } from '@/lib/media/image-providers';
import { generateVideo } from '@/lib/media/video-providers';
import { generateTTS } from '@/lib/audio/tts-providers';
import { DEFAULT_TTS_VOICES, DEFAULT_TTS_MODELS, TTS_PROVIDERS } from '@/lib/audio/constants';
import { IMAGE_PROVIDERS } from '@/lib/media/image-constants';
import { VIDEO_PROVIDERS, normalizeVideoOptions } from '@/lib/media/video-constants';
import { isMediaPlaceholder } from '@/lib/store/media-generation';
import {
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
  resolveImageApiKey,
  resolveVideoApiKey,
  resolveTTSApiKey,
  resolveImageBaseUrl,
  resolveVideoBaseUrl,
  resolveTTSBaseUrl,
} from '@/lib/server/provider-config';
import type { SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';
import type { ImageProviderId, VideoGenerationOptions, VideoProviderId } from '@/lib/media/types';
import type { TTSProviderId } from '@/lib/audio/types';
import { splitLongSpeechActions } from '@/lib/audio/tts-utils';

const log = createLogger('ClassroomMedia');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function audioMimeType(format: string): string {
  if (format === 'mp3') return 'audio/mpeg';
  if (format === 'ogg_opus') return 'audio/ogg';
  return `audio/${format}`;
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
      const baseUrl = resolveImageBaseUrl(providerId);
      if (!apiKey) {
        throw new Error(`图片生成服务缺少 API Key：${providerId}`);
      }
      const providerConfig = IMAGE_PROVIDERS[providerId];
      const model = providerConfig?.models?.[0]?.id;

      const result = await generateImage(
        { providerId, apiKey, baseUrl, model },
        { prompt: req.prompt, aspectRatio: req.aspectRatio || '16:9' },
      );

      let saved: Awaited<ReturnType<typeof saveBufferForUser>>;
      let filename: string;
      if (result.base64) {
        filename = `${req.elementId}.png`;
        saved = await saveBufferForUser(
          userId,
          Buffer.from(result.base64, 'base64'),
          filename,
          'image/png',
          'media',
          {
            classroomId,
            elementId: req.elementId,
            mediaType: 'image',
          },
        );
      } else if (result.url) {
        const urlExt = path.extname(new URL(result.url).pathname).replace('.', '');
        const ext = ['png', 'jpg', 'jpeg', 'webp'].includes(urlExt) ? urlExt : 'png';
        filename = `${req.elementId}.${ext}`;
        saved = await saveRemoteFileForUser(
          userId,
          result.url,
          filename,
          ext === 'jpg' ? 'image/jpeg' : `image/${ext}`,
          'media',
          {
            classroomId,
            elementId: req.elementId,
            mediaType: 'image',
          },
        );
      } else {
        throw new Error(`图片生成没有返回文件：${req.elementId}`);
      }

      mediaMap[req.elementId] = `${baseUrl}${saved.url}`;
      log.info(`Generated image: ${filename}`);
    }
  };

  const generateVideos = async () => {
    for (const req of videoRequests) {
      const providerId = videoProviderIds[0] as VideoProviderId;
      const apiKey = resolveVideoApiKey(providerId);
      const baseUrl = resolveVideoBaseUrl(providerId);
      if (!apiKey) {
        throw new Error(`视频生成服务缺少 API Key：${providerId}`);
      }
      const providerConfig = VIDEO_PROVIDERS[providerId];
      const model = providerConfig?.models?.[0]?.id;

      const normalized = normalizeVideoOptions(providerId, {
        prompt: req.prompt,
        aspectRatio: (req.aspectRatio as VideoGenerationOptions['aspectRatio']) || '16:9',
      });

      const result = await generateVideo(
        { providerId, apiKey, baseUrl, model },
        normalized,
      );

      const filename = `${req.elementId}.mp4`;
      const saved = result.base64
        ? await saveBufferForUser(
            userId,
            Buffer.from(result.base64, 'base64'),
            filename,
            'video/mp4',
            'video',
            {
              classroomId,
              elementId: req.elementId,
              mediaType: 'video',
            },
          )
        : result.url
          ? await saveRemoteFileForUser(
              userId,
              result.url,
              filename,
              'video/mp4',
              'video',
              {
                classroomId,
                elementId: req.elementId,
                mediaType: 'video',
              },
            )
          : null;

      if (!saved) {
        throw new Error(`视频生成没有返回文件：${req.elementId}`);
      }
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
// Vibe edit media reuse: persist preview-generated media instead of regenerating
// ---------------------------------------------------------------------------

export interface PersistVibeEditMediaResult {
  permanentMap: Record<string, string>;
  savedFileIds: string[];
}

export async function persistVibeEditMedia(
  mediaMap: Record<string, string>,
  classroomId: string,
  baseUrl: string,
  userId: ObjectId,
): Promise<PersistVibeEditMediaResult> {
  const permanentMap: Record<string, string> = {};
  const savedFileIds: string[] = [];

  for (const [elementId, src] of Object.entries(mediaMap)) {
    if (src.startsWith('data:')) {
      const match = src.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new Error(`媒体内容格式不正确：${elementId}`);
      }
      const contentType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      const ext = contentType.split('/')[1] || 'png';
      const isVideo = contentType.startsWith('video/');
      const filename = `${elementId}.${ext}`;
      const saved = await saveBufferForUser(
        userId,
        buffer,
        filename,
        contentType,
        isVideo ? 'video' : 'media',
        {
          classroomId,
          elementId,
          mediaType: isVideo ? 'video' : 'image',
        },
      );
      permanentMap[elementId] = `${baseUrl}${saved.url}`;
      savedFileIds.push(saved.id);
      continue;
    }

    if (/^https?:\/\//i.test(src)) {
      const urlExt = path.extname(new URL(src).pathname).replace('.', '').toLowerCase();
      const videoExts = ['mp4', 'webm', 'mov'];
      const imageExts = ['png', 'jpg', 'jpeg', 'webp'];
      const isVideo = videoExts.includes(urlExt);
      const ext = isVideo
        ? (videoExts.includes(urlExt) ? urlExt : 'mp4')
        : (imageExts.includes(urlExt) ? urlExt : 'png');
      const contentType = isVideo
        ? `video/${ext === 'mov' ? 'quicktime' : ext}`
        : ext === 'jpg'
          ? 'image/jpeg'
          : `image/${ext}`;
      const filename = `${elementId}.${ext}`;
      const saved = await saveRemoteFileForUser(
        userId,
        src,
        filename,
        contentType,
        isVideo ? 'video' : 'media',
        {
          classroomId,
          elementId,
          mediaType: isVideo ? 'video' : 'image',
        },
      );
      permanentMap[elementId] = `${baseUrl}${saved.url}`;
      savedFileIds.push(saved.id);
      continue;
    }

    throw new Error(`媒体地址不识别：${elementId}`);
  }

  return { permanentMap, savedFileIds };
}

export async function cleanupVibeEditMedia(savedFileIds: string[]): Promise<void> {
  if (savedFileIds.length === 0) return;
  const objectIds = savedFileIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  if (objectIds.length === 0) return;

  const { db } = await getMongo();
  const c = getCollections(db);
  const files = await c.accountFiles.find({ _id: { $in: objectIds } }).toArray();
  if (files.length > 0) {
    try {
      await del(files.map((file) => file.url));
    } catch (error) {
      log.error('Failed to delete blob files:', error);
    }
  }
  await c.accountFiles.deleteMany({ _id: { $in: objectIds } });
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
      speechAction.audioUrl = `${baseUrl}${saved.url}`;
      log.info(`Generated TTS: ${filename} (${audioBuffer.length} bytes)`);
    }
  }
}
