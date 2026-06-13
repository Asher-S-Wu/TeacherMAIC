/**
 * Audio Player - Audio player interface
 *
 * Handles audio playback, pause, stop, and other operations
 *
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('AudioPlayer');

function waitForCanPlay(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Audio failed to load'));
    };
    const cleanup = () => {
      audio.removeEventListener('canplay', onReady);
      audio.removeEventListener('error', onError);
    };

    audio.addEventListener('canplay', onReady, { once: true });
    audio.addEventListener('error', onError, { once: true });

    if (audio.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      audio.load();
    }
  });
}

/**
 * Audio player implementation
 */
export class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private onEndedCallback: (() => void) | null = null;
  private muted: boolean = false;
  private volume: number = 1;
  private playbackRate: number = 1;
  private preloadCache = new Map<string, HTMLAudioElement>();

  /**
   * Start loading audio ahead of playback so play() can start immediately.
   */
  public preload(audioUrl: string): void {
    if (!audioUrl || this.preloadCache.has(audioUrl)) {
      return;
    }

    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = audioUrl;
    audio.load();
    this.preloadCache.set(audioUrl, audio);
  }

  /**
   * Preload multiple audio URLs.
   */
  public preloadMany(audioUrls: string[]): void {
    for (const url of audioUrls) {
      this.preload(url);
    }
  }

  private getOrCreateAudio(audioUrl: string): HTMLAudioElement {
    let audio = this.preloadCache.get(audioUrl);
    if (!audio) {
      audio = new Audio();
      audio.preload = 'auto';
      audio.src = audioUrl;
      audio.load();
      this.preloadCache.set(audioUrl, audio);
    }
    return audio;
  }

  /**
   * Play audio from the account file URL.
   * @param audioId Audio ID
   * @param audioUrl Optional server-generated audio URL
   * @returns true if audio started playing, false if no audio (TTS disabled or not generated)
   */
  public async play(_audioId: string, audioUrl?: string): Promise<boolean> {
    try {
      if (!audioUrl) {
        return false;
      }

      this.stop();

      const audio = this.getOrCreateAudio(audioUrl);
      audio.currentTime = 0;
      if (this.muted) audio.volume = 0;
      else audio.volume = this.volume;

      audio.defaultPlaybackRate = this.playbackRate;
      audio.playbackRate = this.playbackRate;

      audio.addEventListener(
        'ended',
        () => {
          this.onEndedCallback?.();
        },
        { once: true },
      );

      this.audio = audio;

      await waitForCanPlay(audio);
      await audio.play();
      audio.playbackRate = this.playbackRate;
      return true;
    } catch (error) {
      log.error('Failed to play audio:', error);
      throw error;
    }
  }

  /**
   * Pause playback
   */
  public pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
  }

  /**
   * Stop playback
   */
  public stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }
    // Note: onEndedCallback intentionally NOT cleared here because play()
    // calls stop() internally — clearing would break the callback chain.
    // Stale callbacks are harmless: engine mode check prevents processNext().
  }

  /**
   * Resume playback
   */
  public resume(): void {
    if (this.audio?.paused) {
      this.audio.playbackRate = this.playbackRate;
      this.audio.play().catch((error) => {
        log.error('Failed to resume audio:', error);
      });
    }
  }

  /**
   * Get current playback status (actively playing, not paused)
   */
  public isPlaying(): boolean {
    return this.audio !== null && !this.audio.paused;
  }

  /**
   * Whether there is active audio (playing or paused, but not ended)
   * Used to decide whether to resume playback or skip to the next line
   */
  public hasActiveAudio(): boolean {
    return this.audio !== null;
  }

  /**
   * Get current playback time (milliseconds)
   */
  public getCurrentTime(): number {
    return this.audio ? this.audio.currentTime * 1000 : 0;
  }

  /**
   * Get audio duration (milliseconds)
   */
  public getDuration(): number {
    return this.audio && !isNaN(this.audio.duration) ? this.audio.duration * 1000 : 0;
  }

  /**
   * Set playback ended callback
   */
  public onEnded(callback: () => void): void {
    this.onEndedCallback = callback;
  }

  /**
   * Set mute state (takes effect immediately on currently playing audio)
   */
  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.audio) {
      this.audio.volume = muted ? 0 : this.volume;
    }
  }

  /**
   * Set volume (0-1)
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audio && !this.muted) {
      this.audio.volume = this.volume;
    }
  }

  /**
   * Set playback speed (takes effect immediately on currently playing audio)
   */
  public setPlaybackRate(rate: number): void {
    this.playbackRate = Math.max(0.5, Math.min(2, rate));
    if (this.audio) {
      this.audio.playbackRate = this.playbackRate;
    }
  }

  /**
   * Destroy the player
   */
  public destroy(): void {
    this.stop();
    this.onEndedCallback = null;
    this.preloadCache.clear();
  }
}

/**
 * Create an audio player instance
 */
export function createAudioPlayer(): AudioPlayer {
  return new AudioPlayer();
}
