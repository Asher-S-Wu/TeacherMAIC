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
  MINIMAX_API_BASE_URL,
  MINIMAX_TTS_MODEL_ID,
  MINIMAX_TTS_MODEL_NAME,
} from '@/lib/ai/minimax-models';

export { MINIMAX_TTS_MODEL_ID, MINIMAX_TTS_MODEL_NAME };
export const DOUBAO_ASR_BASE_URL = 'wss://openspeech.bytedance.com/api/v3/sauc';
export const DOUBAO_ASR_MODEL_ID = 'volc.seedasr.sauc.duration';
export const DOUBAO_ASR_MODEL_NAME = '豆包流式语音识别模型 2.0';

export const DOUBAO_ASR_LANGUAGES = [
  'auto',
  'zh-CN',
  'en-US',
  'yue-CN',
  'ja-JP',
  'ko-KR',
  'de-DE',
  'fr-FR',
  'ru-RU',
  'es-MX',
  'pt-BR',
  'ar-SA',
  'it-IT',
  'id-ID',
  'ms-MY',
  'th-TH',
  'tr-TR',
  'vi-VN',
  'fil-PH',
  'bn-BD',
  'el-GR',
  'nl-NL',
  'pl-PL',
  'ro-RO',
  'ne-NP',
  'uk-UA',
];

export const DOUBAO_ASR_LANGUAGE_NAMES: Record<string, string> = {
  auto: '自动识别',
  'zh-CN': '中文普通话',
  'en-US': '英语',
  'yue-CN': '粤语',
  'ja-JP': '日语',
  'ko-KR': '韩语',
  'de-DE': '德语',
  'fr-FR': '法语',
  'ru-RU': '俄语',
  'es-MX': '西班牙语',
  'pt-BR': '葡萄牙语',
  'ar-SA': '阿拉伯语',
  'it-IT': '意大利语',
  'id-ID': '印尼语',
  'ms-MY': '马来语',
  'th-TH': '泰语',
  'tr-TR': '土耳其语',
  'vi-VN': '越南语',
  'fil-PH': '菲律宾语',
  'bn-BD': '孟加拉语',
  'el-GR': '希腊语',
  'nl-NL': '荷兰语',
  'pl-PL': '波兰语',
  'ro-RO': '罗马尼亚语',
  'ne-NP': '尼泊尔语',
  'uk-UA': '乌克兰语',
};

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
  'doubao-asr': {
    id: 'doubao-asr',
    name: '豆包语音识别',
    requiresApiKey: true,
    defaultBaseUrl: DOUBAO_ASR_BASE_URL,
    models: [{ id: DOUBAO_ASR_MODEL_ID, name: DOUBAO_ASR_MODEL_NAME }],
    defaultModelId: DOUBAO_ASR_MODEL_ID,
    supportedLanguages: DOUBAO_ASR_LANGUAGES,
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

export function getASRLanguageName(language: string): string {
  return DOUBAO_ASR_LANGUAGE_NAMES[language] || language;
}
