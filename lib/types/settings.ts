import type { ProviderId, ModelInfo, ProviderType } from '@/lib/types/provider';

export type SettingsSection =
  | 'general'
  | 'providers'
  | 'agents'
  | 'tts'
  | 'pdf'
  | 'web-search';

/**
 * Unified provider configuration stored in JSON format
 * Stores all provider-specific settings and metadata in one object
 * Built-in providers use this structure.
 */
export interface ProviderSettings {
  // Configuration
  apiKey: string;
  models: ModelInfo[];

  // Metadata
  name: string;
  type: ProviderType;
  defaultBaseUrl?: string;
  icon?: string;
  requiresApiKey: boolean;
  isBuiltIn: boolean;

  // Server-side configuration (set by fetchServerProviders)
  isServerConfigured?: boolean; // Server has API key for this provider
}

/**
 * Provider configurations storage format
 * Key: providerId, Value: ProviderSettings
 */
export type ProvidersConfig = Record<ProviderId, ProviderSettings>;
