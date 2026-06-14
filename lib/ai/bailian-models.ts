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

export const BAILIAN_TTS_MODEL_ID = 'qwen3-tts-flash';
export const BAILIAN_TTS_MODEL_NAME = 'Qwen3 TTS Flash';

export const BAILIAN_ASR_MODEL_ID = 'qwen3-asr-flash';
export const BAILIAN_ASR_MODEL_NAME = 'Qwen3 ASR Flash';
