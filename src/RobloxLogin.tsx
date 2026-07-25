export function RobloxLogin() {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-glyph">W</div>
        <h1>Westbridge OS</h1>
        <p>Sign in with your Roblox account to continue</p>
        <a className="login-button" href="/api/auth/login">
          Sign in with Roblox
        </a>
      </div>
    </div>
  );
}
