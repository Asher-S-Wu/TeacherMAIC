import { nanoid } from 'nanoid';
import { collectStreamLLMText } from '@/lib/ai/llm';
import type { ResponsesModel } from '@/lib/ai/providers';
import { AGENT_COLOR_PALETTE } from '@/lib/constants/agent-defaults';
import { MAX_GENERATION_ATTEMPTS } from '@/lib/generation/retry';
import { createLogger } from '@/lib/logger';

const log = createLogger('AgentProfiles');
const MAX_AGENT_PROFILE_ATTEMPTS = MAX_GENERATION_ATTEMPTS;

export const AGENT_AVATAR_DESCRIPTIONS = [
  { path: '/avatars/teacher.png', desc: 'Friendly male teacher with glasses, blue shirt, warm smile' },
  { path: '/avatars/teacher-2.png', desc: 'Professional female teacher with red hair, confident pose' },
  { path: '/avatars/assist.png', desc: 'Helpful teaching assistant with notebook, approachable' },
  { path: '/avatars/assist-2.png', desc: 'Young assistant with tablet, tech-savvy look' },
  { path: '/avatars/curious.png', desc: 'Curious student with raised hand, eager to learn' },
  { path: '/avatars/curious-2.png', desc: 'Active boy with yellow backpack waving, enthusiastic learner' },
  { path: '/avatars/thinker.png', desc: 'Thoughtful girl with hand on chin, contemplative' },
  { path: '/avatars/thinker-2.png', desc: 'Girl reading a book intently, intellectual and focused' },
  { path: '/avatars/note-taker.png', desc: 'Diligent student taking notes, focused expression' },
  { path: '/avatars/note-taker-2.png', desc: 'Student with laptop and coffee, studious atmosphere' },
] as const;

export type GeneratedAgentProfile = {
  id: string;
  name: string;
  role: string;
  persona: string;
  avatar: string;
  color: string;
  priority: number;
  voiceConfig?: { providerId: string; voiceId: string };
};

type ParsedAgentProfiles = {
  agents: Array<{
    name: string;
    role: string;
    persona: string;
    avatar: string;
    color: string;
    priority: number;
    voice?: string;
  }>;
};

export interface GenerateAgentProfilesInput {
  stageInfo: { name: string; description?: string };
  sceneOutlines?: { title: string; description?: string }[];
  languageDirective: string;
  availableAvatars?: string[];
  avatarDescriptions?: Array<{ path: string; desc: string }>;
  availableVoices?: Array<{ providerId: string; voiceId: string; voiceName: string }>;
}

function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return cleaned.trim();
}

function buildRetryMessages(userPrompt: string, previousResponse: string, reason: string) {
  return [
    { role: 'user' as const, content: userPrompt },
    {
      role: 'assistant' as const,
      content: previousResponse.slice(0, 8000),
    },
    {
      role: 'user' as const,
      content: `The previous response could not be used.

Problem:
${reason}

Regenerate the entire response now. Return ONLY one complete valid JSON object that exactly matches the requested schema. Do not include markdown, comments, trailing commas, or any text outside JSON.`,
    },
  ];
}

function parseAndValidateAgentProfiles(rawText: string): ParsedAgentProfiles {
  const parsed = JSON.parse(rawText) as ParsedAgentProfiles;

  if (!parsed.agents || !Array.isArray(parsed.agents) || parsed.agents.length < 2) {
    throw new Error(`Expected at least 2 agents, got ${parsed.agents?.length ?? 0}`);
  }

  const teacherCount = parsed.agents.filter((a) => a.role === 'teacher').length;
  if (teacherCount !== 1) {
    throw new Error(`Expected exactly 1 teacher, got ${teacherCount}`);
  }

  return parsed;
}

