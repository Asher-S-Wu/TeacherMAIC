import type {
  BuiltInTTSProviderId,
  TTSProviderId,
  TTSProviderConfig,
  TTSVoiceInfo,
  BuiltInASRProviderId,
  ASRProviderId,
  ASRProviderConfig,
} from './types';
import {
  ARK_BASE_URL,
  ARK_LLM_MODEL_ID,
  ARK_LLM_MODEL_NAME,
  ARK_TTS_MODEL_ID,
  ARK_TTS_MODEL_NAME,
} from '@/lib/ai/ark-models';

export { ARK_TTS_MODEL_ID, ARK_TTS_MODEL_NAME };
export const ARK_ASR_MODEL_ID = ARK_LLM_MODEL_ID;
const ARK_TTS_BASE_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';

export const ARK_ASR_LANGUAGES = [
  'auto',
  'zh',
  'yue',
  'en',
  'ja',
  'ko',
  'de',
  'fr',
  'ru',
  'es',
  'pt',
  'ar',
  'it',
  'hi',
  'id',
  'ms',
  'th',
  'tr',
  'vi',
];

export const ARK_TTS_VOICES: TTSVoiceInfo[] = [
  {
    id: 'zh_female_vv_uranus_bigtts',
    name: 'vivi 2.0',
    language: 'zh-CN',
    gender: 'female',
  },
  {
    id: 'zh_male_dayi_saturn_bigtts',
    name: '大壹',
    language: 'zh-CN',
    gender: 'male',
  },
  {
    id: 'zh_female_mizai_saturn_bigtts',
    name: '黑猫侦探社咪仔',
    language: 'zh-CN',
    gender: 'female',
  },
  {
    id: 'zh_female_jitangnv_saturn_bigtts',
    name: '鸡汤女',
    language: 'zh-CN',
    gender: 'female',
  },
  {
    id: 'zh_female_meilinvyou_saturn_bigtts',
    name: '魅力女友',
    language: 'zh-CN',
    gender: 'female',
  },
  {
    id: 'zh_female_santongyongns_saturn_bigtts',
    name: '流畅女声',
    language: 'zh-CN',
    gender: 'female',
  },
  {
    id: 'zh_male_ruyayichen_saturn_bigtts',
    name: '儒雅逸辰',
    language: 'zh-CN',
    gender: 'male',
  },
];

export const TTS_PROVIDERS: Record<BuiltInTTSProviderId, TTSProviderConfig> = {
  'ark-tts': {
    id: 'ark-tts',
    name: '豆包语音合成',
    requiresApiKey: true,
    defaultBaseUrl: ARK_TTS_BASE_URL,
    models: [{ id: ARK_TTS_MODEL_ID, name: ARK_TTS_MODEL_NAME }],
    defaultModelId: ARK_TTS_MODEL_ID,
    voices: ARK_TTS_VOICES,
    supportedFormats: ['mp3', 'pcm', 'ogg_opus'],
    speedRange: {
      min: 0.5,
      max: 2,
      default: 1,
    },
  },
};

export const ASR_PROVIDERS: Record<BuiltInASRProviderId, ASRProviderConfig> = {
  'ark-asr': {
    id: 'ark-asr',
    name: '火山方舟语音识别',
    requiresApiKey: true,
    defaultBaseUrl: ARK_BASE_URL,
    models: [{ id: ARK_ASR_MODEL_ID, name: ARK_LLM_MODEL_NAME }],
    defaultModelId: ARK_ASR_MODEL_ID,
    supportedLanguages: ARK_ASR_LANGUAGES,
    supportedFormats: ['wav'],
  },
};

export const DEFAULT_TTS_VOICES: Record<BuiltInTTSProviderId, string> = {
  'ark-tts': 'zh_female_vv_uranus_bigtts',
};

export const DEFAULT_TTS_MODELS: Record<BuiltInTTSProviderId, string> = {
  'ark-tts': ARK_TTS_MODEL_ID,
};

export function getAllTTSProviders(): TTSProviderConfig[] {
  return Object.values(TTS_PROVIDERS);
}

export function getTTSProvider(providerId: TTSProviderId): TTSProviderConfig | undefined {
  return TTS_PROVIDERS[providerId];
}

export function getTTSVoices(providerId: TTSProviderId): TTSVoiceInfo[] {
  return getTTSProvider(providerId)?.voices || [];
}

export function getAllASRProviders(): ASRProviderConfig[] {
  return Object.values(ASR_PROVIDERS);
}

export function getASRProvider(providerId: ASRProviderId): ASRProviderConfig | undefined {
  return ASR_PROVIDERS[providerId];
}

export function getASRSupportedLanguages(providerId: ASRProviderId): string[] {
  return getASRProvider(providerId)?.supportedLanguages || [];
}
