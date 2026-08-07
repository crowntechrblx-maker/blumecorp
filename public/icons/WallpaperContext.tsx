import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";

const DEFAULT_WALLPAPER = "/wallpapers/default.webp";

interface WallpaperState {
  wallpaperUrl: string;
  setWallpaperUrl: (url: string) => void;
}

const WallpaperContext = createContext<WallpaperState>({
  wallpaperUrl: DEFAULT_WALLPAPER,
  setWallpaperUrl: () => {},
});

export function WallpaperProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const storageKey = `wb_wallpaper_${user?.username ?? "guest"}`;
  const [wallpaperUrl, setWallpaperUrlState] = useState(DEFAULT_WALLPAPER);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    setWallpaperUrlState(saved || DEFAULT_WALLPAPER);
  }, [storageKey]);

  function setWallpaperUrl(url: string) {
    setWallpaperUrlState(url);
    localStorage.setItem(storageKey, url);
  }

  return (
    <WallpaperContext.Provider value={{ wallpaperUrl, setWallpaperUrl }}>
      {children}
    </WallpaperContext.Provider>
  );
}

export function useWallpaper() {
  return useContext(WallpaperContext);
}
