import type {
  BuiltInTTSProviderId,
  TTSProviderConfig,
  TTSVoiceInfo,
} from './types';
import {
  DOUBAO_AUDIO_TTS_ENDPOINT,
  DOUBAO_AUDIO_TTS_MODEL_ID,
  DOUBAO_AUDIO_TTS_MODEL_NAME,
} from '@/lib/ai/doubao-audio-models';

export { DOUBAO_AUDIO_TTS_MODEL_ID };

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

export const DEFAULT_TTS_VOICES: Record<BuiltInTTSProviderId, string> = {
  'volcengine-doubao-tts': 'zh_female_qingxinnvsheng_mars_bigtts',
};

export const DEFAULT_TTS_MODELS: Record<BuiltInTTSProviderId, string> = {
  'volcengine-doubao-tts': DOUBAO_AUDIO_TTS_MODEL_ID,
};
