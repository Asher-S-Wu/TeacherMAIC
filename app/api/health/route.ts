import { apiSuccess } from '@/lib/server/api-response';
import {
  getServerProviders,
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
  getServerASRProviders,
} from '@/lib/server/provider-config';

const version = process.env.npm_package_version || '0.1.0';

export async function GET() {
  return apiSuccess({
    status: 'ok',
    version,
    capabilities: {
      llm: Object.keys(getServerProviders()).length > 0,
      webSearch: Object.keys(getServerWebSearchProviders()).length > 0,
      imageGeneration: Object.keys(getServerImageProviders()).length > 0,
      videoGeneration: Object.keys(getServerVideoProviders()).length > 0,
      tts: Object.keys(getServerTTSProviders()).length > 0,
      asr: Object.keys(getServerASRProviders()).length > 0,
    },
  });
}
