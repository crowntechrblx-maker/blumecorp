import type { AppDef } from "./apps";

export function DesktopIcon({ app, onOpen }: { app: AppDef; onOpen: () => void }) {
  return (
    <button className="desktop-icon" onDoubleClick={onOpen}>
      <span className="desktop-icon-glyph" style={{ background: app.color }}>
        {app.icon}
      </span>
      <span className="desktop-icon-label">{app.name}</span>
    </button>
  );
}
