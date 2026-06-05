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
} from '@/lib/ai/ark-models';
import {
  MINIMAX_API_BASE_URL,
  MINIMAX_TTS_MODEL_ID,
  MINIMAX_TTS_MODEL_NAME,
} from '@/lib/ai/minimax-models';

export const ARK_ASR_MODEL_ID = ARK_LLM_MODEL_ID;
export { MINIMAX_TTS_MODEL_ID, MINIMAX_TTS_MODEL_NAME };

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

export const MINIMAX_TTS_VOICES: TTSVoiceInfo[] = [
  {
    id: 'Chinese (Mandarin)_Warm_Girl',
    name: '温暖女声',
    language: 'zh-CN',
    gender: 'female',
  },
  {
    id: 'Chinese (Mandarin)_Male_Announcer',
    name: '男播音员',
    language: 'zh-CN',
    gender: 'male',
  },
  {
    id: 'Chinese (Mandarin)_News_Anchor',
    name: '新闻主播',
    language: 'zh-CN',
    gender: 'female',
  },
  {
    id: 'Chinese (Mandarin)_Gentleman',
    name: '绅士男声',
    language: 'zh-CN',
    gender: 'male',
  },
  {
    id: 'Chinese (Mandarin)_Warm_Bestie',
    name: '温暖闺蜜',
    language: 'zh-CN',
    gender: 'female',
  },
  {
    id: 'Chinese (Mandarin)_Cute_Spirit',
    name: '可爱精灵',
    language: 'zh-CN',
    gender: 'female',
  },
  {
    id: 'English_expressive_narrator',
    name: '英文叙述者',
    language: 'en-US',
    gender: 'male',
  },
];

export const TTS_PROVIDERS: Record<BuiltInTTSProviderId, TTSProviderConfig> = {
  'minimax-tts': {
    id: 'minimax-tts',
    name: 'MiniMax 语音合成',
    requiresApiKey: true,
    defaultBaseUrl: MINIMAX_API_BASE_URL,
    models: [{ id: MINIMAX_TTS_MODEL_ID, name: MINIMAX_TTS_MODEL_NAME }],
    defaultModelId: MINIMAX_TTS_MODEL_ID,
    voices: MINIMAX_TTS_VOICES,
    supportedFormats: ['mp3', 'wav', 'flac'],
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
  'minimax-tts': 'Chinese (Mandarin)_Warm_Girl',
};

export const DEFAULT_TTS_MODELS: Record<BuiltInTTSProviderId, string> = {
  'minimax-tts': MINIMAX_TTS_MODEL_ID,
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
