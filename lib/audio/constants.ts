import type {
  BuiltInTTSProviderId,
  TTSProviderConfig,
  TTSVoiceInfo,
  BuiltInASRProviderId,
  ASRProviderId,
  ASRProviderConfig,
} from './types';
import {
  DOUBAO_AUDIO_TTS_ENDPOINT,
  DOUBAO_AUDIO_TTS_MODEL_ID,
  DOUBAO_AUDIO_TTS_MODEL_NAME,
  DOUBAO_AUC_ASR_QUERY_ENDPOINT,
  DOUBAO_AUC_ASR_MODEL_ID,
  DOUBAO_AUC_ASR_MODEL_NAME,
} from '@/lib/ai/doubao-audio-models';

export { DOUBAO_AUDIO_TTS_MODEL_ID, DOUBAO_AUC_ASR_MODEL_ID };

export const DOUBAO_AUC_ASR_LANGUAGES = [
  'auto',
  'zh-CN',
  'en-US',
  'ja-JP',
  'id-ID',
  'es-MX',
  'pt-BR',
  'de-DE',
  'fr-FR',
  'ko-KR',
  'fil-PH',
  'ms-MY',
  'th-TH',
  'ar-SA',
  'it-IT',
  'bn-BD',
  'el-GR',
  'nl-NL',
  'ru-RU',
  'tr-TR',
  'vi-VN',
  'pl-PL',
  'ro-RO',
  'ne-NP',
  'uk-UA',
  'yue-CN',
];

export const DOUBAO_AUC_ASR_LANGUAGE_NAMES: Record<string, string> = {
  auto: '自动识别',
  'zh-CN': '中文普通话',
  'en-US': '英语',
  'ja-JP': '日语',
  'id-ID': '印尼语',
  'es-MX': '西班牙语',
  'pt-BR': '葡萄牙语',
  'de-DE': '德语',
  'fr-FR': '法语',
  'ko-KR': '韩语',
  'fil-PH': '菲律宾语',
  'ms-MY': '马来语',
  'th-TH': '泰语',
  'ar-SA': '阿拉伯语',
  'it-IT': '意大利语',
  'bn-BD': '孟加拉语',
  'el-GR': '希腊语',
  'nl-NL': '荷兰语',
  'ru-RU': '俄语',
  'tr-TR': '土耳其语',
  'vi-VN': '越南语',
  'pl-PL': '波兰语',
  'ro-RO': '罗马尼亚语',
  'ne-NP': '尼泊尔语',
  'uk-UA': '乌克兰语',
  'yue-CN': '粤语',
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
  'volcengine-doubao-auc-asr': {
    id: 'volcengine-doubao-auc-asr',
    name: '火山豆包录音文件识别',
    requiresApiKey: true,
    defaultBaseUrl: DOUBAO_AUC_ASR_QUERY_ENDPOINT,
    models: [{ id: DOUBAO_AUC_ASR_MODEL_ID, name: DOUBAO_AUC_ASR_MODEL_NAME }],
    defaultModelId: DOUBAO_AUC_ASR_MODEL_ID,
    supportedLanguages: DOUBAO_AUC_ASR_LANGUAGES,
    supportedFormats: ['wav', 'mp3', 'ogg'],
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
  return DOUBAO_AUC_ASR_LANGUAGE_NAMES[language] || language;
}
