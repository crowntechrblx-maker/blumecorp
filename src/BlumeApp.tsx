import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFadingError } from "./useFadingError";

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

const FEATURES = [
  {
    num: "01",
    title: "Integrate",
    copy: "Connect source systems as they are — ERPs, sensors, spreadsheets, legacy databases — without months of migration or a rip-and-replace mandate.",
  },
  {
    num: "02",
    title: "Model",
    copy: "Turn raw, disconnected records into a shared object model that reflects how your operation actually works, not how a schema assumed it would.",
  },
  {
    num: "03",
    title: "Act",
    copy: "Give operators, analysts, and executives one live surface to monitor, simulate, and commit decisions — with a full record of what changed and why.",
  },
];

const APPROACH = [
  {
    title: "Weeks, not years",
    copy: "Deployment starts against your real data in the first weeks of engagement — not after a discovery phase that outlives the contract.",
  },
  {
    title: "Your systems stay",
    copy: "Blume sits alongside existing infrastructure. Nothing needs to be torn out for the model to go live.",
  },
  {
    title: "Built with your team",
    copy: "Engineers embed on-site during rollout, and hand over a model your own team can extend without us in the room.",
  },
];

const REQUEST_ACCESS_URL = "https://discord.gg/ye7FsHsCTM";

// Drop uploaded hero images in public/blume/hero/ and list their paths here
// (e.g. "/blume/hero/1.jpg") to cycle them behind the hero headline. Leave
// empty to keep the plain navy gradient.
const HERO_IMAGES: string[] = [];
const HERO_CYCLE_MS = 5000;

function useHeroCycle(count: number, intervalMs: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [count, intervalMs]);
  return index;
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealed(true);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, revealed };
}

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`blume-reveal ${revealed ? "blume-in" : ""} ${className}`}>
      {children}
    </div>
  );
}

