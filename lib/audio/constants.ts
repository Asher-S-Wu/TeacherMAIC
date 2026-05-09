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
const ARK_TTS_BASE_URL = 'https://ai-gateway.vei.volces.com/v1';

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
    id: 'zh_female_kailangjiejie_moon_bigtts',
    name: '开朗姐姐',
    language: 'zh-CN',
    gender: 'female',
    description: 'arkVoiceKailangJiejie',
  },
  {
    id: 'zh_male_jingqiangkanye_moon_bigtts',
    name: '京腔侃爷',
    language: 'zh-CN',
    gender: 'male',
    description: 'arkVoiceJingqiangKanye',
  },
  {
    id: 'zh_female_wanqudashu_moon_bigtts',
    name: '湾区大叔',
    language: 'zh-CN',
    gender: 'male',
    description: 'arkVoiceWanquDashu',
  },
  {
    id: 'BV700_V2_streaming',
    name: '灿灿 2.0',
    language: 'zh-CN',
    gender: 'female',
    description: 'arkVoiceCancan',
  },
  {
    id: 'BV701_V2_streaming',
    name: '擎苍 2.0',
    language: 'zh-CN',
    gender: 'male',
    description: 'arkVoiceQingcang',
  },
];

export const TTS_PROVIDERS: Record<BuiltInTTSProviderId, TTSProviderConfig> = {
  'ark-tts': {
    id: 'ark-tts',
    name: '火山方舟语音合成',
    requiresApiKey: true,
    defaultBaseUrl: ARK_TTS_BASE_URL,
    models: [{ id: ARK_TTS_MODEL_ID, name: ARK_TTS_MODEL_NAME }],
    defaultModelId: ARK_TTS_MODEL_ID,
    voices: ARK_TTS_VOICES,
    supportedFormats: ['mp3', 'wav', 'pcm'],
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
  'ark-tts': 'zh_female_kailangjiejie_moon_bigtts',
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
