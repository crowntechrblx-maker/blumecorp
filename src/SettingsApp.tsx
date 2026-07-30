import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";

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

interface AdminMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  createdAt: number;
}

export function SettingsApp() {
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [bans, setBans] = useState<BanEntry[]>([]);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loggedInUsernames, setLoggedInUsernames] = useState<string[]>([]);
  const [messageFilter, setMessageFilter] = useState("");
  const [auditFilter, setAuditFilter] = useState("");
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
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
      setMessages(data.messages || []);
      setLoggedInUsernames(data.loggedInUsernames || []);
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadLoggedInUsers() {
    const doc = new jsPDF();
    let y = 10;
    for (const username of loggedInUsernames) {
      if (y > 280) {
        doc.addPage();
        y = 10;
      }
      doc.text(username, 10, y);
      y += 10;
    }
    doc.save("logged-in-users.pdf");
  }

  async function handleDeleteMessage(id: string) {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/messages?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(await res.text());
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError((err as Error).message || "Couldn't delete that message.");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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

      <hr className="settings-divider" />

      <div className="section settings-section">
        <h3>Logged-in users</h3>
        <p className="settings-audit-hint">
          Every unique user currently logged into Westbridge OS, as a plain PDF list.
        </p>
        <button className="cta" onClick={handleDownloadLoggedInUsers}>
          Download PDF
        </button>
      </div>

      <hr className="settings-divider" />

      <div className="section settings-section">
        <h3>Messages</h3>
        <p className="settings-audit-hint">
          Every message sent across the platform. Delete anything that shouldn't be here.
        </p>
        <input
          className="settings-message-filter"
          placeholder="Filter by username…"
          value={messageFilter}
          onChange={(e) => setMessageFilter(e.target.value)}
        />
        <div className="settings-message-list">
          {messages
            .filter((m) => {
              const term = messageFilter.trim().toLowerCase();
              if (!term) return true;
              return m.from.toLowerCase().includes(term) || m.to.toLowerCase().includes(term);
            })
            .map((m) => (
              <div className="settings-message-row" key={m.id}>
                <div className="settings-message-meta">
                  <strong>{m.from}</strong> → <strong>{m.to}</strong>
                  <span className="settings-audit-time">
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="settings-message-text">{m.text}</p>
                <button
                  className="settings-unban-btn"
                  disabled={deletingIds.has(m.id)}
                  onClick={() => handleDeleteMessage(m.id)}
                >
                  {deletingIds.has(m.id) ? "Deleting…" : "Delete"}
                </button>
              </div>
            ))}
          {messages.length === 0 && !loading && <p>No messages sent yet.</p>}
        </div>
      </div>

      <hr className="settings-divider" />

      <div className="section settings-section">
        <h3>Audit log</h3>
        <p className="settings-audit-hint">
          Every Instagram post, message, Blume report, blog post, ban, and login across the platform.
        </p>
        <input
          className="settings-message-filter"
          placeholder="Search by type, username, or detail…"
          value={auditFilter}
          onChange={(e) => setAuditFilter(e.target.value)}
        />
        {loading ? (
          <p>Loading…</p>
        ) : auditLog.length === 0 ? (
          <p>No activity logged yet.</p>
        ) : (
          (() => {
            const term = auditFilter.trim().toLowerCase();
            const filtered = term
              ? auditLog.filter(
                  (entry) =>
                    entry.type.toLowerCase().includes(term) ||
                    entry.username.toLowerCase().includes(term) ||
                    entry.detail.toLowerCase().includes(term)
                )
              : auditLog;
            return filtered.length === 0 ? (
              <p>No log entries match "{auditFilter}".</p>
            ) : (
              <div className="settings-audit-list">
                {filtered.map((entry) => (
                  <div className="settings-audit-row" key={entry.id}>
                    <span className="settings-audit-type">{entry.type}</span>
                    <span className="settings-audit-user">{entry.username}</span>
                    <span className="settings-audit-detail">{entry.detail}</span>
                    <span className="settings-audit-time">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()
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
