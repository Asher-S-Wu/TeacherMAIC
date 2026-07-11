import { parseJsonResponse } from '@/lib/generation/json-repair';
import { PROMPT_IDS, buildPrompt } from '@/lib/prompts';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import { createLogger } from '@/lib/logger';

const log = createLogger('SearchQueryBuilder');
const WEB_SEARCH_QUERY_MAX_LENGTH = 350;
const WEB_SEARCH_REPLAN_QUERY_MAX_LENGTH = 320;
const WEB_SEARCH_DECISION_MAX_ATTEMPTS = 5;
export const WEB_SEARCH_MAX_ROUNDS = 5;
export const WEB_SEARCH_QUERY_DIGEST_LIMIT = 1200;

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
}

export interface SearchQueryBuildResult {
  query: string;
  rewriteAttempted: boolean;
  rawRequirementLength: number;
  finalQueryLength: number;
}

function normalizeSearchRequirement(requirement: string): string {
  return requirement.replace(/\s+/g, ' ').trim();
}

function shouldRewriteSearchQuery(normalizedRequirement: string): boolean {
  return Boolean(normalizedRequirement);
}

export async function decideWebSearch(
  requirement: string,
  aiCall: AICallFn,
): Promise<WebSearchDecisionResult> {
  const normalizedRequirement = normalizeSearchRequirement(requirement);
  const prompts = buildPrompt(PROMPT_IDS.WEB_SEARCH_DECISION, {
    requirement: normalizedRequirement,
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
  aiCall?: AICallFn,
): Promise<SearchQueryBuildResult> {
  const normalizedRequirement = normalizeSearchRequirement(requirement);
  const rewriteAttempted = shouldRewriteSearchQuery(normalizedRequirement);

  const baseResult = {
    query: normalizedRequirement,
    rewriteAttempted,
    rawRequirementLength: normalizedRequirement.length,
    finalQueryLength: normalizedRequirement.length,
  } satisfies SearchQueryBuildResult;

  if (!normalizedRequirement || !rewriteAttempted) {
    return baseResult;
  }

  if (!aiCall) {
    throw new Error('联网搜索问题改写模型不可用');
  }

  const prompts = buildPrompt(PROMPT_IDS.WEB_SEARCH_QUERY_REWRITE, {
    requirement: normalizedRequirement,
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

// 多轮检索：根据已搜历史 + 候选池 + 已抓正文 + 缺失方面，规划下一轮关键词
export interface PlanNextSearchQueryParams {
  requirement: string;
  previousQueries: string[];
  candidatesDigest: string;
  scrapedDigest: string;
  missingAspects: string[];
  currentRound: number;
  maxRounds: number;
  aiCall: AICallFn;
}

export interface PlanNextSearchQueryResult {
  query: string;
  // 与历史关键词归一化后重复时为 true，调用方据此决定是否退出循环（不抛错）
  duplicate: boolean;
}

interface PlanNextSearchQueryResponse {
  query: string;
}

function normalizeQueryForCompare(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function formatPreviousQueries(queries: string[]): string {
  if (queries.length === 0) return '(none)';
  return queries.map((q, i) => `${i + 1}. ${q}`).join('\n');
}

function formatMissingAspects(aspects: string[]): string {
  if (aspects.length === 0) return '(none)';
  return aspects.map((a, i) => `${i + 1}. ${a}`).join('\n');
}

export async function planNextSearchQuery(
  params: PlanNextSearchQueryParams,
): Promise<PlanNextSearchQueryResult> {
  const {
    requirement,
    previousQueries,
    candidatesDigest,
    scrapedDigest,
    missingAspects,
    currentRound,
    maxRounds,
    aiCall,
  } = params;

  const normalizedRequirement = normalizeSearchRequirement(requirement);

  const prompts = buildPrompt(PROMPT_IDS.WEB_SEARCH_QUERY_REPLAN, {
    requirement: normalizedRequirement,
    previousQueries: formatPreviousQueries(previousQueries),
    candidatesDigest: candidatesDigest || '(empty)',
    scrapedDigest: scrapedDigest || '(empty)',
    missingAspects: formatMissingAspects(missingAspects),
    currentRound,
    maxRounds,
  });

  if (!prompts) {
    throw new Error('联网搜索关键词改写提示词不存在');
  }

  try {
    const response = await aiCall(prompts.system, prompts.user);
    const parsed = parseJsonResponse<PlanNextSearchQueryResponse>(response);
    const rewrittenQuery = normalizeSearchRequirement(parsed?.query || '').slice(
      0,
      WEB_SEARCH_REPLAN_QUERY_MAX_LENGTH,
    );
    if (!rewrittenQuery) {
      throw new Error('联网搜索关键词改写结果为空');
    }

    // 判定是否与历史关键词归一化后重复，由调用方决定如何处理
    const normalizedNew = normalizeQueryForCompare(rewrittenQuery);
    const duplicate = previousQueries.some(
      (q) => normalizeQueryForCompare(q) === normalizedNew,
    );

    return { query: rewrittenQuery, duplicate };
  } catch (error) {
    log.warn('Next-round query planning failed:', error);
    throw new Error('联网搜索关键词改写失败');
  }
}

// 多轮检索：判定当前已收集的资料是否足以满足需求
export interface AssessSearchSufficiencyParams {
  requirement: string;
  candidatesDigest: string;
  scrapedDigest: string;
  currentRound: number;
  maxRounds: number;
  aiCall: AICallFn;
}

export interface AssessSearchSufficiencyResult {
  sufficient: boolean;
  reason: string;
  missingAspects: string[];
}

interface AssessSearchSufficiencyResponse {
  sufficient: boolean;
  reason?: string;
  missingAspects?: unknown;
}

export async function assessSearchSufficiency(
  params: AssessSearchSufficiencyParams,
): Promise<AssessSearchSufficiencyResult> {
  const {
    requirement,
    candidatesDigest,
    scrapedDigest,
    currentRound,
    maxRounds,
    aiCall,
  } = params;

  const normalizedRequirement = normalizeSearchRequirement(requirement);

  const prompts = buildPrompt(PROMPT_IDS.WEB_SEARCH_SUFFICIENCY, {
    requirement: normalizedRequirement,
    candidatesDigest: candidatesDigest || '(empty)',
    scrapedDigest: scrapedDigest || '(empty)',
    currentRound,
    maxRounds,
  });

  if (!prompts) {
    throw new Error('联网搜索充足性判定提示词不存在');
  }

  try {
    const response = await aiCall(prompts.system, prompts.user);
    const parsed = parseJsonResponse<AssessSearchSufficiencyResponse>(response);

    if (typeof parsed?.sufficient !== 'boolean') {
      throw new Error('联网搜索充足性判定结果格式不正确');
    }

    const rawMissing = Array.isArray(parsed.missingAspects) ? parsed.missingAspects : [];
    const missingAspects = rawMissing
      .map((item) => (typeof item === 'string' ? normalizeSearchRequirement(item) : ''))
      .filter((item): item is string => Boolean(item));

    return {
      sufficient: parsed.sufficient,
      reason: normalizeSearchRequirement(parsed.reason || ''),
      missingAspects,
    };
  } catch (error) {
    log.warn('Sufficiency assessment failed:', error);
    throw new Error('联网搜索充足性判定失败');
  }
}
