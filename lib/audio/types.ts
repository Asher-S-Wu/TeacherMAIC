/**
 * Audio Provider Type Definitions
 *
 * TTS uses MiniMax Speech; ASR uses Doubao Speech ASR.
 */

export type BuiltInTTSProviderId = 'minimax-tts';
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
  speedRange?: {
    min: number;
    max: number;
    default: number;
  };
}

export interface TTSModelConfig {
  providerId: TTSProviderId;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  voice: string;
  speed?: number;
  format?: string;
}

export type BuiltInASRProviderId = 'doubao-asr';
export type ASRProviderId = BuiltInASRProviderId;

export interface ASRProviderConfig {
  id: ASRProviderId;
  name: string;
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  icon?: string;
  models: Array<{ id: string; name: string }>;
  defaultModelId: string;
  supportedLanguages: string[];
  supportedFormats: string[];
}

export interface ASRModelConfig {
  providerId: ASRProviderId;
  modelId?: string;
  apiKey?: string;
  resourceId?: string;
  baseUrl?: string;
  language?: string;
}
