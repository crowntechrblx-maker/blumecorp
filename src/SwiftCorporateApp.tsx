// Swift Corporate — a fictional growth/consulting firm within Westbridge.
// Generic placeholder photography (picsum.photos, seeded so they stay
// stable) is used until the user supplies real branded images.

const SERVICES = [
  {
    icon: "📈",
    title: "Growth Strategy",
    copy: "Data-driven roadmaps that turn ambitious targets into a workable quarter-by-quarter plan.",
  },
  {
    icon: "🤝",
    title: "Corporate Consulting",
    copy: "Hands-on advisory across operations, structure, and process to keep your business scaling smoothly.",
  },
  {
    icon: "💼",
    title: "Talent & Hiring",
    copy: "Building the teams that carry your growth forward, from first hire to full department.",
  },
  {
    icon: "🌍",
    title: "Market Expansion",
    copy: "Research and rollout support for businesses looking to expand into new markets and regions.",
  },
];

const SHOWCASE = [
  {
    tag: "Retail",
    title: "Scaling a regional retailer to 40 stores",
    image: "https://picsum.photos/seed/swift-corp-1/400/260",
  },
  {
    tag: "Logistics",
    title: "Cutting delivery costs by 22% in one year",
    image: "https://picsum.photos/seed/swift-corp-2/400/260",
  },
  {
    tag: "Hospitality",
    title: "A hiring pipeline that kept pace with growth",
    image: "https://picsum.photos/seed/swift-corp-3/400/260",
  },
];

const PROCESS = [
  { title: "Discovery", copy: "We start with a deep-dive into your business, goals, and constraints." },
  { title: "Strategy", copy: "A concrete, quarter-by-quarter plan built around what's actually achievable." },
  { title: "Execution", copy: "Our team works alongside yours to get the plan into motion, not just on paper." },
  { title: "Review", copy: "Regular check-ins to track progress and adjust course as your business grows." },
];

const STATS = [
  { value: "300+", label: "Companies served" },
  { value: "£120M", label: "Client revenue supported" },
  { value: "12", label: "Years in business" },
];

export function SwiftCorporateApp() {
  return (
    <div className="app-content swift-app">
      <div className="swift-hero">
        <span className="swift-hero-badge">SWIFT CORPORATE</span>
        <h1 className="swift-motto">Helping your company grow</h1>
        <p className="swift-hero-sub">
          Swift Corporate partners with ambitious businesses across Westbridge to plan, staff,
          and scale — with a dedicated team behind every stage of the journey.
        </p>
        <div className="swift-hero-actions">
          <a
            className="app-content-cta-link"
            href="https://discord.gg/93FQDz6Uk"
            target="_blank"
            rel="noopener noreferrer"
          >
            <button className="swift-btn-primary">Contact us</button>
          </a>
          <button className="swift-btn-secondary">See our work</button>
        </div>
      </div>

      <div className="swift-section">
        <div className="swift-stats">
          {STATS.map((s) => (
            <div className="swift-stat" key={s.label}>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="swift-section">
        <div className="swift-section-label">WHAT WE DO</div>
        <h2 className="swift-section-title">Services built around growth</h2>
        <div className="swift-services-grid">
          {SERVICES.map((s) => (
            <div className="swift-service-card" key={s.title}>
              <div className="swift-service-icon">{s.icon}</div>
              <strong>{s.title}</strong>
              <p>{s.copy}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="swift-section">
        <div className="swift-section-label">RECENT WORK</div>
        <h2 className="swift-section-title">Results our clients have seen</h2>
        <div className="swift-showcase-grid">
          {SHOWCASE.map((s) => (
            <div className="swift-showcase-card" key={s.title}>
              <img className="swift-showcase-image" src={s.image} alt="" />
              <div className="swift-showcase-body">
                <span>{s.tag}</span>
                <strong>{s.title}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="swift-section">
        <div className="swift-section-label">HOW WE WORK</div>
        <h2 className="swift-section-title">A process built for momentum</h2>
        <div className="swift-process">
          {PROCESS.map((p, i) => (
            <div className="swift-process-step" key={p.title}>
              <div className="swift-process-num">{i + 1}</div>
              <div>
                <strong>{p.title}</strong>
                <p>{p.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="swift-contact-section">
        <h3>Ready to grow?</h3>
        <p>Get in touch with our team and we'll walk you through how Swift Corporate can help.</p>
        <a
          className="app-content-cta-link"
          href="https://discord.gg/93FQDz6Uk"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button className="swift-btn-primary">Contact us</button>
        </a>
      </div>
    </div>
  );
}
