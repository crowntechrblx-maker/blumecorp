import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { playDing } from "./MessageToast";

const VISIBLE_MS = 6500;

export function FoiToast() {
  const { foiNotification, clearFoiNotification } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!foiNotification) return;
    playDing();
    setVisible(true);
    const hideTimer = window.setTimeout(() => setVisible(false), VISIBLE_MS);
    const clearTimer = window.setTimeout(() => clearFoiNotification(), VISIBLE_MS + 300);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foiNotification]);

  if (!foiNotification) return null;

  return (
    <div className={`message-toast foi-toast ${visible ? "visible" : ""}`}>
      <span className="message-toast-icon">📄</span>
      <span>
        New FOI request — <strong>FOI{foiNotification.foiYear}/{foiNotification.foiNumber}</strong> re.{" "}
        {foiNotification.subjectUsername}
      </span>
    </div>
  );
}
