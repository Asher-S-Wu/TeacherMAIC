'use client';

import { useRef, useEffect } from 'react';
import { useAnimate } from 'motion/react';
import type { PPTVideoElement } from '@/lib/types/slides';
import { useCanvasStore } from '@/lib/store/canvas';
import { createLogger } from '@/lib/logger';

const log = createLogger('BaseVideoElement');

export interface BaseVideoElementProps {
  elementInfo: PPTVideoElement;
}

/**
 * Base video element component for read-only/presentation display.
 * Controlled exclusively by the canvas store via the play_video action.
 * Videos never autoplay — they wait for an explicit play_video action.
 */
export function BaseVideoElement({ elementInfo }: BaseVideoElementProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playingVideoElementId = useCanvasStore.use.playingVideoElementId();
  const prevPlayingRef = useRef('');
  const [scope, animate] = useAnimate<HTMLDivElement>();

  // Ensure video is paused on mount — prevents browser autoplay from user gesture context
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const isMe = playingVideoElementId === elementInfo.id;
    const wasMe = prevPlayingRef.current === elementInfo.id;
    prevPlayingRef.current = playingVideoElementId;

    if (isMe && !wasMe) {
      // "Tap" press animation — a deliberate, teacher-paced click feel
      animate(
        scope.current,
        { scale: [1, 1.035, 1] },
        {
          duration: 0.6,
          ease: [0.25, 0.1, 0.25, 1],
          times: [0, 0.35, 1],
        },
      );
      video.play().catch((err) => {
        log.warn('[BaseVideoElement] play() failed:', err);
      });
    } else if (!isMe && wasMe) {
      video.pause();
    }
  }, [playingVideoElementId, elementInfo.id, animate, scope]);

  const handleEnded = () => {
    if (useCanvasStore.getState().playingVideoElementId === elementInfo.id) {
      useCanvasStore.getState().pauseVideo();
    }
  };

  return (
    <div
      className="element-content absolute"
      data-video-element
      style={{
        top: `${elementInfo.top}px`,
        left: `${elementInfo.left}px`,
        width: `${elementInfo.width}px`,
        height: `${elementInfo.height}px`,
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={scope}
        className="w-full h-full"
        style={{ transform: `rotate(${elementInfo.rotate}deg)` }}
      >
        {elementInfo.src ? (
          <video
            ref={videoRef}
            className="w-full h-full"
            style={{ objectFit: 'contain' }}
            src={elementInfo.src}
            poster={elementInfo.poster}
            preload="metadata"
            controls
            onEnded={handleEnded}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-black/10 rounded">
            <svg
              className="w-12 h-12 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
