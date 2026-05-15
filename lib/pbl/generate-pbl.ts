/**
 * PBL Generation using Chat Completions API
 *
 * Core generation engine that designs a complete PBL project as JSON.
 */

import { callLLM } from '@/lib/ai/llm';
import type { ChatCompletionsModel } from '@/lib/ai/providers';
import type { PBLProjectConfig } from './types';
import { buildPBLSystemPrompt } from './pbl-system-prompt';
import type { ThinkingConfig } from '@/lib/types/provider';
import {
  buildStructuredRetryPrompt,
  MAX_GENERATION_ATTEMPTS,
} from '@/lib/generation/retry';

export interface GeneratePBLConfig {
  projectTopic: string;
  projectDescription: string;
  targetSkills: string[];
  issueCount?: number;
  languageDirective: string;
}

export interface GeneratePBLCallbacks {
  onProgress?: (message: string) => void;
}

function parseProjectConfig(text: string, expectedIssueCount: number): PBLProjectConfig {
  const parsed = JSON.parse(text.trim()) as PBLProjectConfig;
  validateProjectConfig(parsed, expectedIssueCount);
  return parsed;
}

function validateProjectConfig(config: PBLProjectConfig, expectedIssueCount: number): void {
  if (!config.projectInfo?.title || !config.projectInfo.description) {
    throw new Error('PBL projectInfo is incomplete');
  }
  if (!Array.isArray(config.agents) || config.agents.length === 0) {
    throw new Error('PBL agents are missing');
  }
  if (
    !config.issueboard ||
    !Array.isArray(config.issueboard.agent_ids) ||
    !Array.isArray(config.issueboard.issues)
  ) {
    throw new Error('PBL issueboard is missing');
  }
  if (!config.chat || !Array.isArray(config.chat.messages)) {
    throw new Error('PBL chat is missing');
  }
  if (config.issueboard.issues.length !== expectedIssueCount) {
    throw new Error(
      `PBL expected ${expectedIssueCount} issues, got ${config.issueboard.issues.length}`,
    );
  }

  const agentByName = new Map(config.agents.map((agent) => [agent.name, agent]));
  const agentNames = new Set(agentByName.keys());
  if (agentNames.size !== config.agents.length) {
    throw new Error('PBL agent names must be unique');
  }
  if (
    !config.agents.some((agent) => !agent.is_system_agent && agent.role_division === 'development')
  ) {
    throw new Error('PBL must include at least one selectable development agent');
  }

  for (const agent of config.agents) {
    if (
      !agent.name ||
      !agent.actor_role ||
      !agent.system_prompt ||
      !agent.default_mode ||
      !agent.env ||
      typeof agent.env !== 'object' ||
      Array.isArray(agent.env) ||
      typeof agent.is_user_role !== 'boolean' ||
      typeof agent.is_active !== 'boolean' ||
      typeof agent.is_system_agent !== 'boolean' ||
      (agent.role_division !== 'management' && agent.role_division !== 'development')
    ) {
      throw new Error(`PBL agent "${agent.name || 'unknown'}" is incomplete`);
    }
  }

  for (const agentId of config.issueboard.agent_ids) {
    if (!agentNames.has(agentId)) {
      throw new Error(`PBL issueboard references unknown agent "${agentId}"`);
    }
  }

  for (const issue of config.issueboard.issues) {
    if (
      !issue.id ||
      !issue.title ||
      !issue.description ||
      !issue.person_in_charge ||
      !Array.isArray(issue.participants) ||
      typeof issue.index !== 'number' ||
      typeof issue.is_done !== 'boolean' ||
      typeof issue.is_active !== 'boolean' ||
      typeof issue.generated_questions !== 'string' ||
      (issue.parent_issue !== null && typeof issue.parent_issue !== 'string')
    ) {
      throw new Error(`PBL issue "${issue.id || 'unknown'}" is incomplete`);
    }
    const owner = agentByName.get(issue.person_in_charge);
    if (!owner || owner.is_system_agent) {
      throw new Error(`PBL issue "${issue.id}" person_in_charge must be a student role agent`);
    }
    const questionAgent = agentByName.get(issue.question_agent_name);
    if (!questionAgent?.is_system_agent) {
      throw new Error(`PBL issue "${issue.id}" question agent is missing or not a system agent`);
    }
    const judgeAgent = agentByName.get(issue.judge_agent_name);
    if (!judgeAgent?.is_system_agent) {
      throw new Error(`PBL issue "${issue.id}" judge agent is missing or not a system agent`);
    }
    const references = [
      issue.person_in_charge,
      issue.question_agent_name,
      issue.judge_agent_name,
      ...(issue.participants || []),
    ];
    for (const name of references) {
      if (!agentNames.has(name)) {
        throw new Error(`PBL issue "${issue.id}" references unknown agent "${name}"`);
      }
    }
    for (const participant of issue.participants || []) {
      if (agentByName.get(participant)?.is_system_agent) {
        throw new Error(`PBL issue "${issue.id}" participant must be a student role agent`);
      }
    }
  }
}

/**
 * Generate a complete PBL project configuration.
 */
