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
  BAILIAN_DASHSCOPE_API_BASE_URL_TEMPLATE,
  BAILIAN_TTS_MODEL_ID,
  BAILIAN_TTS_MODEL_NAME,
} from '@/lib/ai/bailian-models';

export { BAILIAN_ASR_MODEL_ID, BAILIAN_TTS_MODEL_ID };

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

function qwenTTSVoice(
  id: string,
  name: string,
  gender: TTSVoiceInfo['gender'],
  description: string,
  language = 'zh',
): TTSVoiceInfo {
  return { id, name, gender, description, language };
}

export const BAILIAN_TTS_VOICES: TTSVoiceInfo[] = [
  qwenTTSVoice('Cherry', '芊悦', 'female', '阳光积极、亲切自然的女声'),
  qwenTTSVoice('Serena', '苏瑶', 'female', '温柔自然的女声'),
  qwenTTSVoice('Ethan', '晨煦', 'male', '阳光温暖、有朝气的男声'),
  qwenTTSVoice('Chelsie', '千雪', 'female', '活泼的虚拟角色女声'),
  qwenTTSVoice('Momo', '茉兔', 'female', '撒娇搞怪的女声'),
  qwenTTSVoice('Vivian', '十三', 'female', '可爱又带一点小脾气的女声'),
  qwenTTSVoice('Moon', '月白', 'male', '率性帅气的男声'),
  qwenTTSVoice('Maia', '四月', 'female', '知性温柔的女声'),
  qwenTTSVoice('Kai', '凯', 'male', '自然舒服的男声'),
  qwenTTSVoice('Nofish', '不吃鱼', 'male', '不翘舌的设计师男声'),
  qwenTTSVoice('Bella', '萌宝', 'female', '小女孩风格女声'),
  qwenTTSVoice('Jennifer', '詹妮弗', 'female', '电影质感美语女声'),
  qwenTTSVoice('Ryan', '甜茶', 'male', '节奏感强、戏剧感男声'),
  qwenTTSVoice('Katerina', '卡捷琳娜', 'female', '御姐音色女声'),
  qwenTTSVoice('Aiden', '艾登', 'male', '美语大男孩声线'),
  qwenTTSVoice('Eldric Sage', '沧明子', 'male', '沉稳睿智的老者男声'),
  qwenTTSVoice('Mia', '乖小妹', 'female', '温顺乖巧的女声'),
  qwenTTSVoice('Mochi', '沙小弥', 'male', '聪明伶俐的小男孩声线'),
  qwenTTSVoice('Bellona', '燕铮莺', 'female', '声音洪亮、吐字清晰的女声'),
  qwenTTSVoice('Vincent', '田叔', 'male', '沙哑烟嗓男声'),
  qwenTTSVoice('Bunny', '萌小姬', 'female', '萌系小萝莉女声'),
  qwenTTSVoice('Neil', '阿闻', 'male', '专业新闻主持男声'),
  qwenTTSVoice('Elias', '墨讲师', 'female', '适合知识讲解的女声'),
  qwenTTSVoice('Arthur', '徐大爷', 'male', '质朴沉稳的长者男声'),
  qwenTTSVoice('Nini', '邻家妹妹', 'female', '甜美柔软的女声'),
  qwenTTSVoice('Seren', '小婉', 'female', '温和舒缓的女声'),
  qwenTTSVoice('Pip', '顽屁小孩', 'male', '调皮童真的男孩声线'),
  qwenTTSVoice('Stella', '少女阿月', 'female', '少女感女声'),
  qwenTTSVoice('Bodega', '博德加', 'male', '热情的西班牙男声'),
  qwenTTSVoice('Sonrisa', '索尼莎', 'female', '热情开朗的拉美女声'),
  qwenTTSVoice('Alek', '阿列克', 'male', '俄语风格男声'),
  qwenTTSVoice('Dolce', '多尔切', 'male', '意大利风格男声'),
  qwenTTSVoice('Sohee', '素熙', 'female', '韩国风格女声'),
  qwenTTSVoice('Ono Anna', '小野杏', 'female', '日语风格女声'),
  qwenTTSVoice('Lenn', '莱恩', 'male', '德国风格男声'),
  qwenTTSVoice('Emilien', '埃米尔安', 'male', '法国风格男声'),
  qwenTTSVoice('Andre', '安德雷', 'male', '磁性沉稳男声'),
  qwenTTSVoice('Radio Gol', '拉迪奥·戈尔', 'male', '足球解说风格男声'),
  qwenTTSVoice('Jada', '上海-阿珍', 'female', '上海话女声', 'wuu'),
  qwenTTSVoice('Dylan', '北京-晓东', 'male', '北京话男声', 'zh'),
  qwenTTSVoice('Li', '南京-老李', 'male', '南京话男声', 'zh'),
  qwenTTSVoice('Marcus', '陕西-秦川', 'male', '陕西话男声', 'zh'),
  qwenTTSVoice('Roy', '闽南-阿杰', 'male', '闽南语男声', 'nan'),
  qwenTTSVoice('Peter', '天津-李彼得', 'male', '天津话男声', 'zh'),
  qwenTTSVoice('Sunny', '四川-晴儿', 'female', '四川话女声', 'zh'),
  qwenTTSVoice('Eric', '四川-程川', 'male', '四川话男声', 'zh'),
  qwenTTSVoice('Rocky', '粤语-阿强', 'male', '粤语男声', 'yue'),
  qwenTTSVoice('Kiki', '粤语-阿清', 'female', '粤语女声', 'yue'),
];

export const TTS_PROVIDERS: Record<BuiltInTTSProviderId, TTSProviderConfig> = {
  'bailian-tts': {
    id: 'bailian-tts',
    name: '百炼语音合成',
    requiresApiKey: true,
    defaultBaseUrl: BAILIAN_DASHSCOPE_API_BASE_URL_TEMPLATE,
    models: [{ id: BAILIAN_TTS_MODEL_ID, name: BAILIAN_TTS_MODEL_NAME }],
    defaultModelId: BAILIAN_TTS_MODEL_ID,
    voices: BAILIAN_TTS_VOICES,
    supportedFormats: ['wav'],
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
  'bailian-tts': 'Cherry',
};

export const DEFAULT_TTS_MODELS: Record<BuiltInTTSProviderId, string> = {
  'bailian-tts': BAILIAN_TTS_MODEL_ID,
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
