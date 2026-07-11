import type {
  BuiltInTTSProviderId,
  TTSProviderConfig,
  TTSVoiceInfo,
} from './types';
import {
  COSYVOICE_TTS_ENDPOINT,
  COSYVOICE_TTS_MODEL_ID,
  COSYVOICE_TTS_MODEL_NAME,
} from '@/lib/ai/cosyvoice-models';

export { COSYVOICE_TTS_MODEL_ID };

function cosyVoice(
  id: string,
  name: string,
  gender: TTSVoiceInfo['gender'],
  description: string,
  language = 'zh',
): TTSVoiceInfo {
  return { id, name, gender, description, language };
}

/** Official cosyvoice-v3-flash system voices currently available in Singapore. */
export const COSYVOICE_TTS_VOICES: TTSVoiceInfo[] = [
  cosyVoice('longanyang', '龙安洋', 'male', '阳光大男孩'),
  cosyVoice('longanhuan', '龙安欢', 'female', '欢脱元气女'),
  cosyVoice('longhuhu_v3', '龙呼呼', 'female', '天真烂漫女童'),
  cosyVoice('longjielidou_v3', '龙杰力豆', 'male', '阳光顽皮男童'),
  cosyVoice('longshanshan_v3', '龙闪闪', 'female', '戏剧化童声'),
  cosyVoice('longniuniu_v3', '龙牛牛', 'male', '阳光男童声'),
  cosyVoice('longanyue_v3', '龙安粤', 'male', '欢脱粤语男', 'yue'),
  cosyVoice('longshange_v3', '龙陕哥', 'male', '原味陕北男'),
  cosyVoice('longanmin_v3', '龙安闽', 'female', '清纯闽南女声', 'nan'),
  cosyVoice('loongandy_v3', 'Loong Andy', 'male', '美式英文男声', 'en'),
  cosyVoice('loongindah_v3', 'Loong Indah', 'female', '印尼女声', 'id'),
  cosyVoice('longyingxiao_v3', '龙应笑', 'female', '清甜推销女'),
  cosyVoice('longyingxun_v3', '龙应询', 'male', '年轻青涩男'),
  cosyVoice('longyingtao_v3', '龙应桃', 'female', '温柔淡定女'),
  cosyVoice('longanyun_v3', '龙安昀', 'male', '居家暖男'),
  cosyVoice('longanwen_v3', '龙安温', 'female', '优雅知性女'),
  cosyVoice('longanli_v3', '龙安莉', 'female', '利落从容女'),
  cosyVoice('longanlang_v3', '龙安朗', 'male', '清爽利落男'),
  cosyVoice('longyingmu_v3', '龙应沐', 'female', '优雅知性女'),
  cosyVoice('longhua_v3', '龙华', 'female', '元气甜美女'),
  cosyVoice('longwan_v3', '龙婉', 'female', '细腻柔声女'),
  cosyVoice('longanzhi_v3', '龙安智', 'male', '睿智轻熟男'),
  cosyVoice('longanya_v3', '龙安雅', 'female', '高雅气质女'),
  cosyVoice('longanqin_v3', '龙安亲', 'female', '亲和活泼女'),
  cosyVoice('longwanjun_v3', '龙婉君', 'female', '细腻柔声女'),
  cosyVoice('longyichen_v3', '龙逸尘', 'male', '洒脱活力男'),
  cosyVoice('longlaobo_v3', '龙老伯', 'male', '沧桑长者男声'),
  cosyVoice('longlaoyi_v3', '龙老姨', 'female', '烟火从容女声'),
  cosyVoice('longjiqi_v3', '龙机器', 'neutral', '呆萌机器人'),
  cosyVoice('longhouge_v3', '龙猴哥', 'male', '经典猴哥'),
  cosyVoice('longdaiyu_v3', '龙黛玉', 'female', '娇率才女音'),
  cosyVoice('longanxuan_v3', '龙安宣', 'female', '经典直播女'),
];

export const TTS_PROVIDERS: Record<BuiltInTTSProviderId, TTSProviderConfig> = {
  'aliyun-cosyvoice-tts': {
    id: 'aliyun-cosyvoice-tts',
    name: '阿里云 CosyVoice 语音合成',
    requiresApiKey: true,
    defaultBaseUrl: COSYVOICE_TTS_ENDPOINT,
    models: [{ id: COSYVOICE_TTS_MODEL_ID, name: COSYVOICE_TTS_MODEL_NAME }],
    defaultModelId: COSYVOICE_TTS_MODEL_ID,
    voices: COSYVOICE_TTS_VOICES,
    supportedFormats: ['mp3'],
  },
};

export const DEFAULT_TTS_VOICES: Record<BuiltInTTSProviderId, string> = {
  'aliyun-cosyvoice-tts': 'longanyang',
};

export const DEFAULT_TTS_MODELS: Record<BuiltInTTSProviderId, string> = {
  'aliyun-cosyvoice-tts': COSYVOICE_TTS_MODEL_ID,
};
