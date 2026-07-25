import { useState } from "react";
import { APPS, type AppId } from "./apps";
import { MenuBar } from "./MenuBar";
import { Dock } from "./Dock";
import { DesktopIcon } from "./DesktopIcon";
import { Window, type WindowState } from "./Window";
import { useAuth } from "./AuthContext";
import { useWallpaper } from "./WallpaperContext";
import { RobloxLogin } from "./RobloxLogin";
import "./App.css";

type WindowsMap = Partial<Record<AppId, WindowState>>;

let zCounter = 10;

function App() {
  const { user, loading } = useAuth();
  const { wallpaperUrl } = useWallpaper();
  const [windows, setWindows] = useState<WindowsMap>({});
  const [activeApp, setActiveApp] = useState<AppId | null>(null);

  function openApp(id: AppId) {
    const app = APPS.find((a) => a.id === id)!;
    setWindows((prev) => {
      if (prev[id]) {
        return {
          ...prev,
          [id]: { ...prev[id]!, minimized: false, zIndex: ++zCounter },
        };
      }
      const offset = Object.keys(prev).length * 24;
      return {
        ...prev,
        [id]: {
          x: 120 + offset,
          y: 80 + offset,
          width: app.defaultSize.width,
          height: app.defaultSize.height,
          zIndex: ++zCounter,
          minimized: false,
        },
      };
    });
    setActiveApp(id);
  }

  function closeApp(id: AppId) {
    setWindows((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeApp === id) setActiveApp(null);
  }

  function focusApp(id: AppId) {
    setWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id]!, zIndex: ++zCounter },
    }));
    setActiveApp(id);
  }

  function minimizeApp(id: AppId) {
    setWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id]!, minimized: true },
    }));
  }

  function moveApp(id: AppId, x: number, y: number) {
    setWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id]!, x, y },
    }));
  }

  function resizeApp(id: AppId, width: number, height: number) {
    setWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id]!, width, height },
    }));
  }

  function maximizeApp(id: AppId) {
    const width = Math.min(window.innerWidth - 60, window.innerWidth * 0.94);
    const height = Math.min(window.innerHeight - 100, window.innerHeight * 0.88);
    setWindows((prev) => ({
      ...prev,
      [id]: {
        ...prev[id]!,
        x: Math.max(16, (window.innerWidth - width) / 2),
        y: Math.max(32, (window.innerHeight - height) / 2 - 10),
        width,
        height,
      },
    }));
  }

  const activeAppName = activeApp
    ? APPS.find((a) => a.id === activeApp)?.name ?? "Finder"
    : "Finder";
  const openAppIds = Object.keys(windows) as AppId[];

  if (loading) {
    return <div className="boot-screen" />;
  }

  if (!user) {
    return <RobloxLogin />;
  }

  return (
    <div className="desktop-root" style={{ backgroundImage: `url(${wallpaperUrl})` }}>
      <MenuBar activeAppName={activeAppName} username={user.username} />

      <div className="desktop-icons">
        {APPS.map((app) => (
          <DesktopIcon key={app.id} app={app} onOpen={() => openApp(app.id)} />
        ))}
      </div>

      {APPS.map((app) => {
        const state = windows[app.id];
        if (!state) return null;
        return (
          <Window
            key={app.id}
            app={app}
            state={state}
            username={user.username}
            avatarUrl={user.avatarUrl}
            onClose={() => closeApp(app.id)}
            onFocus={() => focusApp(app.id)}
            onMinimize={() => minimizeApp(app.id)}
            onMove={(x, y) => moveApp(app.id, x, y)}
            onResize={(w, h) => resizeApp(app.id, w, h)}
            onMaximize={() => maximizeApp(app.id)}
          />
        );
      })}

      <Dock openApps={openAppIds} onOpen={openApp} />
    </div>
  );
}

export default App;
