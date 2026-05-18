import { parseJsonResponse } from '@/lib/generation/json-repair';
import { PROMPT_IDS, buildPrompt } from '@/lib/prompts';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import { createLogger } from '@/lib/logger';

const log = createLogger('SearchQueryBuilder');
const WEB_SEARCH_QUERY_MAX_LENGTH = 350;
const WEB_SEARCH_DECISION_MAX_ATTEMPTS = 5;
export const SEARCH_QUERY_REWRITE_EXCERPT_LENGTH = 7000;

interface SearchQueryRewriteResponse {
  query: string;
}

interface WebSearchDecisionResponse {
  shouldSearch: boolean;
  reason?: string;
}

export interface WebSearchDecisionResult {
  shouldSearch: boolean;
  reason: string;
  rawRequirementLength: number;
  hasPdfContext: boolean;
}

export interface SearchQueryBuildResult {
  query: string;
  rewriteAttempted: boolean;
  rawRequirementLength: number;
  finalQueryLength: number;
  hasPdfContext: boolean;
}

function normalizeSearchRequirement(requirement: string): string {
  return requirement.replace(/\s+/g, ' ').trim();
}

function normalizePdfExcerpt(pdfText?: string): string {
  if (!pdfText) {
    return '';
  }

  return pdfText.replace(/\s+/g, ' ').trim().slice(0, SEARCH_QUERY_REWRITE_EXCERPT_LENGTH);
}

function shouldRewriteSearchQuery(normalizedRequirement: string): boolean {
  return Boolean(normalizedRequirement);
}

export async function decideWebSearch(
  requirement: string,
  pdfText: string | undefined,
  aiCall: AICallFn,
): Promise<WebSearchDecisionResult> {
  const normalizedRequirement = normalizeSearchRequirement(requirement);
  const pdfExcerpt = normalizePdfExcerpt(pdfText);
  const prompts = buildPrompt(PROMPT_IDS.WEB_SEARCH_DECISION, {
    requirement: normalizedRequirement,
    pdfExcerpt: pdfExcerpt || 'None',
  });

  if (!prompts) {
    throw new Error('联网搜索判断提示词不存在');
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= WEB_SEARCH_DECISION_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await aiCall(prompts.system, prompts.user);
      const parsed = parseJsonResponse<WebSearchDecisionResponse>(response);

      if (typeof parsed?.shouldSearch !== 'boolean') {
        throw new Error('联网搜索判断结果格式不正确');
      }

      return {
        shouldSearch: parsed.shouldSearch,
        reason: normalizeSearchRequirement(parsed.reason || ''),
        rawRequirementLength: normalizedRequirement.length,
        hasPdfContext: Boolean(pdfExcerpt),
      };
    } catch (error) {
      lastError = error;
      log.warn(
        `Web search decision failed (attempt ${attempt}/${WEB_SEARCH_DECISION_MAX_ATTEMPTS}):`,
        error,
      );
    }
  }

  throw new Error('联网搜索智能判断失败', { cause: lastError });
}

export async function buildSearchQuery(
  requirement: string,
  pdfText: string | undefined,
  aiCall?: AICallFn,
): Promise<SearchQueryBuildResult> {
  const normalizedRequirement = normalizeSearchRequirement(requirement);
  const pdfExcerpt = normalizePdfExcerpt(pdfText);
  const hasPdfContext = Boolean(pdfExcerpt);
  const rewriteAttempted = shouldRewriteSearchQuery(normalizedRequirement);

  const baseResult = {
    query: normalizedRequirement,
    rewriteAttempted,
    rawRequirementLength: normalizedRequirement.length,
    finalQueryLength: normalizedRequirement.length,
    hasPdfContext,
  } satisfies SearchQueryBuildResult;

  if (!normalizedRequirement || !rewriteAttempted) {
    return baseResult;
  }

  if (!aiCall) {
    throw new Error('联网搜索问题改写模型不可用');
  }

  const prompts = buildPrompt(PROMPT_IDS.WEB_SEARCH_QUERY_REWRITE, {
    requirement: normalizedRequirement,
    pdfExcerpt: pdfExcerpt || 'None',
  });

  if (!prompts) {
    throw new Error('联网搜索问题改写提示词不存在');
  }

  try {
    const response = await aiCall(prompts.system, prompts.user);
    const parsed = parseJsonResponse<SearchQueryRewriteResponse>(response);
    const rewrittenQuery = normalizeSearchRequirement(parsed?.query || '').slice(
      0,
      WEB_SEARCH_QUERY_MAX_LENGTH,
    );
    if (!rewrittenQuery) {
      throw new Error('联网搜索问题改写结果为空');
    }

    return {
      ...baseResult,
      query: rewrittenQuery,
      finalQueryLength: rewrittenQuery.length,
    };
  } catch (error) {
    log.warn('Query rewrite failed:', error);
    throw new Error('联网搜索问题改写失败');
  }
}
