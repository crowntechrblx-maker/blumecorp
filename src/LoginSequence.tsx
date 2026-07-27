import { useEffect, useRef, useState } from "react";

// Purely cosmetic — the "password" typed here is never real, just asterisks
// standing in for one, to sell the fake terminal-init look right after a
// real Roblox OAuth login has already succeeded.
export function LoginSequence({ username, onDone }: { username: string; onDone: () => void }) {
  const [typedUser, setTypedUser] = useState("");
  const [typedPass, setTypedPass] = useState("");
  const [stage, setStage] = useState<"user" | "pass" | "hold" | "out">("user");
  const passLength = useRef(8 + Math.floor(Math.random() * 9)).current; // 8-16 inclusive

  useEffect(() => {
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setTypedUser(username.slice(0, i));
      if (i >= username.length) {
        window.clearInterval(id);
        window.setTimeout(() => setStage("pass"), 350);
      }
    }, 55);
    return () => window.clearInterval(id);
  }, [username]);

  useEffect(() => {
    if (stage !== "pass") return;
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setTypedPass("•".repeat(i));
      if (i >= passLength) {
        window.clearInterval(id);
        window.setTimeout(() => setStage("hold"), 400);
      }
    }, 45);
    return () => window.clearInterval(id);
  }, [stage, passLength]);

  useEffect(() => {
    if (stage !== "hold") return;
    const t1 = window.setTimeout(() => setStage("out"), 450);
    return () => window.clearTimeout(t1);
  }, [stage]);

  useEffect(() => {
    if (stage !== "out") return;
    const t = window.setTimeout(onDone, 450);
    return () => window.clearTimeout(t);
  }, [stage, onDone]);

  return (
    <div className={`login-sequence${stage === "out" ? " login-sequence-out" : ""}`}>
      <img className="login-sequence-logo" src="/logo.png" alt="" />
      <div className="login-sequence-field">
        <span className="login-sequence-label">Username</span>
        <div className="login-sequence-box">
          <span>{typedUser}</span>
          {stage === "user" && <span className="login-sequence-caret" />}
        </div>
      </div>
      <div className="login-sequence-field">
        <span className="login-sequence-label">Password</span>
        <div className="login-sequence-box">
          <span>{typedPass}</span>
          {stage === "pass" && <span className="login-sequence-caret" />}
        </div>
      </div>
    </div>
  );
}
