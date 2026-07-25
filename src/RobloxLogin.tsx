import { useWallpaper } from "./WallpaperContext";

export function RobloxLogin() {
  const { wallpaperUrl } = useWallpaper();

  return (
    <div className="login-screen" style={{ backgroundImage: `url(${wallpaperUrl})` }}>
      <div className="login-card">
        <div className="login-glyph">W</div>
        <h1>Westbridge OS</h1>
        <p>Sign in with your Roblox account to continue</p>
        <a className="login-button" href="/api/auth/login">
          Sign in with Roblox
        </a>
        <div className="login-legal">
          <a href="/tos.html" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>
          <span aria-hidden="true">·</span>
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  );
}
