import { useState } from "react";
import { APPS, type AppId } from "./apps";
import { MenuBar } from "./MenuBar";
import { DesktopIcon } from "./DesktopIcon";
import { Window, type WindowState } from "./Window";
import { useAuth } from "./AuthContext";
import { useWallpaper } from "./WallpaperContext";
import { RobloxLogin } from "./RobloxLogin";
import { MessageToast } from "./MessageToast";
import "./App.css";

type WindowsMap = Partial<Record<AppId, WindowState>>;

let zCounter = 10;

function App() {
  const { user, loading, banned } = useAuth();
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
    // No dock to leave room for anymore — just the 26px menu bar plus a
    // little breathing room top and bottom.
    const height = Math.min(window.innerHeight - 56, window.innerHeight * 0.94);
    setWindows((prev) => ({
      ...prev,
      [id]: {
        ...prev[id]!,
        x: Math.max(16, (window.innerWidth - width) / 2),
        y: Math.max(30, (window.innerHeight - height) / 2),
        width,
        height,
        animating: true,
      },
    }));
    window.setTimeout(() => {
      setWindows((prev) => {
        if (!prev[id]) return prev;
        return { ...prev, [id]: { ...prev[id]!, animating: false } };
      });
    }, 600);
  }

  const activeAppName = activeApp
    ? APPS.find((a) => a.id === activeApp)?.name ?? "Finder"
    : "Finder";

  if (loading) {
    return <div className="boot-screen" />;
  }

  if (banned) {
    return (
      <div className="banned-screen">
        <div className="banned-card">
          <h1>You've been banned</h1>
          <p>Your access to Westbridge OS has been revoked by an administrator.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <RobloxLogin />;
  }

  const visibleApps = APPS.filter((app) => app.id !== "settings" || user.isAdmin);

  return (
    <div className="desktop-root" style={{ backgroundImage: `url(${wallpaperUrl})` }}>
      <MessageToast />
      <MenuBar activeAppName={activeAppName} username={user.username} />

      <div className="desktop-icons">
        {visibleApps.map((app) => (
          <DesktopIcon key={app.id} app={app} onOpen={() => openApp(app.id)} />
        ))}
      </div>

      {visibleApps.map((app) => {
        const state = windows[app.id];
        if (!state) return null;
        return (
          <Window
            key={app.id}
            app={app}
            state={state}
            username={user.username}
            avatarUrl={user.avatarUrl}
            isAdmin={user.isAdmin}
            onClose={() => closeApp(app.id)}
            onFocus={() => focusApp(app.id)}
            onMinimize={() => minimizeApp(app.id)}
            onMove={(x, y) => moveApp(app.id, x, y)}
            onResize={(w, h) => resizeApp(app.id, w, h)}
            onMaximize={() => maximizeApp(app.id)}
          />
        );
      })}
    </div>
  );
}

export default App;
