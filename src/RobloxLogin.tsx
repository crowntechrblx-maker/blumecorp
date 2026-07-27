import { useEffect, useState } from "react";

// Set right before navigating to the OAuth login endpoint, so App.tsx knows
// to play the fake init sequence once the redirect lands back with a
// session — rather than every time an already-logged-in user reopens or
// refreshes the app.
export const LOGIN_SEQUENCE_FLAG = "wbos_login_sequence_pending";

export function RobloxLogin() {
  // "logo": centered logo on its own, "flying": logo scaling up and fading
  // out, "form": the actual login card is in.
  const [phase, setPhase] = useState<"logo" | "flying" | "form">("logo");

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("flying"), 900);
    const t2 = window.setTimeout(() => setPhase("form"), 900 + 550);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <div className="login-screen">
      {phase !== "form" && (
        <div className={`boot-intro${phase === "flying" ? " boot-intro-fly" : ""}`}>
          <img className="boot-intro-logo" src="/logo.png" alt="" />
        </div>
      )}
      {phase === "form" && (
        <div className="login-card login-card-in">
          <img className="login-glyph" src="/logo.png" alt="Westbridge OS" />
          <h1>Westbridge OS</h1>
          <p>Sign in with your Roblox account to continue</p>
          <a
            className="login-button"
            href="/api/auth/login"
            onClick={() => sessionStorage.setItem(LOGIN_SEQUENCE_FLAG, "1")}
          >
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
      )}
    </div>
  );
}
