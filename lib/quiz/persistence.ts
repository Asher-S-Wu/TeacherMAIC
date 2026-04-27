import type { QuestionResult } from '@/lib/quiz/grading';

export const DRAFT_KEY_PREFIX = 'quizDraft:';
export const ANSWERS_KEY_PREFIX = 'quizAnswers:';
export const RESULTS_KEY_PREFIX = 'quizResults:';

export const draftKey = (sceneId: string): string => DRAFT_KEY_PREFIX + sceneId;

export type QuizAnswers = Record<string, string | string[]>;

export type SubmittedState =
  | { kind: 'reviewing'; answers: QuizAnswers; results: QuestionResult[] }
  | { kind: 'answering'; answers: QuizAnswers }
  | null;

const memory = new Map<
  string,
  {
    draft?: QuizAnswers;
    answers?: QuizAnswers;
    results?: QuestionResult[];
  }
>();

async function save(sceneId: string, body: Record<string, unknown>): Promise<void> {
  await fetch(`/api/quiz-states/${encodeURIComponent(sceneId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

export async function hydrateSubmittedState(sceneId: string): Promise<SubmittedState> {
  const response = await fetch(`/api/quiz-states/${encodeURIComponent(sceneId)}`);
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const state = data?.state;
  if (!state) return null;
  memory.set(sceneId, {
    draft: state.draft,
    answers: state.answers,
    results: state.results,
  });
  return readSubmittedState(sceneId);
}

export function readSubmittedState(sceneId: string): SubmittedState {
  const state = memory.get(sceneId);
  if (!state?.answers) return null;
  if (state.results?.length) {
    return { kind: 'reviewing', answers: state.answers, results: state.results };
  }
  return { kind: 'answering', answers: state.answers };
}

export function readAnswersForSummary(sceneId: string): QuizAnswers {
  const state = memory.get(sceneId);
  return state?.answers || state?.draft || {};
}

export function writeSubmittedAnswers(sceneId: string, answers: QuizAnswers): void {
  const current = memory.get(sceneId) || {};
  memory.set(sceneId, { ...current, answers });
  void save(sceneId, { answers });
}

export function writeSubmittedResults(sceneId: string, results: QuestionResult[]): void {
  const current = memory.get(sceneId) || {};
  memory.set(sceneId, { ...current, results });
  void save(sceneId, { results });
}

export function writeDraftAnswers(sceneId: string, draft: QuizAnswers): void {
  const current = memory.get(sceneId) || {};
  memory.set(sceneId, { ...current, draft });
  void save(sceneId, { draft });
}

export function clearSubmitted(sceneId: string): void {
  const current = memory.get(sceneId) || {};
  memory.set(sceneId, { draft: current.draft });
  void save(sceneId, { clearSubmitted: true });
}

export function clearAllForScene(sceneId: string): void {
  memory.delete(sceneId);
  void fetch(`/api/quiz-states/${encodeURIComponent(sceneId)}`, { method: 'DELETE' }).catch(() => {});
}
