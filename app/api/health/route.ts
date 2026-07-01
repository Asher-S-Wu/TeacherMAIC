import { apiSuccess } from '@/lib/server/api-response';
import {
  getServerProviders,
  getServerWebSearchProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';

const version = process.env.npm_package_version || '0.1.0';

export async function GET() {
  return apiSuccess({
    status: 'ok',
    version,
    capabilities: {
      llm: Object.keys(getServerProviders()).length > 0,
      webSearch: Object.keys(getServerWebSearchProviders()).length > 0,
      tts: Object.keys(getServerTTSProviders()).length > 0,
    },
  });
}