export async function generatePBLContent(
  config: GeneratePBLConfig,
  model: ChatCompletionsModel,
  callbacks?: GeneratePBLCallbacks,
  thinkingConfig?: ThinkingConfig,
): Promise<PBLProjectConfig> {
  const { languageDirective } = config;

  callbacks?.onProgress?.('Starting PBL project generation...');

  const systemPrompt = buildPBLSystemPrompt(config);
  const issueCount = config.issueCount ?? 3;

  const baseUserPrompt = `Design a complete PBL project configuration for this course.

Project topic: ${config.projectTopic}
Project description: ${config.projectDescription}
Target skills: ${config.targetSkills.join(', ')}
Issue count: ${issueCount}
Language directive: ${languageDirective}

Return a JSON object with this exact top-level shape:
{
  "projectInfo": { "title": "string", "description": "string" },
  "agents": [
    {
      "name": "string",
      "actor_role": "string",
      "role_division": "development",
      "system_prompt": "string",
      "default_mode": "chat",
      "delay_time": 0,
      "env": { "chat": { "max_tokens": 4096, "system_prompt": "same as system_prompt" } },
      "is_user_role": false,
      "is_active": false,
      "is_system_agent": false
    }
  ],
  "issueboard": {
    "agent_ids": ["agent name"],
    "issues": [
      {
        "id": "issue_1",
        "title": "string",
        "description": "string",
        "person_in_charge": "agent name",
        "participants": ["agent name"],
        "notes": "string",
        "parent_issue": null,
        "index": 0,
        "is_done": false,
        "is_active": false,
        "generated_questions": "",
        "question_agent_name": "agent name",
        "judge_agent_name": "agent name"
      }
    ],
    "current_issue_id": null
  },
  "chat": { "messages": [] },
  "selectedRole": null
}

The role_division value must be either "management" or "development".
Create 2-4 selectable student role agents with is_system_agent false and role_division "development".
For each issue, also create one Question Agent and one Judge Agent in the agents array, both with is_system_agent true.
The issueboard.issues array must contain exactly ${issueCount} issues.
Every person_in_charge, participant, question_agent_name, judge_agent_name, and issueboard.agent_ids entry must match an agent name exactly.
person_in_charge, participants, and issueboard.agent_ids must reference student role agents, not system agents.`;

  let projectConfig: PBLProjectConfig | null = null;
  let lastRawText = '';
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const result = await callLLM(
        {
          model,
          system: `${systemPrompt}

Return ONLY valid JSON. Do not use markdown fences or explanatory text.`,
          prompt:
            attempt === 1
              ? baseUserPrompt
              : buildStructuredRetryPrompt(
                  baseUserPrompt,
                  lastRawText,
                  lastError?.message ?? 'The previous response had an invalid PBL structure.',
                ),
        },
        'pbl-generate',
        undefined,
        thinkingConfig,
      );

      lastRawText = result.text;
      projectConfig = parseProjectConfig(result.text, issueCount);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === MAX_GENERATION_ATTEMPTS) {
        throw new Error(
          `PBL generation failed after ${MAX_GENERATION_ATTEMPTS} attempts: ${lastError.message}`,
        );
      }
    }
  }

  if (!projectConfig) {
    throw new Error(`PBL generation failed after ${MAX_GENERATION_ATTEMPTS} attempts`);
  }

  callbacks?.onProgress?.('PBL structure generated. Running post-processing...');

  // Post-processing: activate first issue and generate initial questions
  await postProcessPBL(projectConfig, model, languageDirective, callbacks, thinkingConfig);

  callbacks?.onProgress?.('PBL project generation complete!');

  return projectConfig;
}

/**
 * Post-processing after the JSON project is generated.
 */
async function postProcessPBL(
  config: PBLProjectConfig,
  model: ChatCompletionsModel,
  languageDirective: string,
  callbacks?: GeneratePBLCallbacks,
  thinkingConfig?: ThinkingConfig,
): Promise<void> {
  const { issueboard, agents } = config;

  if (issueboard.issues.length === 0) {
    return;
  }

  // Sort by index and activate first
  const sortedIssues = [...issueboard.issues].sort((a, b) => a.index - b.index);
  const firstIssue = sortedIssues[0];
  firstIssue.is_active = true;
  issueboard.current_issue_id = firstIssue.id;

  callbacks?.onProgress?.(`Activating first issue: ${firstIssue.title}`);

  // Generate initial questions for the first issue
  const questionAgent = agents.find((a) => a.name === firstIssue.question_agent_name);
  if (!questionAgent) {
    throw new Error(`Question agent "${firstIssue.question_agent_name}" not found`);
  }

  callbacks?.onProgress?.('Generating initial questions for first issue...');

  const context = `## Issue Information

**Title**: ${firstIssue.title}
**Description**: ${firstIssue.description}
**Person in Charge**: ${firstIssue.person_in_charge}
${firstIssue.participants.length > 0 ? `**Participants**: ${firstIssue.participants.join(', ')}` : ''}
${firstIssue.notes ? `**Notes**: ${firstIssue.notes}` : ''}

## Your Task

Generate a welcome message for the student working on this issue. The message should:
1. Start with a friendly greeting introducing yourself as the guiding assistant for this issue (use a natural, localized title — do NOT use the English term "Question Agent" directly in non-English contexts)
2. Present 1-3 specific, actionable guiding questions based on the issue information above, each question should:
   - Guide students toward key learning objectives
   - Be specific and actionable
   - Help break down the problem
   - Encourage critical thinking
3. End by encouraging the student to type \`@question\` anytime for help (keep the literal \`@question\` as-is since it triggers the agent system)

Format the questions as a numbered list.`;

  const questionResult = await callLLM(
    {
      model,
      system: questionAgent.system_prompt,
      prompt: context,
    },
    'pbl-post-process',
    undefined,
    thinkingConfig,
  );

  const generatedQuestions = questionResult.text;
  firstIssue.generated_questions = generatedQuestions;

  config.chat.messages.push({
    id: `msg_welcome_${Date.now()}`,
    agent_name: firstIssue.question_agent_name,
    message: generatedQuestions,
    timestamp: Date.now(),
    read_by: [],
  });

  callbacks?.onProgress?.('Initial questions generated and welcome message added.');
}
