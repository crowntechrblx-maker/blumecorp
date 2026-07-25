import { useEffect, useState } from "react";

interface BlumeReport {
  id: string;
  title: string;
  body: string;
  authorUsername: string;
  createdAt: number;
}

const PLACEHOLDER_ACTIVE = [
  { username: "n.harrow", role: "Field" },
  { username: "t.ackland", role: "Analyst" },
  { username: "r.voss", role: "Field" },
  { username: "k.imani", role: "Command" },
];

const PLACEHOLDER_PINS = [
  { label: "Westbridge Central", x: 38, y: 44 },
  { label: "Docklands", x: 68, y: 62 },
  { label: "North Sector", x: 30, y: 22 },
];

export function BlumeApp({
  username,
  onMaximize,
}: {
  username: string;
  onMaximize?: () => void;
}) {
  const [canAccess, setCanAccess] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [reports, setReports] = useState<BlumeReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/blume-reports");
      const data = await res.json();
      setCanAccess(!!data.canAccess);
      setReports(data.reports || []);
    } finally {
      setLoadingReports(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleLogin() {
    if (!canAccess) return;
    setLoggedIn(true);
    onMaximize?.();
  }

  async function handleAddReport() {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/blume-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: body.trim() }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      setTitle("");
      setBody("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteReport(id: string) {
    await fetch(`/api/blume-reports?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="blume-app">
      <div className="blume-topbar">
        <span className="blume-logo">Blume</span>
        {canAccess && !loggedIn && (
          <button className="blume-login-btn" onClick={handleLogin}>
            Login
          </button>
        )}
      </div>

      {!loggedIn && (
        <div className="blume-landing">
          <div className="blume-landing-eyebrow">Blume Technologies · Est. 2024</div>
          <h1 className="blume-landing-title">
            The world's foremost innovator of high-tech, high-performance security technology.
          </h1>
          <p className="blume-landing-sub">
            Blume unifies fragmented operational data into a single working model, so teams can
            see, decide, and act in one place.
          </p>
          <div className="blume-landing-tags">
            {["Energy", "Logistics", "Manufacturing", "Public Sector", "Healthcare", "Financial Services"].map(
              (t) => (
                <span className="blume-tag" key={t}>
                  {t}
                </span>
              )
            )}
          </div>
        </div>
      )}

      {loggedIn && (
        <div className="blume-dashboard">
          <div className="blume-active-strip">
            <span className="blume-active-label">ACTIVE FIELD AGENTS</span>
            <div className="blume-active-list">
              {PLACEHOLDER_ACTIVE.map((a) => (
                <div className="blume-active-chip" key={a.username}>
                  <span className="blume-status-dot" />
                  <span className="blume-active-name">{a.username}</span>
                  <span className="blume-active-role">{a.role}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="blume-columns">
            <div className="blume-panel blume-reports-panel">
              <div className="blume-panel-header">Intelligence Reports</div>
              <div className="blume-report-form">
                <input
                  placeholder="Report title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <textarea
                  placeholder="Report details…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                />
                <button
                  className="blume-cta"
                  disabled={!title.trim() || !body.trim() || submitting}
                  onClick={handleAddReport}
                >
                  {submitting ? "Filing…" : "File report"}
                </button>
                {error && <p className="blume-error">{error}</p>}
              </div>
              <div className="blume-reports-list">
                {loadingReports ? (
                  <p className="blume-muted">Loading…</p>
                ) : reports.length === 0 ? (
                  <p className="blume-muted">No reports filed yet.</p>
                ) : (
                  reports.map((r) => (
                    <div className="blume-report-card" key={r.id}>
                      <div className="blume-report-card-head">
                        <strong>{r.title}</strong>
                        <button
                          className="blume-report-delete"
                          onClick={() => handleDeleteReport(r.id)}
                          title="Delete report"
                        >
                          ✕
                        </button>
                      </div>
                      <p>{r.body}</p>
                      <span className="blume-report-meta">
                        Filed by {r.authorUsername} · {new Date(r.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="blume-panel blume-map-panel">
              <div className="blume-panel-header">Surveillance Grid</div>
              <div className="blume-map">
                <div className="blume-map-grid" />
                {PLACEHOLDER_PINS.map((p) => (
                  <div
                    className="blume-map-pin"
                    key={p.label}
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    title={p.label}
                  >
                    <span className="blume-map-pin-dot" />
                    <span className="blume-map-pin-label">{p.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="blume-panel blume-search-panel">
              <div className="blume-panel-header">Person Search</div>
              <input placeholder="Search by name or ID…" disabled />
              <p className="blume-muted blume-search-hint">
                Person search API not yet connected, {username}. This panel is ready to wire up
                once it's available.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
