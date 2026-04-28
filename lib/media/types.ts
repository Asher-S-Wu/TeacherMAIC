/**
 * Media (Image & Video) Generation Provider Type Definitions
 *
 * Unified types for image generation and video generation.
 *
 * Currently Supported Image Providers:
 * - Qwen Image (Alibaba Cloud DashScope image generation)
 *
 * Currently Supported Video Providers:
 * - Qwen Video / HappyHorse (Alibaba Cloud DashScope text-to-video)
 *
 */

// ============================================================================
// Image Generation Types
// ============================================================================

/**
 * Image Provider IDs
 *
 * Add new image providers here as union members.
 * Keep in sync with IMAGE_PROVIDERS registry in constants.ts
 */
export type ImageProviderId = 'qwen-image';

/**
 * Image Provider Configuration
 *
 * Describes the capabilities and metadata of an image generation provider.
 * Used to populate UI controls and validate generation requests.
 */
/** Model metadata for an image generation model */
export interface ImageModelInfo {
  /** Model identifier passed to the API */
  id: string;
  /** Human-readable display name */
  name: string;
}

export interface ImageProviderConfig {
  /** Unique provider identifier */
  id: ImageProviderId;
  /** Human-readable provider name */
  name: string;
  /** Whether the provider requires an API key for authentication */
  requiresApiKey: boolean;
  /** Default API base URL (can be overridden in user settings) */
  defaultBaseUrl?: string;
  /** Path to provider icon asset */
  icon?: string;
  /** Available models for this provider */
  models: ImageModelInfo[];
  /** Aspect ratios supported by this provider */
  supportedAspectRatios: Array<'16:9' | '4:3' | '1:1' | '9:16' | '3:4'>;
  /** Optional artistic styles supported by this provider */
  supportedStyles?: string[];
  /** Maximum supported output resolution */
  maxResolution?: {
    width: number;
    height: number;
  };
}

/**
 * Image Generation Configuration
 *
 * Runtime configuration for making image generation API calls.
 * Combines provider selection with authentication credentials.
 */
export interface ImageGenerationConfig {
  /** Which image provider to use */
  providerId: ImageProviderId;
  /** API key for authentication */
  apiKey: string;
  /** Optional override for the provider's base URL */
  baseUrl?: string;
  /** Optional model ID override (uses provider default if omitted) */
  model?: string;
}

/**
 * Image Generation Options
 *
 * Parameters for a single image generation request.
 * Passed alongside ImageGenerationConfig to the provider.
 */
export interface ImageGenerationOptions {
  /** Text prompt describing the desired image */
  prompt: string;
  /** Optional negative prompt to exclude undesired elements */
  negativePrompt?: string;
  /** Desired output width in pixels */
  width?: number;
  /** Desired output height in pixels */
  height?: number;
  /** Desired aspect ratio (provider will calculate dimensions if width/height not set) */
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16' | '3:4';
  /** Optional artistic style (must be supported by the chosen provider) */
  style?: string;
}

/**
 * Image Generation Result
 *
 * The output of a successful image generation request.
 * Contains either a URL or base64-encoded image data (or both).
 */
export interface ImageGenerationResult {
  /** URL to the generated image (if hosted by the provider) */
  url?: string;
  /** Base64-encoded image data (if returned inline) */
  base64?: string;
  /** Width of the generated image in pixels */
  width: number;
  /** Height of the generated image in pixels */
  height: number;
}

// ============================================================================
// Video Generation Types (Phase 2)
// ============================================================================

/**
 * Video Provider IDs
 *
 * Add new video providers here as union members.
 * Keep in sync with VIDEO_PROVIDERS registry in constants.ts
 */
export type VideoProviderId = 'qwen-video';

/**
 * Video Provider Configuration
 *
 * Describes the capabilities and metadata of a video generation provider.
 * Used to populate UI controls and validate generation requests.
 */
/** Model metadata for a video generation model (same shape as image) */
export type VideoModelInfo = ImageModelInfo;

export interface VideoProviderConfig {
  /** Unique provider identifier */
  id: VideoProviderId;
  /** Human-readable provider name */
  name: string;
  /** Whether the provider requires an API key for authentication */
  requiresApiKey: boolean;
  /** Default API base URL (can be overridden in user settings) */
  defaultBaseUrl?: string;
  /** Path to provider icon asset */
  icon?: string;
  /** Available models for this provider */
  models: VideoModelInfo[];
  /** Aspect ratios supported by this provider */
  supportedAspectRatios: Array<'16:9' | '4:3' | '1:1' | '9:16' | '3:4'>;
  /** Supported video durations in seconds */
  supportedDurations?: number[];
  /** Supported output resolutions */
  supportedResolutions?: Array<'720P' | '1080P'>;
  /** Maximum video duration in seconds */
  maxVideoDuration?: number;
}

/**
 * Video Generation Configuration
 *
 * Runtime configuration for making video generation API calls.
 * Combines provider selection with authentication credentials.
 */
export interface VideoGenerationConfig {
  /** Which video provider to use */
  providerId: VideoProviderId;
  /** API key for authentication */
  apiKey: string;
  /** Optional override for the provider's base URL */
  baseUrl?: string;
  /** Optional model ID override (uses provider default if omitted) */
  model?: string;
}

/**
 * Video Generation Options
 *
 * Parameters for a single video generation request.
 * Passed alongside VideoGenerationConfig to the provider.
 */
export interface VideoGenerationOptions {
  /** Text prompt describing the desired video */
  prompt: string;
  /** Desired video duration in seconds */
  duration?: number;
  /** Desired aspect ratio */
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16' | '3:4';
  /** Desired output resolution */
  resolution?: '720P' | '1080P';
}

/**
 * Video Generation Result
 *
 * The output of a successful video generation request.
 * Contains the URL to the generated video along with metadata.
 */
export interface VideoGenerationResult {
  /** URL to the generated video */
  url: string;
  /** Duration of the generated video in seconds */
  duration: number;
  /** Width of the generated video in pixels */
  width: number;
  /** Height of the generated video in pixels */
  height: number;
  /** Optional URL to a poster/thumbnail image for the video */
  poster?: string;
}

// ============================================================================
// Shared / Cross-cutting Types
// ============================================================================

/**
 * Media Generation Request
 *
 * A unified request type used by the whiteboard/canvas to request
 * media generation. Maps to either image or video generation internally.
 */
export interface MediaGenerationRequest {
  /** Type of media to generate */
  type: 'image' | 'video';
  /** Text prompt describing the desired media */
  prompt: string;
  /** Identifier for the target element on the canvas (e.g. "gen_img_1") */
  elementId: string;
  /** Desired aspect ratio */
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16' | '3:4';
  /** Optional artistic style hint */
  style?: string;
}

/**
 * Media Task Adapter
 *
 * Generic interface for providers that use an asynchronous task pattern
 * (submit task, then poll for completion). Many image/video generation
 * APIs are async — this adapter abstracts that pattern.
 *
 * @template TOptions - The generation options type (e.g. ImageGenerationOptions)
 * @template TResult - The generation result type (e.g. ImageGenerationResult)
 */
export interface MediaTaskAdapter<TOptions, TResult> {
  /**
   * Submit a generation task to the provider.
   *
   * @param options - Generation options for the task
   * @returns A task ID that can be used to poll for status
   */
  submitTask(options: TOptions): Promise<string>;

  /**
   * Poll the status of a previously submitted task.
   *
   * @param taskId - The task ID returned by submitTask()
   * @returns The generation result if complete, or null if still processing
   */
  pollTaskStatus(taskId: string): Promise<TResult | null>;
}
