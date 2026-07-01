/**
 * Audio Provider Type Definitions
 *
 * TTS uses Volcengine Doubao Audio services.
 */

export type BuiltInTTSProviderId = 'volcengine-doubao-tts';
export type TTSProviderId = BuiltInTTSProviderId;

export interface TTSVoiceInfo {
  id: string;
  name: string;
  language: string;
  localeName?: string;
  gender?: 'male' | 'female' | 'neutral';
  description?: string;
  compatibleModels?: string[];
}

export interface TTSProviderConfig {
  id: TTSProviderId;
  name: string;
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  icon?: string;
  models: Array<{ id: string; name: string }>;
  defaultModelId: string;
  voices: TTSVoiceInfo[];
  supportedFormats: string[];
}

export interface TTSModelConfig {
  providerId: TTSProviderId;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  voice: string;
  format?: string;
}
