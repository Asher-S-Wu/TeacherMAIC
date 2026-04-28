import { generateText } from 'ai';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModel } from '@/lib/server/resolve-model';
const log = createLogger('Verify Model');

export async function POST() {
  let model: string | undefined;
  try {
    // Verify the server-configured model.
    let languageModel;
    try {
      const result = await resolveModel({});
      languageModel = result.model;
      model = result.modelString;
    } catch (error) {
      return apiError(
        'INVALID_REQUEST',
        401,
        '当前模型暂时不可用，请稍后再试',
      );
    }

    // Send a minimal test message
    const { text } = await generateText({
      model: languageModel,
      prompt: 'Say "OK" if you can hear me.',
    });

    return apiSuccess({
      message: 'Connection successful',
      response: text,
    });
  } catch (error) {
    log.error(`Model verification failed [model="${model ?? 'unknown'}"]:`, error);

    let errorMessage = 'Connection failed';
    if (error instanceof Error) {
      // Parse common error messages
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = '连接失败，请稍后再试';
      } else if (error.message.includes('404') || error.message.includes('not found')) {
        errorMessage = '当前模型暂时不可用，请稍后再试';
      } else if (error.message.includes('429')) {
        errorMessage = '请求过于频繁，请稍后再试';
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        errorMessage = '连接失败，请稍后再试';
      } else if (error.message.includes('timeout')) {
        errorMessage = '连接超时，请稍后再试';
      } else {
        errorMessage = '连接失败，请稍后再试';
      }
    }

    return apiError('INTERNAL_ERROR', 500, errorMessage);
  }
}
