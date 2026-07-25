import { useEffect, useState } from "react";

interface BlumeReport {
  id: string;
  title: string;
  body: string;
  authorUsername: string;
  createdAt: number;
}

interface BlumeBlogPost {
  id: string;
  title: string;
  excerpt: string;
  readMinutes: number;
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

const INDUSTRIES = [
  {
    title: "Energy & Utilities",
    copy: "Grid load, maintenance schedules, and weather risk in one operating picture.",
  },
  {
    title: "Logistics",
    copy: "Fleet, freight, and inventory reconciled across every carrier and warehouse.",
  },
  {
    title: "Manufacturing",
    copy: "Line performance and supplier risk modeled down to the individual part.",
  },
  {
    title: "Public Sector",
    copy: "Cross-agency coordination without forcing a single system of record.",
  },
  {
    title: "Healthcare",
    copy: "Capacity and patient flow visible across facilities, in real time.",
  },
  {
    title: "Financial Services",
    copy: "Exposure and counterparty risk modeled as one connected graph.",
  },
];

const REQUEST_ACCESS_URL = "https://discord.gg/ye7FsHsCTM";

export function BlumeApp({
  username,
  onMaximize,
}: {
  username: string;
  onMaximize?: () => void;
}) {
  const [canAccess, setCanAccess] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const [reports, setReports] = useState<BlumeReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [blogPosts, setBlogPosts] = useState<BlumeBlogPost[]>([]);
  const [canEditBlog, setCanEditBlog] = useState(false);
  const [blogTitle, setBlogTitle] = useState("");
  const [blogExcerpt, setBlogExcerpt] = useState("");
  const [blogSubmitting, setBlogSubmitting] = useState(false);
  const [blogError, setBlogError] = useState<string | null>(null);

  async function loadAccess() {
    try {
      const res = await fetch("/api/blume-reports");
      const data = await res.json();
      setCanAccess(!!data.canAccess);
      setReports(data.reports || []);
    } finally {
      setLoadingReports(false);
    }
  }

  async function loadBlog() {
    const res = await fetch("/api/blume-blog");
    const data = await res.json();
    setBlogPosts(data.posts || []);
    setCanEditBlog(!!data.canEdit);
  }

  useEffect(() => {
    loadAccess();
    loadBlog();
  }, []);

  function handleLogin() {
    if (!canAccess) return;
    setNavOpen(false);
    onMaximize?.();
    // Let the window's resize animation get underway before the content
    // swaps, so the transition reads as one fluid motion rather than a cut.
    window.setTimeout(() => setLoggedIn(true), 260);
  }

  function handleLogout() {
    setLoggedIn(false);
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
      await loadAccess();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteReport(id: string) {
    await fetch(`/api/blume-reports?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadAccess();
  }

  async function handleAddBlogPost() {
    if (!blogTitle.trim() || !blogExcerpt.trim()) return;
    setBlogSubmitting(true);
    setBlogError(null);
    try {
      const res = await fetch("/api/blume-blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: blogTitle.trim(), excerpt: blogExcerpt.trim() }),
      });
      if (!res.ok) {
        setBlogError(await res.text());
        return;
      }
      setBlogTitle("");
      setBlogExcerpt("");
      await loadBlog();
    } finally {
      setBlogSubmitting(false);
    }
  }

  async function handleDeleteBlogPost(id: string) {
    await fetch(`/api/blume-blog?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadBlog();
  }

  function scrollToSection(sectionId: string) {
    setNavOpen(false);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="blume-app">
      <div className="blume-topbar">
        <span className="blume-logo">
          <span className="blume-logo-mark" />
          Blume
        </span>
        <div className="blume-topbar-right">
          {!loggedIn && canAccess && (
            <button className="blume-pill-btn" onClick={handleLogin}>
              Login
            </button>
          )}
          {loggedIn && (
            <button className="blume-pill-btn blume-pill-btn-ghost" onClick={handleLogout}>
              Logout
            </button>
          )}
          {!loggedIn && (
            <div className="blume-nav-wrap">
              <button
                className="blume-hamburger"
                onClick={() => setNavOpen((v) => !v)}
                aria-label="Menu"
              >
                <span />
                <span />
                <span />
              </button>
              {navOpen && (
                <div className="blume-nav-dropdown">
                  <button onClick={() => scrollToSection("blume-industries")}>Industries</button>
                  <button onClick={() => scrollToSection("blume-blog")}>Blog</button>
                  <a href={REQUEST_ACCESS_URL} target="_blank" rel="noopener noreferrer">
                    Request access
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!loggedIn && (
        <div className="blume-scroll">
          <section className="blume-hero">
            <h1 className="blume-hero-title">
              The world's foremost innovator of high-tech, high-performance security technology.
            </h1>
            <a
              className="blume-request-link"
              href={REQUEST_ACCESS_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <button className="blume-pill-btn blume-pill-btn-solid">Request access</button>
            </a>
          </section>

          <section className="blume-industries" id="blume-industries">
            <div className="blume-section-eyebrow">Industries</div>
            <h2 className="blume-section-title">
              Where the stakes are highest, and the data is worst.
            </h2>
            <div className="blume-industries-grid">
              {INDUSTRIES.map((ind) => (
                <div className="blume-industry-card" key={ind.title}>
                  <strong>{ind.title}</strong>
                  <p>{ind.copy}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="blume-blog" id="blume-blog">
            <div className="blume-section-eyebrow">From our blog</div>
            <h2 className="blume-section-title">Field notes from the Blume team.</h2>

            {canEditBlog && (
              <div className="blume-blog-form">
                <input
                  placeholder="Post title"
                  value={blogTitle}
                  onChange={(e) => setBlogTitle(e.target.value)}
                />
                <textarea
                  placeholder="Short excerpt…"
                  value={blogExcerpt}
                  onChange={(e) => setBlogExcerpt(e.target.value)}
                  rows={3}
                />
                <button
                  className="blume-pill-btn blume-pill-btn-solid"
                  disabled={!blogTitle.trim() || !blogExcerpt.trim() || blogSubmitting}
                  onClick={handleAddBlogPost}
                >
                  {blogSubmitting ? "Publishing…" : "Publish"}
                </button>
                {blogError && <p className="blume-error">{blogError}</p>}
              </div>
            )}

            <div className="blume-blog-grid">
              {blogPosts.length === 0 ? (
                <p className="blume-muted">No posts published yet.</p>
              ) : (
                blogPosts.map((p) => (
                  <div className="blume-blog-card" key={p.id}>
                    <div className="blume-blog-card-top">
                      <span>{p.readMinutes} min read</span>
                      {canEditBlog && (
                        <button
                          className="blume-report-delete"
                          onClick={() => handleDeleteBlogPost(p.id)}
                          title="Remove post"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <strong>{p.title}</strong>
                    <p>{p.excerpt}</p>
                    <span className="blume-blog-meta">
                      {p.authorUsername} · {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
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
