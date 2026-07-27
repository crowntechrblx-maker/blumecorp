import Beams from "./Beams";

// Set right before navigating to the OAuth login endpoint, so App.tsx knows
// to play the fake init sequence once the redirect lands back with a
// session — rather than every time an already-logged-in user reopens or
// refreshes the app.
export const LOGIN_SEQUENCE_FLAG = "wbos_login_sequence_pending";

export function RobloxLogin() {
  return (
    <div className="login-screen">
      <div className="login-beams-bg" aria-hidden="true">
        <Beams beamWidth={2} beamHeight={30} beamNumber={14} lightColor="#ffffff" speed={2} noiseIntensity={1.75} scale={0.2} rotation={30} />
      </div>

      <div className="login-content">
        <img className="login-glyph" src="/logo.png" alt="Westbridge OS" />
        <a
          className="login-button"
          href="/api/auth/login"
          onClick={() => sessionStorage.setItem(LOGIN_SEQUENCE_FLAG, "1")}
        >
          Sign In
        </a>
      </div>

      <div className="login-legal-pill">
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </a>
        <span aria-hidden="true">·</span>
        <a href="/tos.html" target="_blank" rel="noopener noreferrer">
          Terms of Service
        </a>
      </div>
    </div>
  );
}
