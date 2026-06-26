import type {
  BuiltInTTSProviderId,
  TTSProviderConfig,
  TTSVoiceInfo,
  BuiltInASRProviderId,
  ASRProviderId,
  ASRProviderConfig,
} from './types';
import {
  BAILIAN_ASR_MODEL_ID,
  BAILIAN_ASR_MODEL_NAME,
  BAILIAN_COMPATIBLE_BASE_URL_TEMPLATE,
} from '@/lib/ai/bailian-models';
import {
  DOUBAO_AUDIO_TTS_ENDPOINT,
  DOUBAO_AUDIO_TTS_MODEL_ID,
  DOUBAO_AUDIO_TTS_MODEL_NAME,
} from '@/lib/ai/doubao-audio-models';

export { BAILIAN_ASR_MODEL_ID };
export { DOUBAO_AUDIO_TTS_MODEL_ID };

export const BAILIAN_ASR_LANGUAGES = [
  'auto',
  'zh',
  'en',
  'yue',
  'ja',
  'ko',
  'de',
  'fr',
  'ru',
  'es',
  'pt',
  'ar',
  'it',
  'id',
  'hi',
  'th',
  'tr',
  'uk',
  'vi',
  'cs',
  'da',
  'fil',
  'fi',
  'is',
  'ms',
  'no',
  'pl',
  'sv',
];

export const BAILIAN_ASR_LANGUAGE_NAMES: Record<string, string> = {
  auto: '自动识别',
  zh: '中文普通话',
  en: '英语',
  yue: '粤语',
  ja: '日语',
  ko: '韩语',
  de: '德语',
  fr: '法语',
  ru: '俄语',
  es: '西班牙语',
  pt: '葡萄牙语',
  ar: '阿拉伯语',
  it: '意大利语',
  id: '印尼语',
  hi: '印地语',
  th: '泰语',
  tr: '土耳其语',
  uk: '乌克兰语',
  vi: '越南语',
  cs: '捷克语',
  da: '丹麦语',
  fil: '菲律宾语',
  fi: '芬兰语',
  is: '冰岛语',
  ms: '马来语',
  no: '挪威语',
  pl: '波兰语',
  sv: '瑞典语',
};

function doubaoTTSVoice(
  id: string,
  name: string,
  gender: TTSVoiceInfo['gender'],
  description: string,
  language = 'zh',
): TTSVoiceInfo {
  return { id, name, gender, description, language };
}

export const DOUBAO_TTS_VOICES: TTSVoiceInfo[] = [
  doubaoTTSVoice('zh_female_qingxinnvsheng_mars_bigtts', '清新女声', 'female', '清新自然的中文女声'),
  doubaoTTSVoice('zh_male_qingshuangnansheng_mars_bigtts', '清爽男声', 'male', '清爽自然的中文男声'),
  doubaoTTSVoice('zh_female_wenrounvsheng_mars_bigtts', '温柔女声', 'female', '温柔亲和的中文女声'),
  doubaoTTSVoice('zh_male_wennuanahuang_mars_bigtts', '暖阳男声', 'male', '温暖自然的中文男声'),
  doubaoTTSVoice('zh_female_linjianvhai_mars_bigtts', '邻家女孩', 'female', '亲切活泼的中文女声'),
  doubaoTTSVoice('zh_male_shaonianzixin_mars_bigtts', '少年自信', 'male', '年轻自信的中文男声'),
  doubaoTTSVoice('zh_female_jitangmeimei_mars_bigtts', '鸡汤妹妹', 'female', '积极鼓励的中文女声'),
  doubaoTTSVoice('zh_male_yangguangqingnian_mars_bigtts', '阳光青年', 'male', '阳光开朗的中文男声'),
];

export const TTS_PROVIDERS: Record<BuiltInTTSProviderId, TTSProviderConfig> = {
  'volcengine-doubao-tts': {
    id: 'volcengine-doubao-tts',
    name: '火山豆包语音合成',
    requiresApiKey: true,
    defaultBaseUrl: DOUBAO_AUDIO_TTS_ENDPOINT,
    models: [{ id: DOUBAO_AUDIO_TTS_MODEL_ID, name: DOUBAO_AUDIO_TTS_MODEL_NAME }],
    defaultModelId: DOUBAO_AUDIO_TTS_MODEL_ID,
    voices: DOUBAO_TTS_VOICES,
    supportedFormats: ['mp3'],
  },
};

export const ASR_PROVIDERS: Record<BuiltInASRProviderId, ASRProviderConfig> = {
  'bailian-asr': {
    id: 'bailian-asr',
    name: '百炼语音识别',
    requiresApiKey: true,
    defaultBaseUrl: BAILIAN_COMPATIBLE_BASE_URL_TEMPLATE,
    models: [{ id: BAILIAN_ASR_MODEL_ID, name: BAILIAN_ASR_MODEL_NAME }],
    defaultModelId: BAILIAN_ASR_MODEL_ID,
    supportedLanguages: BAILIAN_ASR_LANGUAGES,
    supportedFormats: ['wav', 'mp3', 'm4a', 'ogg', 'flac'],
  },
};

export const DEFAULT_TTS_VOICES: Record<BuiltInTTSProviderId, string> = {
  'volcengine-doubao-tts': 'zh_female_qingxinnvsheng_mars_bigtts',
};

export const DEFAULT_TTS_MODELS: Record<BuiltInTTSProviderId, string> = {
  'volcengine-doubao-tts': DOUBAO_AUDIO_TTS_MODEL_ID,
};

export function getASRProvider(providerId: ASRProviderId): ASRProviderConfig | undefined {
  return ASR_PROVIDERS[providerId];
}

export function getASRSupportedLanguages(providerId: ASRProviderId): string[] {
  return getASRProvider(providerId)?.supportedLanguages || [];
}

export function getASRLanguageName(language: string): string {
  return BAILIAN_ASR_LANGUAGE_NAMES[language] || language;
}
