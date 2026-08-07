import { useEffect, useRef, useState } from "react";
import { MODERATION_REJECTION_MESSAGE } from "./moderationMessage";

const FADE_START_MS = 14700;
const CLEAR_MS = 15000;

export function useFadingError() {
  const [error, setErrorState] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    fadeTimer.current = null;
    clearTimer.current = null;
  }

  function setError(message: string | null) {
    clearTimers();
    setFading(false);
    setErrorState(message);
    if (message === MODERATION_REJECTION_MESSAGE) {
      fadeTimer.current = setTimeout(() => setFading(true), FADE_START_MS);
      clearTimer.current = setTimeout(() => setErrorState(null), CLEAR_MS);
    }
  }

  useEffect(() => clearTimers, []);

  return { error, fading, setError };
}
