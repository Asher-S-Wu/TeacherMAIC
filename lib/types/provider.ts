/**
 * AI Provider Type Definitions
 */

/**
 * Built-in provider IDs
 */
export type BuiltInProviderId = 'zenmux';

/**
 * Provider ID
 */
export type ProviderId = BuiltInProviderId;

/**
 * Provider API types
 */
export type ProviderType =
  | 'openai-responses';

/**
 * Model information
 */
export interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  outputWindow?: number;
  capabilities?: {
    streaming?: boolean;
    tools?: boolean;
    vision?: boolean;
    json?: boolean;
  };
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  id: ProviderId;
  name: string;
  type: ProviderType;
  defaultBaseUrl?: string;
  requiresApiKey: boolean;
  icon?: string;
  models: ModelInfo[];
}

/**
 * Model configuration for API calls
 */
export interface ModelConfig {
  providerId: ProviderId;
  modelId: string;
  apiKey: string;
  baseUrl?: string;
  requiresApiKey?: boolean;
}
