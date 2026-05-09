/**
 * Web Search API
 *
 * POST /api/web-search
 * Simple JSON request/response using Ark web search.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { searchWithArk, formatSearchResultsAsContext } from '@/lib/web-search/ark';
import { resolveWebSearchApiKey } from '@/lib/server/provider-config';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  buildSearchQuery,
  SEARCH_QUERY_REWRITE_EXCERPT_LENGTH,
} from '@/lib/server/search-query-builder';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import type { AICallFn } from '@/lib/generation/pipeline-types';

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

    const { model: languageModel, thinkingConfig } = await resolveModelFromRequest(req, body);
    const aiCall: AICallFn = async (systemPrompt, userPrompt) => {
      const result = await callLLM(
        {
          model: languageModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          maxOutputTokens: 256,
        },
        'web-search-query-rewrite',
        undefined,
        thinkingConfig,
      );
      return result.text;
    };

    const searchQuery = await buildSearchQuery(query, boundedPdfText, aiCall);

    log.info('Running web search API request', {
      hasPdfContext: searchQuery.hasPdfContext,
      rawRequirementLength: searchQuery.rawRequirementLength,
      rewriteAttempted: searchQuery.rewriteAttempted,
      finalQueryLength: searchQuery.finalQueryLength,
    });

    const result = await searchWithArk({ query: searchQuery.query, apiKey });
    const context = formatSearchResultsAsContext(result);

    return apiSuccess({
      answer: result.answer,
      sources: result.sources,
      context,
      query: result.query,
      responseTime: result.responseTime,
    });
  } catch (err) {
    log.error(`Web search failed [query="${query?.substring(0, 60) ?? 'unknown'}"]:`, err);
    return apiError('INTERNAL_ERROR', 500, '联网搜索失败，请稍后再试。');
  }
}
