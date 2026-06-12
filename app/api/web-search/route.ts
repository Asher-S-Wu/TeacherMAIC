/**
 * Web Search API
 *
 * POST /api/web-search
 * Simple JSON request/response using XCrawl research.
 */

import { NextRequest } from 'next/server';
import { collectStreamLLMText } from '@/lib/ai/llm';
import { resolveWebSearchApiKey } from '@/lib/server/provider-config';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { SEARCH_QUERY_REWRITE_EXCERPT_LENGTH } from '@/lib/server/search-query-builder';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import { runAgentDrivenWebResearch } from '@/lib/server/web-research';

const log = createLogger('WebSearch');

export async function POST(req: NextRequest) {
  let query: string | undefined;
  try {
    const body = await req.json();
    const {
      query: requestQuery,
      pdfText,
    } = body as {
      query?: string;
      pdfText?: string;
    };
    query = requestQuery;

    if (!query || !query.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'query is required');
    }

    const apiKey = resolveWebSearchApiKey();
    if (!apiKey) {
      return apiError(
        'MISSING_API_KEY',
        400,
        '联网搜索暂时不可用，请稍后再试。',
      );
    }

    // Clamp rewrite input at the route boundary; framework body limits still apply to total request size.
    const boundedPdfText = pdfText?.slice(0, SEARCH_QUERY_REWRITE_EXCERPT_LENGTH);

    const { model: languageModel } = await resolveModelFromRequest(req, body);
    const createAiCall = (operation: string): AICallFn => async (systemPrompt, userPrompt) => {
      // 联网搜索仍返回完整 JSON 给前端；内部模型步骤走流式，避免请求头等待超时。
      return collectStreamLLMText(
        {
          model: languageModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        },
        operation,
      );
    };
    log.info('Running XCrawl web research API request', {
      hasPdfContext: Boolean(boundedPdfText),
      rawRequirementLength: query.trim().length,
    });

    const result = await runAgentDrivenWebResearch({
      requirement: query,
      pdfText: boundedPdfText,
      apiKey,
      createAiCall,
    });

    return apiSuccess({
      answer: result.answer,
      sources: result.sources,
      context: result.context,
      query: result.query,
      responseTime: result.responseTime,
      skipped: result.skipped,
      reason: result.reason,
      rounds: result.rounds,
      totalRounds: result.totalRounds,
    });
  } catch (err) {
    log.error(`Web search failed [query="${query?.substring(0, 60) ?? 'unknown'}"]:`, err);
    return apiError('INTERNAL_ERROR', 500, '联网搜索失败，请稍后再试。');
  }
}
