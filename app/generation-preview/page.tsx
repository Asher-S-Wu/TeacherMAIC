'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Sparkles, AlertCircle, AlertTriangle, ArrowLeft, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useStageStore } from '@/lib/store/stage';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useSettingsStore } from '@/lib/store/settings';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { getAvailableProvidersWithVoices } from '@/lib/audio/voice-resolver';
import { splitLongSpeechActions } from '@/lib/audio/tts-utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cleanupOldImages } from '@/lib/utils/image-storage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { nanoid } from 'nanoid';
import type { Stage, Scene } from '@/lib/types/stage';
import type { SceneOutline, PdfImage } from '@/lib/types/generation';
import type { SpeechAction } from '@/lib/types/action';
import { AgentRevealModal } from '@/components/agent/agent-reveal-modal';
import { createLogger } from '@/lib/logger';
import { type GenerationSessionState, ALL_STEPS, getActiveSteps } from './types';
import { StepVisualizer } from './components/visualizers';

const log = createLogger('GenerationPreview');

function GenerationPreviewContent() {
  const router = useRouter();
  const { t } = useI18n();
  const hasStartedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [session, setSession] = useState<GenerationSessionState | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [streamingOutlines, setStreamingOutlines] = useState<SceneOutline[] | null>(null);
  const [truncationWarnings, setTruncationWarnings] = useState<string[]>([]);
  const [webSearchSources, setWebSearchSources] = useState<Array<{ title: string; url: string }>>(
    [],
  );
  const [showAgentReveal, setShowAgentReveal] = useState(false);
  const [generatedAgents, setGeneratedAgents] = useState<
    Array<{
      id: string;
      name: string;
      role: string;
      persona: string;
      avatar: string;
      color: string;
      priority: number;
    }>
  >([]);
  const agentRevealResolveRef = useRef<(() => void) | null>(null);

  // Compute active steps based on session state
  const activeSteps = getActiveSteps(session);

  // Load in-progress generation session from this browser tab
  useEffect(() => {
    cleanupOldImages(24).catch((e) => log.error(e));

    const saved = sessionStorage.getItem('generationSession');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as GenerationSessionState;
        setSession(parsed);
      } catch (e) {
        log.error('Failed to parse generation session:', e);
      }
    }
    setSessionLoaded(true);
  }, []);

  // Abort all in-flight requests on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Get feature toggles from the settings store. Model credentials live on the server.
  const getApiHeaders = () => {
    const settings = useSettingsStore.getState();
    return {
      'Content-Type': 'application/json',
      // Media generation toggles
      'x-image-generation-enabled': String(settings.imageGenerationEnabled ?? false),
      'x-video-generation-enabled': String(settings.videoGenerationEnabled ?? false),
    };
  };

  const withThinkingConfig = <T extends Record<string, unknown>>(body: T) => {
    const { modelString, thinkingConfig } = getCurrentModelConfig();
    return {
      ...body,
      modelString,
      ...(thinkingConfig ? { thinkingConfig } : {}),
    };
  };

  const throwIfAborted = (signal: AbortSignal) => {
    if (signal.aborted) {
      throw new DOMException('Generation aborted', 'AbortError');
    }
  };

  const getEnabledMediaElementIds = (outlines: SceneOutline[]) => {
    const settings = useSettingsStore.getState();
    const ids = new Set<string>();

    for (const outline of outlines) {
      for (const media of outline.mediaGenerations || []) {
        if (media.type === 'image' && !settings.imageGenerationEnabled) continue;
        if (media.type === 'video' && !settings.videoGenerationEnabled) continue;
        ids.add(media.elementId);
      }
    }

    return [...ids];
  };

  const ensureMediaGenerationComplete = (stageId: string, outlines: SceneOutline[]) => {
    const mediaElementIds = getEnabledMediaElementIds(outlines);
    if (mediaElementIds.length === 0) return;

    const tasks = useMediaGenerationStore.getState().tasks;
    const failed = mediaElementIds
      .map((id) => tasks[id])
      .find((task) => task?.stageId === stageId && task.status === 'failed');

    if (failed) {
      log.warn('[GenerationPreview] Media generation failed:', failed.error || failed.elementId);
      throw new Error(t('generation.mediaFailed'));
    }

    const unfinished = mediaElementIds.some((id) => {
      const task = tasks[id];
      return !task || task.stageId !== stageId || task.status !== 'done';
    });

    if (unfinished) {
      throw new Error(t('generation.mediaFailed'));
    }
  };

  const generateTTSForScene = async (scene: Scene, signal: AbortSignal) => {
    const settings = useSettingsStore.getState();
    const providerId = settings.ttsProviderId;
    scene.actions = splitLongSpeechActions(scene.actions || [], providerId);

    const speechActions = scene.actions.filter(
      (action): action is SpeechAction => action.type === 'speech' && !!action.text,
    );
    if (speechActions.length === 0) return;

    for (const action of speechActions) {
      throwIfAborted(signal);

      const audioId = `tts_s${scene.order}_${action.id}`;
      action.audioId = audioId;

      try {
        const resp = await fetch('/api/generate/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: action.text,
            audioId,
            ttsVoice: settings.ttsVoice,
            ttsSpeed: settings.ttsSpeed,
          }),
          signal,
        });

        if (!resp.ok) {
          throw new Error(t('generation.speechFailed'));
        }

        const ttsData = await resp.json();
        if (!ttsData.success || !ttsData.file?.url) {
          throw new Error(t('generation.speechFailed'));
        }

        action.audioUrl = ttsData.file.url;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
        log.warn(`[TTS] Failed for ${audioId}:`, err);
        throw new Error(t('generation.speechFailed'));
      }
    }
  };

  // Auto-start generation when session is loaded
  useEffect(() => {
    if (session && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Main generation flow
  const startGeneration = async () => {
    if (!session) return;

    // Create AbortController for this generation run
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    // Use a local mutable copy so we can update it after PDF parsing
    let currentSession = session;
    let generatedStageId: string | null = null;

    setError(null);
    setIsComplete(false);
    setStatusMessage('');
    setCurrentStepIndex(0);
    sessionStorage.removeItem('generationParams');

    try {
      // Compute active steps for this session (recomputed after session mutations)
      let activeSteps = getActiveSteps(currentSession);

      // Determine if we need the PDF analysis step
      const hasPdfToAnalyze = !!currentSession.pdfStorageKey && !currentSession.pdfText;
      // If no PDF to analyze, skip to the next available step
      if (!hasPdfToAnalyze) {
        const firstNonPdfIdx = activeSteps.findIndex((s) => s.id !== 'pdf-analysis');
        setCurrentStepIndex(Math.max(0, firstNonPdfIdx));
      }

      // Step 0: Parse PDF if needed
      if (hasPdfToAnalyze) {
        log.debug('=== Generation Preview: Parsing PDF ===');
        const parseResponse = await fetch('/api/parse-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: currentSession.pdfStorageKey }),
          signal,
        });

        if (!parseResponse.ok) {
          const errorData = await parseResponse.json();
          throw new Error(errorData.error || t('generation.pdfParseFailed'));
        }

        const parseResult = await parseResponse.json();
        if (!parseResult.success || !parseResult.data) {
          throw new Error(t('generation.pdfParseFailed'));
        }

        let pdfText = parseResult.data.text as string;

        // Truncate if needed
        if (pdfText.length > MAX_PDF_CONTENT_CHARS) {
          pdfText = pdfText.substring(0, MAX_PDF_CONTENT_CHARS);
        }

        const rawPdfImages = parseResult.data.metadata?.pdfImages;
        const parsedPdfImages: PdfImage[] = rawPdfImages
          ? rawPdfImages.map(
              (img: {
                id: string;
                pageNumber?: number;
                description?: string;
                width?: number;
                height?: number;
                storageId?: string;
              }) => ({
                id: img.id,
                src: '',
                pageNumber: img.pageNumber || 1,
                description: img.description,
                width: img.width,
                height: img.height,
                storageId: img.storageId,
              }),
            )
          : [];
        const pdfImages: PdfImage[] = [
          ...(currentSession.pdfImages || []),
          ...parsedPdfImages,
        ];

        // Update session with parsed PDF data
        const updatedSession = {
          ...currentSession,
          pdfText,
          pdfImages,
          imageStorageIds: pdfImages.map((img) => img.storageId).filter(Boolean) as string[],
          pdfStorageKey: undefined, // Clear so we don't re-parse
        };
        setSession(updatedSession);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSession));

        // Truncation warnings
        const warnings: string[] = [];
        const originalTextLength =
          Number(parseResult.data.metadata?.originalTextLength) ||
          (parseResult.data.text as string).length;
        if (originalTextLength > MAX_PDF_CONTENT_CHARS) {
          warnings.push(t('generation.textTruncated', { n: MAX_PDF_CONTENT_CHARS }));
        }
        if (pdfImages.length > MAX_VISION_IMAGES) {
          warnings.push(
            t('generation.imageTruncated', { total: pdfImages.length, max: MAX_VISION_IMAGES }),
          );
        }
        if (warnings.length > 0) {
          setTruncationWarnings(warnings);
        }

        // Reassign local reference for subsequent steps
        currentSession = updatedSession;
        activeSteps = getActiveSteps(currentSession);
      }

      // Step: Web Search (if enabled)
      const webSearchStepIdx = activeSteps.findIndex((s) => s.id === 'web-search');
      if (currentSession.requirements.webSearch && webSearchStepIdx >= 0) {
        setCurrentStepIndex(webSearchStepIdx);
        setWebSearchSources([]);

        const res = await fetch('/api/web-search', {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify(
            withThinkingConfig({
              query: currentSession.requirements.requirement,
              pdfText: currentSession.pdfText || undefined,
            }),
          ),
          signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Web search failed' }));
          throw new Error(data.error || t('generation.webSearchFailed'));
        }

        const searchData = await res.json();
        const sources = (searchData.sources || []).map((s: { title: string; url: string }) => ({
          title: s.title,
          url: s.url,
        }));
        setWebSearchSources(sources);

        const updatedSessionWithSearch = {
          ...currentSession,
          researchContext: searchData.context || '',
          researchSources: sources,
        };
        setSession(updatedSessionWithSearch);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSessionWithSearch));
        currentSession = updatedSessionWithSearch;
        activeSteps = getActiveSteps(currentSession);
      }

      // Create stage client-side
      const stageId = nanoid(10);
      const stage: Stage = {
        id: stageId,
        name: extractTopicFromRequirement(currentSession.requirements.requirement),
        description: '',
        style: 'professional',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        interactiveMode: true,
      };
      generatedStageId = stage.id;

      // ── Generate outlines first (infers languageDirective) ──
      let outlines = currentSession.sceneOutlines;
      let languageDirective: string | undefined;

      const outlineStepIdx = activeSteps.findIndex((s) => s.id === 'outline');
      setCurrentStepIndex(outlineStepIdx >= 0 ? outlineStepIdx : 0);
      if (!outlines || outlines.length === 0) {
        log.debug('=== Generating outlines (SSE) ===');
        setStreamingOutlines([]);

        const outlineResult = await new Promise<{
          outlines: SceneOutline[];
          languageDirective: string;
        }>((resolve, reject) => {
          const collected: SceneOutline[] = [];
          let directive: string | undefined;

          fetch('/api/generate/scene-outlines-stream', {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify(
              withThinkingConfig({
                requirements: currentSession.requirements,
                pdfText: currentSession.pdfText,
                pdfImages: currentSession.pdfImages,
                researchContext: currentSession.researchContext,
              }),
            ),
            signal,
          })
            .then((res) => {
              if (!res.ok) {
                return res.json().then((d) => {
                  reject(new Error(d.error || t('generation.outlineGenerateFailed')));
                });
              }

              const reader = res.body?.getReader();
              if (!reader) {
                reject(new Error(t('generation.streamNotReadable')));
                return;
              }

              const decoder = new TextDecoder();
              let sseBuffer = '';

              const pump = (): Promise<void> =>
                reader.read().then(({ done, value }) => {
                  if (value) {
                    sseBuffer += decoder.decode(value, { stream: !done });
                    const lines = sseBuffer.split('\n');
                    sseBuffer = lines.pop() || '';

                    for (const line of lines) {
                      if (!line.startsWith('data: ')) continue;
                      try {
                        const evt = JSON.parse(line.slice(6));
                        if (evt.type === 'languageDirective') {
                          directive = evt.data;
                        } else if (evt.type === 'outline') {
                          collected.push(evt.data);
                          setStreamingOutlines([...collected]);
                        } else if (evt.type === 'retry') {
                          collected.length = 0;
                          setStreamingOutlines([]);
                          setStatusMessage(t('generation.outlineRetrying'));
                        } else if (evt.type === 'done') {
                          directive = evt.languageDirective || directive;
                          resolve({
                            outlines: evt.outlines || collected,
                            languageDirective:
                              directive ||
                              'Teach in the language that matches the user requirement.',
                          });
                          return;
                        } else if (evt.type === 'error') {
                          reject(new Error(evt.error));
                          return;
                        }
                      } catch (e) {
                        log.error('Failed to parse outline SSE:', line, e);
                      }
                    }
                  }
                  if (done) {
                    if (collected.length > 0) {
                      resolve({
                        outlines: collected,
                        languageDirective:
                          directive || 'Teach in the language that matches the user requirement.',
                      });
                    } else {
                      reject(new Error(t('generation.outlineEmptyResponse')));
                    }
                    return;
                  }
                  return pump();
                });

              pump().catch(reject);
            })
            .catch(reject);
        });

        outlines = outlineResult.outlines;
        languageDirective = outlineResult.languageDirective;

        // Store languageDirective on the stage
        stage.languageDirective = languageDirective;

        const updatedSession = {
          ...currentSession,
          sceneOutlines: outlines,
          languageDirective,
        };
        setSession(updatedSession);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSession));

        // Brief pause to let user see the final outline state
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      // ── Agent generation (after outlines — uses languageDirective + outlines) ──
      const settings = useSettingsStore.getState();
      let agents: Array<{
        id: string;
        name: string;
        role: string;
        persona?: string;
      }> = [];

      if (settings.agentMode === 'auto') {
        const agentStepIdx = activeSteps.findIndex((s) => s.id === 'agent-generation');
        if (agentStepIdx >= 0) setCurrentStepIndex(agentStepIdx);

        try {
          const allAvatars = [
            {
              path: '/avatars/teacher.png',
              desc: 'Male teacher with glasses, holding a book, green background',
            },
            {
              path: '/avatars/teacher-2.png',
              desc: 'Female teacher with long dark hair, blue traditional outfit, gentle expression',
            },
            {
              path: '/avatars/assist.png',
              desc: 'Young female assistant with glasses, pink background, friendly smile',
            },
            {
              path: '/avatars/assist-2.png',
              desc: 'Young female in orange top and purple overalls, cheerful and approachable',
            },
            {
              path: '/avatars/clown.png',
              desc: 'Energetic girl with glasses pointing up, green shirt, lively and fun',
            },
            {
              path: '/avatars/clown-2.png',
              desc: 'Playful girl with curly hair doing rock gesture, blue shirt, humorous vibe',
            },
            {
              path: '/avatars/curious.png',
              desc: 'Surprised boy with glasses, hand on cheek, curious expression',
            },
            {
              path: '/avatars/curious-2.png',
              desc: 'Boy with backpack holding a book and question mark bubble, inquisitive',
            },
            {
              path: '/avatars/note-taker.png',
              desc: 'Studious boy with glasses, blue shirt, calm and organized',
            },
            {
              path: '/avatars/note-taker-2.png',
              desc: 'Active boy with yellow backpack waving, blue outfit, enthusiastic learner',
            },
            {
              path: '/avatars/thinker.png',
              desc: 'Thoughtful girl with hand on chin, purple background, contemplative',
            },
            {
              path: '/avatars/thinker-2.png',
              desc: 'Girl reading a book intently, long dark hair, intellectual and focused',
            },
          ];

          const getAvailableVoicesForGeneration = () => {
            const providers = getAvailableProvidersWithVoices(settings.ttsProvidersConfig);
            return providers.flatMap((p) =>
              p.voices.map((v) => ({
                providerId: p.providerId,
                voiceId: v.id,
                voiceName: v.name,
              })),
            );
          };

          const agentResp = await fetch('/api/generate/agent-profiles', {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify(
              withThinkingConfig({
                stageInfo: { name: stage.name, description: stage.description },
                sceneOutlines: outlines.map((o) => ({
                  title: o.title,
                  description: o.description,
                })),
                languageDirective,
                availableAvatars: allAvatars.map((a) => a.path),
                avatarDescriptions: allAvatars.map((a) => ({ path: a.path, desc: a.desc })),
                availableVoices: getAvailableVoicesForGeneration(),
              }),
            ),
            signal,
          });

          if (!agentResp.ok) throw new Error('Agent generation failed');
          const agentData = await agentResp.json();
          if (!agentData.success) throw new Error(agentData.error || 'Agent generation failed');

          // Save to the runtime registry; the classroom stores the generated configs
          const { saveGeneratedAgents } = await import('@/lib/orchestration/registry/store');
          const savedIds = await saveGeneratedAgents(stage.id, agentData.agents);
          settings.setSelectedAgentIds(savedIds);
          stage.agentIds = savedIds;
          stage.generatedAgentConfigs = agentData.agents;

          // Show card-reveal modal, continue generation once all cards are revealed
          setGeneratedAgents(agentData.agents);
          setShowAgentReveal(true);
          await new Promise<void>((resolve) => {
            agentRevealResolveRef.current = resolve;
          });

          agents = savedIds
            .map((id) => useAgentRegistry.getState().getAgent(id))
            .filter(Boolean)
            .map((a) => ({
              id: a!.id,
              name: a!.name,
              role: a!.role,
              persona: a!.persona,
            }));
        } catch (err: unknown) {
          log.error('[Generation] Agent generation failed:', err);
          throw err instanceof Error ? err : new Error('Agent generation failed');
        }
      } else {
        // Preset mode — use selected agents (include persona)
        // Filter out stale generated agent IDs that may linger in settings
        const registry = useAgentRegistry.getState();
        const presetAgentIds = settings.selectedAgentIds.filter((id) => {
          const a = registry.getAgent(id);
          return a && !a.isGenerated;
        });
        agents = presetAgentIds
          .map((id) => registry.getAgent(id))
          .filter(Boolean)
          .map((a) => ({
            id: a!.id,
            name: a!.name,
            role: a!.role,
            persona: a!.persona,
          }));
        stage.agentIds = presetAgentIds;
      }

      // Move to full scene generation step
      setStatusMessage('');
      if (!outlines || outlines.length === 0) {
        throw new Error(t('generation.outlineEmptyResponse'));
      }

      const store = useStageStore.getState();
      store.setAutoSaveSuspended(true);
      useMediaGenerationStore.setState({ tasks: {} });
      store.setStage(stage);
      store.setOutlines(outlines);
      store.setGeneratingOutlines(outlines);
      store.setGenerationStatus('generating');

      const contentStepIdx = activeSteps.findIndex((s) => s.id === 'slide-content');
      const actionsStepIdx = activeSteps.findIndex((s) => s.id === 'actions');
      const totalPages = outlines.length;

      const stageInfo = {
        name: stage.name,
        description: stage.description,
        style: stage.style,
      };

      const userProfile =
        currentSession.requirements.userNickname || currentSession.requirements.userBio
          ? `Student: ${currentSession.requirements.userNickname || 'Unknown'}${currentSession.requirements.userBio ? ` — ${currentSession.requirements.userBio}` : ''}`
          : undefined;

      let previousSpeeches: string[] = [];

      for (const [index, outline] of outlines.entries()) {
        const currentPage = index + 1;
        throwIfAborted(signal);

        store.setCurrentGeneratingOrder(outline.order);
        if (contentStepIdx >= 0) setCurrentStepIndex(contentStepIdx);
        setStatusMessage(
          t('generation.generatingPageContent', { current: currentPage, total: totalPages }),
        );

        const contentResp = await fetch('/api/generate/scene-content', {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify(
            withThinkingConfig({
              outline,
              allOutlines: outlines,
              pdfImages: currentSession.pdfImages,
              stageInfo,
              stageId: stage.id,
              agents,
              languageDirective,
            }),
          ),
          signal,
        });

        if (!contentResp.ok) {
          const errorData = await contentResp.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(errorData.error || t('generation.sceneGenerateFailed'));
        }

        const contentData = await contentResp.json();
        if (!contentData.success || !contentData.content) {
          throw new Error(contentData.error || t('generation.sceneGenerateFailed'));
        }

        throwIfAborted(signal);
        if (actionsStepIdx >= 0) setCurrentStepIndex(actionsStepIdx);
        setStatusMessage(
          t('generation.generatingPageActions', { current: currentPage, total: totalPages }),
        );

        const actionsResp = await fetch('/api/generate/scene-actions', {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify(
            withThinkingConfig({
              outline: contentData.effectiveOutline || outline,
              allOutlines: outlines,
              content: contentData.content,
              stageId: stage.id,
              agents,
              previousSpeeches,
              userProfile,
              languageDirective,
            }),
          ),
          signal,
        });

        if (!actionsResp.ok) {
          const errorData = await actionsResp.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(errorData.error || t('generation.sceneGenerateFailed'));
        }

        const data = await actionsResp.json();
        if (!data.success || !data.scene) {
          throw new Error(data.error || t('generation.sceneGenerateFailed'));
        }

        const scene = data.scene as Scene;
        if (settings.ttsEnabled) {
          setStatusMessage(
            t('generation.generatingPageSpeech', { current: currentPage, total: totalPages }),
          );
          await generateTTSForScene(scene, signal);
        }

        throwIfAborted(signal);
        store.addScene(scene);
        previousSpeeches = data.previousSpeeches || [];
      }

      throwIfAborted(signal);
      const mediaElementIds = getEnabledMediaElementIds(outlines);
      if (mediaElementIds.length > 0) {
        if (actionsStepIdx >= 0) setCurrentStepIndex(actionsStepIdx);
        setStatusMessage(t('generation.generatingMedia'));
        await generateMediaForOutlines(outlines, stage.id, signal);
        throwIfAborted(signal);
        ensureMediaGenerationComplete(stage.id, outlines);
      }

      const generatedScenes = [...useStageStore.getState().scenes].sort(
        (a, b) => a.order - b.order,
      );
      if (generatedScenes.length !== outlines.length) {
        throw new Error(t('generation.sceneGenerateFailed'));
      }

      store.setScenes(generatedScenes);
      store.setCurrentSceneId(generatedScenes[0]?.id ?? null);
      store.setGeneratingOutlines([]);
      store.setGenerationStatus('completed');
      setStatusMessage(t('generation.courseGenerated'));
      setIsComplete(true);

      sessionStorage.removeItem('generationParams');
      sessionStorage.removeItem('generationSession');
      store.setAutoSaveSuspended(false);
      await store.saveToStorage();
      await new Promise((resolve) => setTimeout(resolve, 600));
      router.push(`/classroom/${stage.id}`);
    } catch (err) {
      const store = useStageStore.getState();
      store.setAutoSaveSuspended(false);
      if (generatedStageId && store.stage?.id === generatedStageId) {
        store.clearStore();
      }
      // AbortError is expected when navigating away — don't show as error
      if (err instanceof DOMException && err.name === 'AbortError') {
        log.info('[GenerationPreview] Generation aborted');
        return;
      }
      sessionStorage.removeItem('generationParams');
      sessionStorage.removeItem('generationSession');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const extractTopicFromRequirement = (requirement: string): string => {
    const trimmed = requirement.trim();
    if (trimmed.length <= 500) {
      return trimmed;
    }
    return trimmed.substring(0, 500).trim() + '...';
  };

  const goBackToHome = () => {
    abortControllerRef.current?.abort();
    sessionStorage.removeItem('generationSession');
    router.push('/');
  };

  // Still loading session from sessionStorage
  if (!sessionLoaded) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground">
          <div className="size-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // No session found
  if (!session) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full">
          <div className="text-center space-y-4">
            <AlertCircle className="size-12 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-semibold">{t('generation.sessionNotFound')}</h2>
            <p className="text-sm text-muted-foreground">{t('generation.sessionNotFoundDesc')}</p>
            <Button onClick={() => router.push('/')} className="w-full">
              <ArrowLeft className="size-4 mr-2" />
              {t('generation.backToHome')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const activeStep =
    activeSteps.length > 0
      ? activeSteps[Math.min(currentStepIndex, activeSteps.length - 1)]
      : ALL_STEPS[0];

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden text-center">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>

      {/* Back button */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-4 left-4 z-20"
      >
        <Button variant="ghost" size="sm" onClick={goBackToHome}>
          <ArrowLeft className="size-4 mr-2" />
          {t('generation.backToHome')}
        </Button>
      </motion.div>

      <div className="z-10 w-full max-w-lg space-y-8 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          <Card className="relative overflow-hidden border-muted/40 shadow-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl min-h-[400px] flex flex-col items-center justify-center p-8 md:p-12">
            {/* Progress Dots */}
            <div className="absolute top-6 left-0 right-0 flex justify-center gap-2">
              {activeSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-500',
                    idx < currentStepIndex
                      ? 'w-1.5 bg-blue-500/30'
                      : idx === currentStepIndex
                        ? 'w-8 bg-blue-500'
                        : 'w-1.5 bg-muted/50',
                  )}
                />
              ))}
            </div>

            {/* Central Content */}
            <div className="flex-1 flex flex-col items-center justify-center w-full space-y-8 mt-4">
              {/* Icon / Visualizer Container */}
              <div className="relative size-48 flex items-center justify-center">
                <AnimatePresence mode="popLayout">
                  {error ? (
                    <motion.div
                      key="error"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-red-500/10 flex items-center justify-center border-2 border-red-500/20"
                    >
                      <AlertCircle className="size-16 text-red-500" />
                    </motion.div>
                  ) : isComplete ? (
                    <motion.div
                      key="complete"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-green-500/10 flex items-center justify-center border-2 border-green-500/20"
                    >
                      <CheckCircle2 className="size-16 text-green-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key={activeStep.id}
                      initial={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
                      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                      exit={{ scale: 1.2, opacity: 0, filter: 'blur(10px)' }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <StepVisualizer
                        stepId={activeStep.id}
                        outlines={streamingOutlines}
                        webSearchSources={webSearchSources}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Text Content */}
              <div className="space-y-3 max-w-sm mx-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={error ? 'error' : isComplete ? 'done' : activeStep.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-2"
                  >
                    <h2 className="text-2xl font-bold tracking-tight">
                      {error
                        ? t('generation.generationFailed')
                        : isComplete
                          ? t('generation.generationComplete')
                          : t(activeStep.title)}
                    </h2>
                    <p className="text-muted-foreground text-base">
                      {error
                        ? error
                        : isComplete
                          ? statusMessage || t('generation.classroomReady')
                          : statusMessage || t(activeStep.description)}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* Truncation warning indicator */}
                <AnimatePresence>
                  {truncationWarnings.length > 0 && !error && !isComplete && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 30,
                      }}
                      className="flex justify-center"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.button
                            type="button"
                            animate={{
                              boxShadow: [
                                '0 0 0 0 rgba(251, 191, 36, 0), 0 0 0 0 rgba(251, 191, 36, 0)',
                                '0 0 16px 4px rgba(251, 191, 36, 0.12), 0 0 4px 1px rgba(251, 191, 36, 0.08)',
                                '0 0 0 0 rgba(251, 191, 36, 0), 0 0 0 0 rgba(251, 191, 36, 0)',
                              ],
                            }}
                            transition={{
                              duration: 3,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }}
                            className="relative size-7 rounded-full flex items-center justify-center cursor-default
                                       bg-gradient-to-br from-amber-400/15 to-orange-400/10
                                       border border-amber-400/25 hover:border-amber-400/40
                                       hover:from-amber-400/20 hover:to-orange-400/15
                                       transition-colors duration-300
                                       focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
                          >
                            <AlertTriangle
                              className="size-3.5 text-amber-500 dark:text-amber-400"
                              strokeWidth={2.5}
                            />
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={6}>
                          <div className="space-y-1 py-0.5">
                            {truncationWarnings.map((w, i) => (
                              <p key={i} className="text-xs leading-relaxed">
                                {w}
                              </p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Footer Action */}
        <div className="h-16 flex items-center justify-center w-full">
          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-xs"
              >
                <Button size="lg" variant="outline" className="w-full h-12" onClick={goBackToHome}>
                  {t('generation.goBackAndRetry')}
                </Button>
              </motion.div>
            ) : !isComplete ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 text-sm text-muted-foreground/50 font-medium uppercase tracking-widest"
              >
                <Sparkles className="size-3 animate-pulse" />
                {t('generation.aiWorking')}
                {generatedAgents.length > 0 && !showAgentReveal && (
                  <button
                    onClick={() => setShowAgentReveal(true)}
                    className="ml-2 flex items-center gap-1.5 rounded-full border border-purple-300/30 bg-purple-500/10 px-3 py-1 text-xs font-medium normal-case tracking-normal text-purple-400 transition-colors hover:bg-purple-500/20 hover:text-purple-300"
                  >
                    <Bot className="size-3" />
                    {t('generation.viewAgents')}
                  </button>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Agent Reveal Modal */}
      <AgentRevealModal
        agents={generatedAgents}
        open={showAgentReveal}
        onClose={() => setShowAgentReveal(false)}
        onAllRevealed={() => {
          agentRevealResolveRef.current?.();
          agentRevealResolveRef.current = null;
        }}
      />
    </div>
  );
}

export default function GenerationPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
          <div className="animate-pulse space-y-4 text-center">
            <div className="h-8 w-48 bg-muted rounded mx-auto" />
            <div className="h-4 w-64 bg-muted rounded mx-auto" />
          </div>
        </div>
      }
    >
      <GenerationPreviewContent />
    </Suspense>
  );
}
