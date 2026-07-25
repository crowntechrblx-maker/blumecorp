import { useRef, useState } from "react";
import type { AppDef } from "./apps";
import { AppContent } from "./AppContent";

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
}

interface WindowProps {
  app: AppDef;
  state: WindowState;
  username: string;
  avatarUrl: string | null;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
}

const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;

type ResizeDir = "e" | "s" | "se";

export function Window({
  app,
  state,
  username,
  avatarUrl,
  onClose,
  onFocus,
  onMinimize,
  onMove,
  onResize,
}: WindowProps) {
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  function handleMouseDown(e: React.MouseEvent) {
    onFocus();
    setDragging(true);
    dragOffset.current = { x: e.clientX - state.x, y: e.clientY - state.y };

    function handleMouseMove(ev: MouseEvent) {
      onMove(ev.clientX - dragOffset.current.x, ev.clientY - dragOffset.current.y);
    }
    function handleMouseUp() {
      setDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function handleResizeMouseDown(dir: ResizeDir) {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      onFocus();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = state.width;
      const startHeight = state.height;

      function handleMouseMove(ev: MouseEvent) {
        let width = startWidth;
        let height = startHeight;
        if (dir === "e" || dir === "se") {
          width = Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX));
        }
        if (dir === "s" || dir === "se") {
          height = Math.max(MIN_HEIGHT, startHeight + (ev.clientY - startY));
        }
        onResize(width, height);
      }
      function handleMouseUp() {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      }
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    };
  }

  if (state.minimized) return null;

  return (
    <div
      className={`window ${dragging ? "dragging" : ""}`}
      style={{
        left: state.x,
        top: state.y,
        width: state.width,
        height: state.height,
        zIndex: state.zIndex,
      }}
      onMouseDown={onFocus}
    >
      <div className="titlebar" onMouseDown={handleMouseDown}>
        <div className="traffic-lights">
          <button className="tl close" onClick={onClose} aria-label="Close" />
          <button className="tl minimize" onClick={onMinimize} aria-label="Minimize" />
          <button className="tl zoom" aria-label="Zoom" />
        </div>
        <span className="titlebar-title">{app.name}</span>
      </div>
      <div className="window-body">
        <AppContent id={app.id} username={username} avatarUrl={avatarUrl} />
      </div>

      <div className="resize-handle resize-e" onMouseDown={handleResizeMouseDown("e")} />
      <div className="resize-handle resize-s" onMouseDown={handleResizeMouseDown("s")} />
      <div className="resize-handle resize-se" onMouseDown={handleResizeMouseDown("se")} />
    </div>
  );
}

export type { WindowState };
