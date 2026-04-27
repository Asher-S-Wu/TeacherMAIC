'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const draftMemory = new Map<string, unknown>();

interface UseDraftCacheOptions {
  key: string;
  debounceMs?: number;
}

interface UseDraftCacheReturn<T> {
  cachedValue: T | undefined;
  updateCache: (value: T) => void;
  clearCache: () => void;
}

export function useDraftCache<T>({
  key,
  debounceMs = 500,
}: UseDraftCacheOptions): UseDraftCacheReturn<T> {
  const [cachedValue] = useState<T | undefined>(() => draftMemory.get(key) as T | undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValueRef = useRef<T | undefined>(undefined);
  const keyRef = useRef(key);

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const flushPending = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingValueRef.current !== undefined) {
      draftMemory.set(keyRef.current, pendingValueRef.current);
      pendingValueRef.current = undefined;
    }
  }, []);

  const updateCache = useCallback(
    (value: T) => {
      pendingValueRef.current = value;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        draftMemory.set(keyRef.current, value);
        pendingValueRef.current = undefined;
      }, debounceMs);
    },
    [debounceMs],
  );

  const clearCache = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingValueRef.current = undefined;
    draftMemory.delete(keyRef.current);
  }, []);

  // Flush pending write on unmount
  useEffect(() => {
    return () => {
      flushPending();
    };
  }, [flushPending]);

  return { cachedValue, updateCache, clearCache };
}
