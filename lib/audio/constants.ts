import type {
  BuiltInTTSProviderId,
  TTSProviderId,
  TTSProviderConfig,
  TTSVoiceInfo,
  BuiltInASRProviderId,
  ASRProviderId,
  ASRProviderConfig,
} from './types';

export const QWEN_TTS_MODEL_ID = 'qwen3-tts-flash';
export const QWEN_ASR_MODEL_ID = 'qwen3-asr-flash';

export const QWEN_ASR_LANGUAGES = [
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
  'cs',
  'da',
  'fi',
  'fil',
  'id',
  'is',
  'ms',
  'no',
  'pl',
  'sv',
  'th',
  'tr',
  'uk',
  'vi',
];

export const QWEN_TTS_VOICES: TTSVoiceInfo[] = [
  { id: 'Cherry', name: '芊悦 (Cherry)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceCherry' },
  { id: 'Serena', name: '苏瑶 (Serena)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceSerena' },
  { id: 'Ethan', name: '晨煦 (Ethan)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceEthan' },
  { id: 'Chelsie', name: '千雪 (Chelsie)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceChelsie' },
  { id: 'Momo', name: '茉兔 (Momo)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceMomo' },
  { id: 'Vivian', name: '十三 (Vivian)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceVivian' },
  { id: 'Moon', name: '月白 (Moon)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceMoon' },
  { id: 'Maia', name: '四月 (Maia)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceMaia' },
  { id: 'Kai', name: '凯 (Kai)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceKai' },
  { id: 'Nofish', name: '不吃鱼 (Nofish)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceNofish' },
  { id: 'Bella', name: '萌宝 (Bella)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceBella' },
  { id: 'Jennifer', name: '詹妮弗 (Jennifer)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceJennifer' },
  { id: 'Ryan', name: '甜茶 (Ryan)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceRyan' },
  { id: 'Katerina', name: '卡捷琳娜 (Katerina)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceKaterina' },
  { id: 'Aiden', name: '艾登 (Aiden)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceAiden' },
  { id: 'Eldric Sage', name: '沧明子 (Eldric Sage)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceEldricSage' },
  { id: 'Mia', name: '乖小妹 (Mia)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceMia' },
  { id: 'Mochi', name: '沙小弥 (Mochi)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceMochi' },
  { id: 'Bellona', name: '燕铮莺 (Bellona)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceBellona' },
  { id: 'Vincent', name: '田叔 (Vincent)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceVincent' },
  { id: 'Bunny', name: '萌小姬 (Bunny)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceBunny' },
  { id: 'Neil', name: '阿闻 (Neil)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceNeil' },
  { id: 'Elias', name: '墨讲师 (Elias)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceElias' },
  { id: 'Arthur', name: '徐大爷 (Arthur)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceArthur' },
  { id: 'Nini', name: '邻家妹妹 (Nini)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceNini' },
  { id: 'Ebona', name: '诡婆婆 (Ebona)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceEbona' },
  { id: 'Seren', name: '小婉 (Seren)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceSeren' },
  { id: 'Pip', name: '顽屁小孩 (Pip)', language: 'zh-CN', gender: 'male', description: 'qwenVoicePip' },
  { id: 'Stella', name: '少女阿月 (Stella)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceStella' },
  { id: 'Bodega', name: '博德加 (Bodega)', language: 'es', gender: 'male', description: 'qwenVoiceBodega' },
  { id: 'Sonrisa', name: '索尼莎 (Sonrisa)', language: 'es', gender: 'female', description: 'qwenVoiceSonrisa' },
  { id: 'Alek', name: '阿列克 (Alek)', language: 'ru', gender: 'male', description: 'qwenVoiceAlek' },
  { id: 'Dolce', name: '多尔切 (Dolce)', language: 'it', gender: 'male', description: 'qwenVoiceDolce' },
  { id: 'Sohee', name: '素熙 (Sohee)', language: 'ko', gender: 'female', description: 'qwenVoiceSohee' },
  { id: 'Ono Anna', name: '小野杏 (Ono Anna)', language: 'ja', gender: 'female', description: 'qwenVoiceOnoAnna' },
  { id: 'Lenn', name: '莱恩 (Lenn)', language: 'de', gender: 'male', description: 'qwenVoiceLenn' },
  { id: 'Emilien', name: '埃米尔安 (Emilien)', language: 'fr', gender: 'male', description: 'qwenVoiceEmilien' },
  { id: 'Andre', name: '安德雷 (Andre)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceAndre' },
  { id: 'Radio Gol', name: '拉迪奥·戈尔 (Radio Gol)', language: 'pt', gender: 'male', description: 'qwenVoiceRadioGol' },
  { id: 'Jada', name: '上海-阿珍 (Jada)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceJada' },
  { id: 'Dylan', name: '北京-晓东 (Dylan)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceDylan' },
  { id: 'Li', name: '南京-老李 (Li)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceLi' },
  { id: 'Marcus', name: '陕西-秦川 (Marcus)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceMarcus' },
  { id: 'Roy', name: '闽南-阿杰 (Roy)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceRoy' },
  { id: 'Peter', name: '天津-李彼得 (Peter)', language: 'zh-CN', gender: 'male', description: 'qwenVoicePeter' },
  { id: 'Sunny', name: '四川-晴儿 (Sunny)', language: 'zh-CN', gender: 'female', description: 'qwenVoiceSunny' },
  { id: 'Eric', name: '四川-程川 (Eric)', language: 'zh-CN', gender: 'male', description: 'qwenVoiceEric' },
  { id: 'Rocky', name: '粤语-阿强 (Rocky)', language: 'zh-HK', gender: 'male', description: 'qwenVoiceRocky' },
  { id: 'Kiki', name: '粤语-阿清 (Kiki)', language: 'zh-HK', gender: 'female', description: 'qwenVoiceKiki' },
];

export const TTS_PROVIDERS: Record<BuiltInTTSProviderId, TTSProviderConfig> = {
  'qwen-tts': {
    id: 'qwen-tts',
    name: 'Qwen TTS (阿里云百炼)',
    requiresApiKey: true,
    defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/api/v1',
    icon: '/logos/bailian.svg',
    models: [{ id: QWEN_TTS_MODEL_ID, name: 'Qwen3 TTS Flash' }],
    defaultModelId: QWEN_TTS_MODEL_ID,
    voices: QWEN_TTS_VOICES,
    supportedFormats: ['mp3', 'wav', 'pcm'],
  },
};

export const ASR_PROVIDERS: Record<BuiltInASRProviderId, ASRProviderConfig> = {
  'qwen-asr': {
    id: 'qwen-asr',
    name: 'Qwen ASR (阿里云百炼)',
    requiresApiKey: true,
    defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/api/v1',
    icon: '/logos/bailian.svg',
    models: [{ id: QWEN_ASR_MODEL_ID, name: 'Qwen3 ASR Flash' }],
    defaultModelId: QWEN_ASR_MODEL_ID,
    supportedLanguages: QWEN_ASR_LANGUAGES,
    supportedFormats: ['mp3', 'wav', 'webm', 'm4a', 'flac'],
  },
};

export const DEFAULT_TTS_VOICES: Record<BuiltInTTSProviderId, string> = {
  'qwen-tts': 'Cherry',
};

export const DEFAULT_TTS_MODELS: Record<BuiltInTTSProviderId, string> = {
  'qwen-tts': QWEN_TTS_MODEL_ID,
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
