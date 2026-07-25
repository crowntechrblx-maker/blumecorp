import { useEffect, useState } from "react";

interface AuditEntry {
  id: string;
  type: string;
  username: string;
  detail: string;
  createdAt: number;
}

interface BanEntry {
  userId: string;
  username: string;
  bannedByUsername: string;
  createdAt: number;
}

interface TargetCheck {
  found: boolean;
  userId?: string;
  username?: string;
  isProtected?: boolean;
  groupNames?: string[];
}

export function SettingsApp() {
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [bans, setBans] = useState<BanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [banInput, setBanInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<TargetCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/admin");
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const data = await res.json();
      setAuditLog(data.auditLog || []);
      setBans(data.bans || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCheckTarget() {
    if (!banInput.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin?checkTarget=${encodeURIComponent(banInput.trim())}`);
      const data: TargetCheck = await res.json();
      if (!data.found) {
        setError("No one matching that username or user ID has signed into Westbridge OS.");
        return;
      }
      if (data.isProtected) {
        setError(`${data.username} is a platform admin and can't be banned.`);
        return;
      }
      setConfirmTarget(data);
    } finally {
      setChecking(false);
    }
  }

  async function handleConfirmBan() {
    if (!confirmTarget) return;
    setError(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ban", target: confirmTarget.username }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const data = await res.json();
      setBans(data.bans || []);
      setConfirmTarget(null);
      setBanInput("");
    } catch {
      setError("Couldn't ban that user.");
    }
  }

  async function handleUnban(username: string) {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unban", target: username }),
    });
    if (res.ok) {
      const data = await res.json();
      setBans(data.bans || []);
    }
  }

  return (
    <div className="app-content settings">
      <h2>Settings</h2>

      <div className="section settings-section">
        <h3>Ban a user</h3>
        <div className="settings-ban-form">
          <input
            placeholder="Username or user ID"
            value={banInput}
            onChange={(e) => setBanInput(e.target.value)}
          />
          <button className="cta" disabled={!banInput.trim() || checking} onClick={handleCheckTarget}>
            {checking ? "Checking…" : "Ban"}
          </button>
        </div>
        {error && <p className="settings-error">{error}</p>}

        {bans.length > 0 && (
          <div className="settings-ban-list">
            {bans.map((b) => (
              <div className="settings-ban-row" key={b.userId}>
                <span>
                  <strong>{b.username}</strong> — banned by {b.bannedByUsername}
                </span>
                <button className="settings-unban-btn" onClick={() => handleUnban(b.username)}>
                  Unban
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section settings-section">
        <h3>Audit log</h3>
        <p className="settings-audit-hint">
          Every Instagram post, message, Blume report, blog post, and login across the platform.
        </p>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <div className="settings-audit-list">
            {auditLog.map((entry) => (
              <div className="settings-audit-row" key={entry.id}>
                <span className="settings-audit-type">{entry.type}</span>
                <span className="settings-audit-user">{entry.username}</span>
                <span className="settings-audit-detail">{entry.detail}</span>
                <span className="settings-audit-time">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
            {auditLog.length === 0 && <p>No activity logged yet.</p>}
          </div>
        )}
      </div>

      {confirmTarget && (
        <div className="settings-modal-backdrop">
          <div className="settings-modal">
            {confirmTarget.groupNames && confirmTarget.groupNames.length > 0 ? (
              <p>
                Are you sure you want to ban {confirmTarget.username}? They are a member of{" "}
                {confirmTarget.groupNames.join(", ")}.
              </p>
            ) : (
              <p>Are you sure you want to ban {confirmTarget.username}?</p>
            )}
            <div className="settings-modal-actions">
              <button className="settings-modal-cancel" onClick={() => setConfirmTarget(null)}>
                Cancel
              </button>
              <button className="settings-modal-confirm" onClick={handleConfirmBan}>
                Ban
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
