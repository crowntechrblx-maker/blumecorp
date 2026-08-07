import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

const VISIBLE_MS = 6500;

export function playDing() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    function tone(freq: number, start: number, duration: number) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.22, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.05);
    }

    tone(880, 0, 0.18);
    tone(1318.5, 0.12, 0.28);

    window.setTimeout(() => ctx.close(), 700);
  } catch {
  }
}

export function MessageToast() {
  const { messageNotification, clearMessageNotification } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!messageNotification) return;
    playDing();
    setVisible(true);
    const hideTimer = window.setTimeout(() => setVisible(false), VISIBLE_MS);
    const clearTimer = window.setTimeout(() => clearMessageNotification(), VISIBLE_MS + 300);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageNotification]);

  if (!messageNotification) return null;

  return (
    <div className={`message-toast ${visible ? "visible" : ""}`}>
      <span className="message-toast-icon">💬</span>
      <span>
        <strong>{messageNotification.fromUsername}</strong> messaged you!
      </span>
    </div>
  );
}