function buildAgentProfilesPrompt(input: GenerateAgentProfilesInput): {
  systemPrompt: string;
  userPrompt: string;
  availableAvatars: string[];
} {
  const {
    stageInfo,
    sceneOutlines,
    languageDirective,
    avatarDescriptions = [...AGENT_AVATAR_DESCRIPTIONS],
    availableVoices,
  } = input;
  const availableAvatars =
    input.availableAvatars ?? avatarDescriptions.map((a) => a.path);

  const sceneSummary = sceneOutlines?.length
    ? sceneOutlines
        .map((s, i) => `${i + 1}. ${s.title}${s.description ? ` — ${s.description}` : ''}`)
        .join('\n')
    : null;

  const systemPrompt =
    'You are an expert instructional designer. Generate agent profiles for a multi-agent classroom simulation. Decide the appropriate number of agents (typically 3-5) based on the course content and complexity. Return ONLY valid JSON, no markdown or explanation.';

  const voiceListStr =
    availableVoices && availableVoices.length > 0
      ? JSON.stringify(
          availableVoices.map((v) => ({
            id: `${v.providerId}::${v.voiceId}`,
            name: v.voiceName,
          })),
        )
      : '';

  const voicePrompt = voiceListStr
    ? `- Each agent should be assigned a voice that matches their persona from this list: ${voiceListStr}
  - Pick a voice that suits the agent's personality and role (e.g. authoritative voice for teacher, lively voice for energetic student)
  - Try to use different voices for each agent`
    : '';

  const voiceJsonField = voiceListStr
    ? ',\n      "voice": "string (voice id from available list, e.g. \'bailian-tts::Cherry\')"'
    : '';

  const userPrompt = `Generate agent profiles for the following course:

Course name: ${stageInfo.name}
${stageInfo.description ? `Course description: ${stageInfo.description}` : ''}
${sceneSummary ? `\nScene outlines:\n${sceneSummary}\n` : ''}
Requirements:
- Decide the appropriate number of agents based on the course content (typically 3-5)
- Exactly 1 agent must have role "teacher", the rest can be "assistant" or "student"
- Priority values: teacher=10 (highest), assistant=7, student=4-6
- Each agent needs: name, role, persona (2-3 sentences describing personality and teaching/learning style)
- Language directive for this course: ${languageDirective}
  Agent names and personas must follow this language directive.
- Each agent must be assigned one avatar from this list: ${JSON.stringify(
    avatarDescriptions.length > 0
      ? avatarDescriptions.map((a) => ({ path: a.path, description: a.desc }))
      : availableAvatars,
  )}
  - Pick an avatar that visually matches the agent's personality and role
  - Try to use different avatars for each agent
  - Use the "path" value as the avatar field in the output
- Each agent must be assigned one color from this list: ${JSON.stringify(AGENT_COLOR_PALETTE)}
  - Each agent must have a different color
${voicePrompt}

Return a JSON object with this exact structure:
{
  "agents": [
    {
      "name": "string",
      "role": "teacher" | "assistant" | "student",
      "persona": "string (2-3 sentences)",
      "avatar": "string (from available list)",
      "color": "string (hex color from palette)",
      "priority": number (10 for teacher, 7 for assistant, 4-6 for student)${voiceJsonField}
    }
  ]
}`;

  return { systemPrompt, userPrompt, availableAvatars };
}

export async function generateAgentProfilesForCourse(
  input: GenerateAgentProfilesInput,
  languageModel: ResponsesModel,
  operation = 'agent-profiles',
): Promise<GeneratedAgentProfile[]> {
  const { systemPrompt, userPrompt, availableAvatars } = buildAgentProfilesPrompt(input);

  let parsed: ParsedAgentProfiles | null = null;
  let lastRawText = '';
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_AGENT_PROFILE_ATTEMPTS; attempt += 1) {
    try {
      const responseText = await collectStreamLLMText(
        {
          model: languageModel,
          system: systemPrompt,
          ...(attempt === 1
            ? { prompt: userPrompt }
            : {
                messages: buildRetryMessages(
                  userPrompt,
                  lastRawText,
                  lastError?.message ?? 'The previous response was invalid JSON.',
                ),
              }),
        },
        operation,
      );

      const rawText = stripCodeFences(responseText);
      lastRawText = rawText;
      parsed = parseAndValidateAgentProfiles(rawText);
      if (attempt > 1) {
        log.info(`Agent profiles JSON fixed after retry ${attempt - 1}`);
      }
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const message = `Agent profiles response invalid (attempt ${attempt}/${MAX_AGENT_PROFILE_ATTEMPTS}): ${lastError.message}`;

      if (attempt < MAX_AGENT_PROFILE_ATTEMPTS) {
        log.warn(message, 'Retrying with correction prompt.');
      } else {
        log.error(message, lastRawText.substring(0, 500));
      }
    }
  }

  if (!parsed) {
    throw new Error(
      `Failed to parse agent profiles from LLM response after ${MAX_AGENT_PROFILE_ATTEMPTS} attempts`,
    );
  }

  return parsed.agents.map((agent, index) => {
    let voiceConfig: { providerId: string; voiceId: string } | undefined;
    if (agent.voice && agent.voice.includes('::')) {
      const [providerId, voiceId] = agent.voice.split('::');
      if (providerId && voiceId) {
        voiceConfig = { providerId, voiceId };
      }
    }

    return {
      id: `gen-${nanoid(8)}`,
      name: agent.name,
      role: agent.role,
      persona: agent.persona,
      avatar: agent.avatar || availableAvatars[index % availableAvatars.length],
      color: agent.color || AGENT_COLOR_PALETTE[index % AGENT_COLOR_PALETTE.length],
      priority:
        agent.priority ?? (agent.role === 'teacher' ? 10 : agent.role === 'assistant' ? 7 : 5),
      ...(voiceConfig ? { voiceConfig } : {}),
    };
  });
}
