import { useEffect, useState } from "react";
import { APPS, type AppId } from "./apps";
import { MenuBar } from "./MenuBar";
import { DesktopIcon } from "./DesktopIcon";
import { Window, type WindowState } from "./Window";
import { useAuth } from "./AuthContext";
import { useWallpaper } from "./WallpaperContext";
import { RobloxLogin, LOGIN_SEQUENCE_FLAG } from "./RobloxLogin";
import { PasswordGate } from "./PasswordGate";
import { LoginSequence } from "./LoginSequence";
import { MessageToast } from "./MessageToast";
import "./App.css";

type WindowsMap = Partial<Record<AppId, WindowState>>;

let zCounter = 10;

function App() {
  const { user, loading, banned, gateRequired } = useAuth();
  const { wallpaperUrl } = useWallpaper();
  const [windows, setWindows] = useState<WindowsMap>({});
  const [showLoginSequence, setShowLoginSequence] = useState(
    () => sessionStorage.getItem(LOGIN_SEQUENCE_FLAG) === "1"
  );
  const [activeApp, setActiveApp] = useState<AppId | null>(null);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);

  useEffect(() => {
    function handleResize() {
      setViewportHeight(window.innerHeight);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    async function acquire() {
      try {
        if ("wakeLock" in navigator) {
          const sentinel = await navigator.wakeLock.request("screen");
          if (cancelled) {
            sentinel.release().catch(() => {});
            return;
          }
          lock = sentinel;
        }
      } catch {
      }
    }

    acquire();

    function handleVisibility() {
      if (document.visibilityState === "visible" && !lock) acquire();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      lock?.release().catch(() => {});
    };
  }, []);

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
    const topGap = 42;
    const bottomGap = 16;
    const height = Math.min(window.innerHeight - topGap - bottomGap, window.innerHeight * 0.94);
    setWindows((prev) => ({
      ...prev,
      [id]: {
        ...prev[id]!,
        x: Math.max(16, (window.innerWidth - width) / 2),
        y: topGap,
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

  if (gateRequired) {
    return <PasswordGate />;
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

  const ICON_SLOT_HEIGHT = 94; // 88px icon + 6px gap
  const RESERVED_VERTICAL_SPACE = 58; // 42px top framing + 16px bottom framing
  const ICONS_PER_COLUMN = 8;
  const iconColumns: (typeof visibleApps)[] = [];
  for (let i = 0; i < visibleApps.length; i += ICONS_PER_COLUMN) {
    iconColumns.push(visibleApps.slice(i, i + ICONS_PER_COLUMN));
  }

  const tallestColumnCount = iconColumns[0]?.length ?? 0;
  const contentHeight = Math.max(0, tallestColumnCount * ICON_SLOT_HEIGHT - 6);
  const availableHeight = viewportHeight - RESERVED_VERTICAL_SPACE;
  const topOffset = 42 + Math.max(0, (availableHeight - contentHeight) / 2);

  return (
    <div className="desktop-root" style={{ backgroundImage: `url(${wallpaperUrl})` }}>
      <MessageToast />
      <MenuBar activeAppName={activeAppName} username={user.username} />

      <div className="desktop-icons" style={{ top: topOffset, height: contentHeight }}>
        {iconColumns.map((column, columnIndex) => (
          <div className="desktop-icon-column" key={columnIndex}>
            {column.map((app) => (
              <DesktopIcon key={app.id} app={app} onOpen={() => openApp(app.id)} />
            ))}
          </div>
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

      {showLoginSequence && (
        <LoginSequence
          username={user.username}
          onDone={() => {
            sessionStorage.removeItem(LOGIN_SEQUENCE_FLAG);
            setShowLoginSequence(false);
          }}
        />
      )}
    </div>
  );
}

export default App;
