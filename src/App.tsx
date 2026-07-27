import { useEffect, useState } from "react";
import { APPS, type AppId } from "./apps";
import { MenuBar } from "./MenuBar";
import { DesktopIcon } from "./DesktopIcon";
import { Window, type WindowState } from "./Window";
import { useAuth } from "./AuthContext";
import { useWallpaper } from "./WallpaperContext";
import { RobloxLogin, LOGIN_SEQUENCE_FLAG } from "./RobloxLogin";
import { LoginSequence } from "./LoginSequence";
import { MessageToast } from "./MessageToast";
import "./App.css";

type WindowsMap = Partial<Record<AppId, WindowState>>;

let zCounter = 10;

function App() {
  const { user, loading, banned } = useAuth();
  const { wallpaperUrl } = useWallpaper();
  const [windows, setWindows] = useState<WindowsMap>({});
  // Read synchronously (not in an effect) so this is already known on the
  // very first render — otherwise the real desktop flashes on screen for a
  // frame right after the OAuth redirect lands, before an effect had a
  // chance to flip this to true.
  const [showLoginSequence, setShowLoginSequence] = useState(
    () => sessionStorage.getItem(LOGIN_SEQUENCE_FLAG) === "1"
  );
  const [activeApp, setActiveApp] = useState<AppId | null>(null);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);

  // Only used to re-center the icon column when the window is resized —
  // it does NOT affect how many icons fit in a column (that's a flat 8,
  // regardless of screen size or how many apps are visible).
  useEffect(() => {
    function handleResize() {
      setViewportHeight(window.innerHeight);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
    // No dock to leave room for anymore. Match the desktop icons' framing:
    // 26px menu bar + 16px breathing room on top (42px), and the same 16px
    // gap reserved at the bottom, so the window sits evenly between them.
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

  // Mac-style desktop icon layout: fill a column top-to-bottom, and once
  // it hits 8, start a new column to the LEFT of it (never to the right,
  // which would run off toward the menu bar clock). This is a flat,
  // always-8 rule — it does NOT change based on how many apps someone can
  // see. An admin (extra Settings icon) simply gets a second column with
  // one more icon in it; the first column is identical either way.
  const ICON_SLOT_HEIGHT = 94; // 88px icon + 6px gap
  const RESERVED_VERTICAL_SPACE = 58; // 42px top framing + 16px bottom framing
  const ICONS_PER_COLUMN = 8;
  const iconColumns: (typeof visibleApps)[] = [];
  for (let i = 0; i < visibleApps.length; i += ICONS_PER_COLUMN) {
    iconColumns.push(visibleApps.slice(i, i + ICONS_PER_COLUMN));
  }

  // The tallest column is always the first one (columns fill to capacity
  // before overflowing), so its content height is what actually needs to
  // be framed. Rather than stretching the icon block across the whole
  // reserved area (which leaves top-aligned icons flush at the top but
  // with a bigger gap below), size the block to its real content height
  // and center THAT block in the reserved area — so the gap above the top
  // icons equals the gap below the bottom icons, while every column still
  // starts flush with the others at the block's top edge.
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
