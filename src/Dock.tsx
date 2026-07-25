import { APPS, type AppId } from "./apps";

interface DockProps {
  openApps: AppId[];
  onOpen: (id: AppId) => void;
}

export function Dock({ openApps, onOpen }: DockProps) {
  return (
    <div className="dock">
      {APPS.map((app) => (
        <button
          key={app.id}
          className="dock-item"
          onClick={() => onOpen(app.id)}
          title={app.name}
          style={{ background: app.color }}
        >
          <span className="dock-icon">{app.icon}</span>
          {openApps.includes(app.id) && <span className="dock-dot" />}
        </button>
      ))}
    </div>
  );
}
