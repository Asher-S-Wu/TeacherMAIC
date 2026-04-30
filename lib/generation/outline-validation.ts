import type { SceneOutline } from '@/lib/types/generation';

const SCENE_TYPES = new Set(['slide', 'quiz', 'interactive', 'pbl']);
const QUIZ_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const QUIZ_QUESTION_TYPES = new Set(['single', 'multiple', 'short_answer']);

export function validateSceneOutline(outline: SceneOutline, index: number): SceneOutline {
  const label = `outline[${index}]`;

  if (!outline || typeof outline !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  if (typeof outline.id !== 'string' || outline.id.trim().length === 0) {
    throw new Error(`${label} missing id`);
  }
  if (!SCENE_TYPES.has(outline.type)) {
    throw new Error(`${label} has invalid type`);
  }
  if (typeof outline.title !== 'string' || outline.title.trim().length === 0) {
    throw new Error(`${label} missing title`);
  }
  if (typeof outline.description !== 'string' || outline.description.trim().length === 0) {
    throw new Error(`${label} missing description`);
  }
  if (
    !Array.isArray(outline.keyPoints) ||
    outline.keyPoints.length === 0 ||
    outline.keyPoints.some((point) => typeof point !== 'string' || point.trim().length === 0)
  ) {
    throw new Error(`${label} missing keyPoints`);
  }
  if (typeof outline.order !== 'number' || !Number.isFinite(outline.order)) {
    throw new Error(`${label} missing order`);
  }

  if (outline.type === 'quiz') {
    validateQuizConfig(outline, label);
  }
  if (outline.type === 'interactive') {
    if (!outline.widgetType || !outline.widgetOutline || typeof outline.widgetOutline !== 'object') {
      throw new Error(`${label} missing widgetType or widgetOutline`);
    }
  }
  if (outline.type === 'pbl') {
    validatePBLConfig(outline, label);
  }

  return outline;
}

function validateQuizConfig(outline: SceneOutline, label: string): void {
  const config = outline.quizConfig;
  if (!config) {
    throw new Error(`${label} missing quizConfig`);
  }
  if (
    typeof config.questionCount !== 'number' ||
    !Number.isFinite(config.questionCount) ||
    config.questionCount <= 0
  ) {
    throw new Error(`${label} has invalid quizConfig.questionCount`);
  }
  if (!QUIZ_DIFFICULTIES.has(config.difficulty)) {
    throw new Error(`${label} has invalid quizConfig.difficulty`);
  }
  if (
    !Array.isArray(config.questionTypes) ||
    config.questionTypes.length === 0 ||
    config.questionTypes.some((type) => !QUIZ_QUESTION_TYPES.has(type))
  ) {
    throw new Error(`${label} has invalid quizConfig.questionTypes`);
  }
}

function validatePBLConfig(outline: SceneOutline, label: string): void {
  const config = outline.pblConfig;
  if (!config) {
    throw new Error(`${label} missing pblConfig`);
  }
  if (typeof config.projectTopic !== 'string' || config.projectTopic.trim().length === 0) {
    throw new Error(`${label} missing pblConfig.projectTopic`);
  }
  if (
    typeof config.projectDescription !== 'string' ||
    config.projectDescription.trim().length === 0
  ) {
    throw new Error(`${label} missing pblConfig.projectDescription`);
  }
  if (
    !Array.isArray(config.targetSkills) ||
    config.targetSkills.length === 0 ||
    config.targetSkills.some((skill) => typeof skill !== 'string' || skill.trim().length === 0)
  ) {
    throw new Error(`${label} missing pblConfig.targetSkills`);
  }
  if (
    typeof config.issueCount !== 'number' ||
    !Number.isFinite(config.issueCount) ||
    config.issueCount <= 0
  ) {
    throw new Error(`${label} has invalid pblConfig.issueCount`);
  }
}
