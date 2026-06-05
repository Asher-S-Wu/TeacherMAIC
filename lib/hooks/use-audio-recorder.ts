import { useState, useRef, useCallback } from 'react';
import { createLogger } from '@/lib/logger';

const log = createLogger('AudioRecorder');

interface WavRecordingSession {
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  monitorGain: GainNode;
  chunks: Float32Array[];
  sampleRate: number;
  length: number;
}

export interface UseAudioRecorderOptions {
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const { onTranscription, onError } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wavSessionRef = useRef<WavRecordingSession | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // Synchronous lock to prevent rapid re-entry (React state updates are async)
  const busyRef = useRef(false);

  // Send audio to server for transcription
  const transcribeAudio = useCallback(
    async (audioBlob: Blob) => {
      setIsProcessing(true);

      try {
        // Get current ASR configuration from settings store
        // Note: This requires importing useSettingsStore in browser context
        let language = 'auto';
        if (typeof window !== 'undefined') {
          const { useSettingsStore } = await import('@/lib/store/settings');
          language = useSettingsStore.getState().asrLanguage;
        }

        const { uploadAccountBlob } = await import('@/lib/utils/image-storage');
        const audioFile = new File([audioBlob], 'recording.wav', { type: 'audio/wav' });
        const saved = await uploadAccountBlob(audioFile, audioFile.name, 'audio');

        const response = await fetch('/api/transcription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: saved.id, language }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Transcription failed');
        }

        const result = await response.json();
        onTranscription?.(result.text);
      } catch (error) {
        log.error('Transcription error:', error);
        onError?.(error instanceof Error ? error.message : '语音识别失败，请重试');
      } finally {
        setIsProcessing(false);
        setRecordingTime(0);
      }
    },
    [onTranscription, onError],
  );

  const encodeWav = useCallback((session: WavRecordingSession): Blob => {
    const samples = new Float32Array(session.length);
    let offset = 0;
    for (const chunk of session.chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }

    const targetSampleRate = 16000;
    const resampledLength = Math.max(1, Math.round((samples.length * targetSampleRate) / session.sampleRate));
    const resampled = new Float32Array(resampledLength);
    for (let i = 0; i < resampledLength; i += 1) {
      const sourceIndex = (i * session.sampleRate) / targetSampleRate;
      const left = Math.floor(sourceIndex);
      const right = Math.min(left + 1, samples.length - 1);
      const ratio = sourceIndex - left;
      resampled[i] = samples[left] * (1 - ratio) + samples[right] * ratio;
    }

    const bytesPerSample = 2;
    const dataLength = resampled.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    const writeString = (position: number, value: string) => {
      for (let i = 0; i < value.length; i += 1) {
        view.setUint8(position + i, value.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetSampleRate, true);
    view.setUint32(28, targetSampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 8 * bytesPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    let dataOffset = 44;
    for (let i = 0; i < resampled.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, resampled[i]));
      view.setInt16(dataOffset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      dataOffset += bytesPerSample;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }, []);

  const cleanupWavSession = useCallback(async (session: WavRecordingSession) => {
    session.processor.disconnect();
    session.monitorGain.disconnect();
    session.source.disconnect();
    session.stream.getTracks().forEach((track) => track.stop());
    await session.audioContext.close();
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    // Synchronous lock — React state is async so isRecording may be stale
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const monitorGain = audioContext.createGain();
      monitorGain.gain.value = 0;
      const session: WavRecordingSession = {
        stream,
        audioContext,
        source,
        processor,
        monitorGain,
        chunks: [],
        sampleRate: audioContext.sampleRate,
        length: 0,
      };

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(input);
        session.chunks.push(chunk);
        session.length += chunk.length;
      };

      source.connect(processor);
      processor.connect(monitorGain);
      monitorGain.connect(audioContext.destination);
      wavSessionRef.current = session;
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];

      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      busyRef.current = false;
      log.error('Failed to start recording:', error);
      onError?.('无法访问麦克风，请检查权限设置');
    }
  }, [onError, transcribeAudio]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (wavSessionRef.current && isRecording) {
      const session = wavSessionRef.current;
      wavSessionRef.current = null;
      session.processor.onaudioprocess = null;
      const audioBlob = encodeWav(session);
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      void cleanupWavSession(session)
        .then(() => transcribeAudio(audioBlob))
        .finally(() => {
          busyRef.current = false;
        });
      return;
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      busyRef.current = false;
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [cleanupWavSession, encodeWav, isRecording, transcribeAudio]);

  // Cancel recording
  const cancelRecording = useCallback(() => {
    if (wavSessionRef.current && isRecording) {
      const session = wavSessionRef.current;
      wavSessionRef.current = null;
      session.processor.onaudioprocess = null;
      void cleanupWavSession(session);
      busyRef.current = false;
      setIsRecording(false);
      setRecordingTime(0);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      audioChunksRef.current = [];
      return;
    }

    if (mediaRecorderRef.current && isRecording) {
      // Stop recording without transcription
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();

      // Stop all audio tracks
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }

      busyRef.current = false;
      setIsRecording(false);
      setRecordingTime(0);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      audioChunksRef.current = [];
    }
  }, [cleanupWavSession, isRecording]);

  return {
    isRecording,
    isProcessing,
    recordingTime,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
