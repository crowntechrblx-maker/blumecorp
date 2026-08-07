import { useState, type FormEvent } from "react";
import Beams from "./Beams";
import { useAuth } from "./AuthContext";

export function PasswordGate() {
  const { unlockGate } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim() || checking) return;
    setChecking(true);
    setError(null);
    const err = await unlockGate(password);
    if (err) setError(err);
    setChecking(false);
  }

  return (
    <div className="login-screen">
      <div className="login-beams-bg" aria-hidden="true">
        <Beams beamWidth={2} beamHeight={30} beamNumber={14} lightColor="#ffffff" speed={2} noiseIntensity={1.75} scale={0.2} rotation={30} />
      </div>

      <div className="login-content">
        <img className="login-glyph" src="/logo.png" alt="Westbridge OS" />
        <form className="gate-form" onSubmit={handleSubmit}>
          <input
            className="gate-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <button className="login-button" type="submit" disabled={!password.trim() || checking}>
            {checking ? "Checking…" : "Enter"}
          </button>
        </form>
        {error && <p className="gate-error">{error}</p>}
      </div>
    </div>
  );
}
