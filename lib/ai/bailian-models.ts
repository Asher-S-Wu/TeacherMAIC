export const BAILIAN_REGION = 'ap-southeast-1';
export const BAILIAN_BUSINESS_SPACE_ID = 'ws-2t7yj3g991jc5yo6';
export const BAILIAN_COMPATIBLE_BASE_URL_TEMPLATE =
  `https://${BAILIAN_BUSINESS_SPACE_ID}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`;
export const BAILIAN_DASHSCOPE_API_BASE_URL_TEMPLATE =
  `https://${BAILIAN_BUSINESS_SPACE_ID}.ap-southeast-1.maas.aliyuncs.com/api/v1`;

export function buildBailianCompatibleBaseUrl(): string {
  return BAILIAN_COMPATIBLE_BASE_URL_TEMPLATE;
}

export function buildBailianDashScopeApiBaseUrl(): string {
  return BAILIAN_DASHSCOPE_API_BASE_URL_TEMPLATE;
}

export const QWEN_3_7_PLUS_MODEL_ID = 'qwen3.7-plus';
export const QWEN_3_7_PLUS_MODEL_NAME = 'Qwen 3.7 Plus';
export const QWEN_3_7_PLUS_CHAT_PARAMETERS = {
  enable_thinking: true,
  preserve_thinking: true,
  temperature: 0.6,
  top_p: 0.95,
  top_k: 20,
} as const;

export const BAILIAN_IMAGE_MODEL_ID = 'wan2.7-image-pro';
export const BAILIAN_IMAGE_MODEL_NAME = 'Wan2.7 Image Pro';

export const BAILIAN_VIDEO_MODEL_ID = 'happyhorse-1.0-t2v';
export const BAILIAN_VIDEO_MODEL_NAME = 'HappyHorse 1.0 T2V';

export const BAILIAN_TTS_MODEL_ID = 'qwen3-tts-flash';
export const BAILIAN_TTS_MODEL_NAME = 'Qwen3 TTS Flash';

export const BAILIAN_ASR_MODEL_ID = 'qwen3-asr-flash';
export const BAILIAN_ASR_MODEL_NAME = 'Qwen3 ASR Flash';