// Driven by rAF and measured against the real rendered width every frame,
// rather than a CSS keyframe tied to a percentage of the element's width —
// that's what left a gap once the custom font finished loading and the
// track's actual width shifted out from under a fixed-percentage animation.
function BlumeMarquee() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const setRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    const SPEED = 36; // px per second
    let lastTime: number | null = null;
    let raf = 0;

    function tick(time: number) {
      const setEl = setRef.current;
      const trackEl = trackRef.current;
      if (setEl && trackEl) {
        const setWidth = setEl.getBoundingClientRect().width;
        if (setWidth > 0 && lastTime !== null) {
          const dt = (time - lastTime) / 1000;
          offsetRef.current -= SPEED * dt;
          if (offsetRef.current <= -setWidth) {
            offsetRef.current += setWidth;
          }
          trackEl.style.transform = `translateX(${offsetRef.current}px)`;
        }
      }
      lastTime = time;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="blume-marquee">
      <div className="blume-marquee-track" ref={trackRef}>
        <div className="blume-marquee-set" ref={setRef}>
          {INDUSTRIES.map((ind) => (
            <span className="blume-marquee-item" key={ind.title}>
              {ind.title}
            </span>
          ))}
        </div>
        <div className="blume-marquee-set" aria-hidden="true">
          {INDUSTRIES.map((ind) => (
            <span className="blume-marquee-item" key={ind.title}>
              {ind.title}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BlumeApp({
  username,
  onMaximize,
}: {
  username: string;
  onMaximize?: () => void;
}) {
  const [canAccess, setCanAccess] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const heroIndex = useHeroCycle(HERO_IMAGES.length, HERO_CYCLE_MS);

  const [reports, setReports] = useState<BlumeReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { error, fading, setError } = useFadingError();

  const [blogPosts, setBlogPosts] = useState<BlumeBlogPost[]>([]);
  const [canEditBlog, setCanEditBlog] = useState(false);
  const [blogTitle, setBlogTitle] = useState("");
  const [blogExcerpt, setBlogExcerpt] = useState("");
  const [blogSubmitting, setBlogSubmitting] = useState(false);
  const { error: blogError, fading: blogFading, setError: setBlogError } = useFadingError();

  const scrollRef = useRef<HTMLDivElement | null>(null);

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

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="blume-app">
      {!loggedIn && (
        <>
          <div className="blume-grain" aria-hidden="true" />
          <header className="blume-navbar">
            <div className="blume-nav-inner">
              <span className="blume-brand">
                <span className="blume-brand-mark" />
                <span className="blume-brand-name">Blume</span>
              </span>

              <div className="blume-nav-actions">
                {canAccess && (
                  <button className="blume-btn-login" onClick={handleLogin}>
                    LOGIN
                  </button>
                )}
              </div>
            </div>
          </header>
        </>
      )}

      {!loggedIn && (
        <div className="blume-scroll" ref={scrollRef}>
          <section className="blume-hero">
            {HERO_IMAGES.length > 0 && (
              <div className="blume-hero-bg" aria-hidden="true">
                {HERO_IMAGES.map((src, i) => (
                  <div
                    key={src}
                    className="blume-hero-bg-image"
                    style={{ backgroundImage: `url(${src})`, opacity: i === heroIndex ? 1 : 0 }}
                  />
                ))}
                <div className="blume-hero-tint" />
              </div>
            )}
            <div className="blume-hero-mark" aria-hidden="true" />
            <div className="blume-hero-content">
              <h1>
                The world's foremost innovator of high-tech, high-performance security
                technology.
              </h1>
              <div className="blume-hero-actions">
                <a
                  className="blume-btn-primary"
                  href={REQUEST_ACCESS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Request access
                </a>
              </div>
            </div>
            <div className="blume-hero-scroll" aria-hidden="true">
              <span />
            </div>
          </section>

          <BlumeMarquee />

          <section className="blume-platform" id="blume-platform">
            <Reveal className="blume-section-head">
              <p className="blume-eyebrow">Platform</p>
              <h2>Built for the problem underneath the problem.</h2>
              <p className="blume-section-lede">
                Most operational failures aren't failures of judgment — they're failures of
                visibility. Blume closes that gap with three connected layers.
              </p>
            </Reveal>

            <div className="blume-feature-grid">
              {FEATURES.map((f) => (
                <Reveal className="blume-feature" key={f.num}>
                  <div className="blume-feature-num">{f.num}</div>
                  <h3>{f.title}</h3>
                  <p>{f.copy}</p>
                </Reveal>
              ))}
            </div>
          </section>

          <section className="blume-showcase">
            <Reveal className="blume-showcase-media">
              <div className="blume-mock-window">
                <div className="blume-mock-bar">
                  <span />
                  <span />
                  <span />
                  <div className="blume-mock-tabs">
                    <div className="blume-mock-tab blume-active">Operations</div>
                    <div className="blume-mock-tab">Assets</div>
                    <div className="blume-mock-tab">Alerts</div>
                  </div>
                </div>
                <div className="blume-mock-body">
                  <div className="blume-mock-side">
                    <div className="blume-mock-row blume-long" />
                    <div className="blume-mock-row" />
                    <div className="blume-mock-row" />
                    <div className="blume-mock-row blume-short" />
                    <div className="blume-mock-divider" />
                    <div className="blume-mock-row" />
                    <div className="blume-mock-row blume-short" />
                  </div>
                  <div className="blume-mock-main">
                    <div className="blume-mock-stat-row">
                      <div className="blume-mock-stat">
                        <span className="blume-mock-stat-label">Throughput</span>
                        <span className="blume-mock-stat-value">94.2%</span>
                      </div>
                      <div className="blume-mock-stat">
                        <span className="blume-mock-stat-label">Open incidents</span>
                        <span className="blume-mock-stat-value">3</span>
                      </div>
                      <div className="blume-mock-stat">
                        <span className="blume-mock-stat-label">Model freshness</span>
                        <span className="blume-mock-stat-value">Live</span>
                      </div>
                    </div>
                    <div className="blume-mock-graph">
                      <svg viewBox="0 0 400 120" preserveAspectRatio="none">
                        <polyline points="0,90 40,80 80,85 120,60 160,65 200,40 240,50 280,30 320,35 360,15 400,20" />
                      </svg>
                    </div>
                    <div className="blume-mock-list">
                      <div className="blume-mock-list-row">
                        <span className="blume-dot" />
                        Line 3 — capacity model updated
                      </div>
                      <div className="blume-mock-list-row">
                        <span className="blume-dot" />
                        Vendor feed reconnected — Northgate
                      </div>
                      <div className="blume-mock-list-row">
                        <span className="blume-dot blume-warn" />
                        Anomaly flagged — cold storage 6
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal className="blume-showcase-copy">
              <p className="blume-eyebrow blume-eyebrow-light">A single surface</p>
              <h2>Everyone looks at the same board.</h2>
              <p>
                No more reconciling three dashboards before a nine o'clock call. Every
                stakeholder, from the floor to the board, works against one continuously updated
                model — so a decision made in one room holds up in the next.
              </p>
              <ul className="blume-checklist">
                <li>Change history on every object, not just every table</li>
                <li>Permissions that follow the data, not the department</li>
                <li>Simulations run against the same model that runs live</li>
              </ul>
            </Reveal>
          </section>

          <section className="blume-industries" id="blume-industries">
            <Reveal className="blume-section-head">
              <p className="blume-eyebrow">Industries</p>
              <h2>Where the stakes are highest, and the data is worst.</h2>
            </Reveal>
            <div className="blume-industry-grid">
              {INDUSTRIES.map((ind) => (
                <Reveal className="blume-industry-card" key={ind.title}>
                  <h3>{ind.title}</h3>
                  <p>{ind.copy}</p>
                </Reveal>
              ))}
            </div>
          </section>

          <section className="blume-blog" id="blume-blog">
            <Reveal className="blume-section-head">
              <p className="blume-eyebrow">From our blog</p>
              <h2>Field notes from the Blume team.</h2>
            </Reveal>

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
                  className="blume-btn-primary blume-btn-primary-dark"
                  disabled={!blogTitle.trim() || !blogExcerpt.trim() || blogSubmitting}
                  onClick={handleAddBlogPost}
                >
                  {blogSubmitting ? "Publishing…" : "Publish"}
                </button>
                {blogError && (
                  <p className={`blume-error${blogFading ? " fading-out" : ""}`}>{blogError}</p>
                )}
              </div>
            )}

            <div className="blume-industry-grid">
              {blogPosts.length === 0 ? (
                <p className="blume-muted">No posts published yet.</p>
              ) : (
                blogPosts.map((p) => (
                  <Reveal className="blume-industry-card blume-blog-card" key={p.id}>
                    {canEditBlog && (
                      <div className="blume-blog-card-top">
                        <button
                          className="blume-report-delete"
                          onClick={() => handleDeleteBlogPost(p.id)}
                          title="Remove post"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <h3>{p.title}</h3>
                    <p>{p.excerpt}</p>
                    <span className="blume-blog-meta">
                      {p.authorUsername} · {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </Reveal>
                ))
              )}
            </div>
          </section>

          <section className="blume-approach" id="blume-approach">
            <div className="blume-approach-inner">
              <p className="blume-eyebrow blume-eyebrow-light">Approach</p>
              <h2>We install into how you already work.</h2>
              <div className="blume-approach-grid">
                {APPROACH.map((a) => (
                  <Reveal className="blume-approach-item" key={a.title}>
                    <h3>{a.title}</h3>
                    <p>{a.copy}</p>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section className="blume-cta" id="blume-company">
            <Reveal className="blume-cta-inner">
              <p className="blume-eyebrow">Company</p>
              <h2>Blume works with organizations who can't afford to guess.</h2>
              <p>
                We're a small team building the layer we wish existed the last time an outage, a
                shortage, or a missed handoff turned out to be a data problem in disguise.
              </p>
              <a
                className="blume-btn-primary blume-btn-primary-dark"
                href={REQUEST_ACCESS_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Talk to us
              </a>
            </Reveal>
          </section>

          <footer className="blume-footer">
            <div className="blume-footer-inner">
              <div className="blume-footer-brand">
                <span className="blume-footer-mark" />
                <span>Blume</span>
              </div>
              <div className="blume-footer-links">
                <div className="blume-footer-col">
                  <h4>Product</h4>
                  <button onClick={() => scrollToSection("blume-platform")}>Platform</button>
                  <button onClick={() => scrollToSection("blume-industries")}>Industries</button>
                  <button onClick={() => scrollToSection("blume-approach")}>Approach</button>
                </div>
                <div className="blume-footer-col">
                  <h4>Company</h4>
                  <button onClick={() => scrollToSection("blume-company")}>About</button>
                  <a href={REQUEST_ACCESS_URL} target="_blank" rel="noopener noreferrer">
                    Contact
                  </a>
                </div>
                <div className="blume-footer-col">
                  <h4>Legal</h4>
                  <a href="https://www.blumecorp.uk/privacy" target="_blank" rel="noopener noreferrer">
                    Privacy
                  </a>
                  <a href="https://www.blumecorp.uk/tos" target="_blank" rel="noopener noreferrer">
                    Terms
                  </a>
                </div>
              </div>
            </div>
            <div className="blume-footer-bottom">
              <span>© 2026 Blume Technologies, Inc.</span>
            </div>
          </footer>
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
            <button className="blume-btn-login blume-btn-login-ghost blume-logout-btn" onClick={handleLogout}>
              LOGOUT
            </button>
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
                  className="blume-cta-btn"
                  disabled={!title.trim() || !body.trim() || submitting}
                  onClick={handleAddReport}
                >
                  {submitting ? "Filing…" : "File report"}
                </button>
                {error && <p className={`blume-error${fading ? " fading-out" : ""}`}>{error}</p>}
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
