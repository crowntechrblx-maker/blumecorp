// C&M Rolls — a fictional private law firm within Westbridge. Generic
// placeholder photography (picsum.photos, seeded so they stay stable) is
// used until the user supplies real branded images.

const PRACTICE_AREAS = [
  {
    title: "Corporate Law",
    copy: "Advising businesses across Westbridge on structure, contracts, mergers, and commercial disputes.",
    image: "https://picsum.photos/seed/cm-rolls-corporate/400/300",
  },
  {
    title: "Criminal Law",
    copy: "Robust, discreet representation for criminal matters, from first hearing through to trial.",
    image: "https://picsum.photos/seed/cm-rolls-criminal/400/300",
  },
  {
    title: "Employment Law",
    copy: "Guidance for both employers and employees on contracts, disputes, and tribunal proceedings.",
    image: "https://picsum.photos/seed/cm-rolls-employment/400/300",
  },
  {
    title: "Property & Estates",
    copy: "Conveyancing, leases, and estate matters handled with the same care as our courtroom work.",
    image: "https://picsum.photos/seed/cm-rolls-property/400/300",
  },
];

const WHY_US = [
  "Over a decade representing clients across every court in Westbridge.",
  "Solicitors and barristers on hand, including counsel who sit on the King's Bench.",
  "Transparent, fixed-fee options for most matters — no surprise invoices.",
  "A dedicated case handler from your first call through to resolution.",
];

const TEAM = [
  { name: "M. Caldwell", role: "Senior Partner", photo: "https://picsum.photos/seed/cm-rolls-team-1/200/200" },
  { name: "R. Sutcliffe", role: "Partner, Corporate", photo: "https://picsum.photos/seed/cm-rolls-team-2/200/200" },
  { name: "A. Whitmore", role: "Partner, Criminal", photo: "https://picsum.photos/seed/cm-rolls-team-3/200/200" },
  { name: "J. Okafor", role: "Associate", photo: "https://picsum.photos/seed/cm-rolls-team-4/200/200" },
];

const STATS = [
  { value: "1,200+", label: "Cases handled" },
  { value: "94%", label: "Client satisfaction" },
  { value: "15", label: "Years practicing" },
];

export function PsRollsApp() {
  return (
    <div className="app-content rolls-app">
      <div className="rolls-hero">
        <div className="rolls-crest">⚖</div>
        <div className="rolls-hero-badge">C&amp;M ROLLS — SOLICITORS &amp; BARRISTERS</div>
        <h1 className="rolls-motto">"Where Justice Lays"</h1>
        <p className="rolls-hero-sub">
          A private law firm operating within Westbridge, catered towards corporate law,
          criminal law, employment law, and property matters. Our doors are open to taking
          on new cases and new talent alike.
        </p>
        <div className="rolls-hero-actions">
          <a
            className="app-content-cta-link"
            href="https://discord.gg/crjrGHbqc"
            target="_blank"
            rel="noopener noreferrer"
          >
            <button className="rolls-btn-primary">Open a ticket</button>
          </a>
          <button className="rolls-btn-secondary">View practice areas</button>
        </div>
      </div>

      <div className="rolls-section">
        <div className="rolls-stats">
          {STATS.map((s) => (
            <div className="rolls-stat" key={s.label}>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rolls-section">
        <div className="rolls-section-label">PRACTICE AREAS</div>
        <h2 className="rolls-section-title">What we handle</h2>
        <div className="rolls-practice-grid">
          {PRACTICE_AREAS.map((p) => (
            <div className="rolls-practice-card" key={p.title}>
              <img className="rolls-practice-image" src={p.image} alt="" />
              <div className="rolls-practice-body">
                <strong>{p.title}</strong>
                <p>{p.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rolls-section">
        <div className="rolls-section-label">WHY C&amp;M ROLLS</div>
        <h2 className="rolls-section-title">Why clients choose us</h2>
        <ul className="rolls-why-list">
          {WHY_US.map((w) => (
            <li key={w}>
              <span className="rolls-why-icon">✦</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rolls-section">
        <div className="rolls-section-label">OUR TEAM</div>
        <h2 className="rolls-section-title">Solicitors & barristers</h2>
        <div className="rolls-team-grid">
          {TEAM.map((t) => (
            <div className="rolls-team-card" key={t.name}>
              <img className="rolls-team-photo" src={t.photo} alt="" />
              <strong>{t.name}</strong>
              <span>{t.role}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rolls-section">
        <div className="rolls-section-label">TESTIMONIAL</div>
        <div className="rolls-testimonial">
          "C&amp;M Rolls handled our case with more care and clarity than I expected — they kept
          us informed at every stage and never once made us feel like just another file."
          <cite>— A Westbridge client</cite>
        </div>
      </div>

      <div className="rolls-contact-section">
        <h3>Taking new cases and trainee applications</h3>
        <p>
          We have job openings, trainee contracts, and case capacity available. Feel free to
          open a ticket and a member of our team will be with you.
        </p>
        <a
          className="app-content-cta-link"
          href="https://discord.gg/crjrGHbqc"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button className="rolls-btn-primary">Open a ticket</button>
        </a>
      </div>
    </div>
  );
}
