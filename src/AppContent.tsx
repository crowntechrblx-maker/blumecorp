import { useEffect, useState } from "react";
import type { AppId } from "./apps";
import { BackgroundsApp } from "./BackgroundsApp";
import { InstagramApp } from "./InstagramApp";
import { MessagesApp } from "./MessagesApp";
import { RoyalFamilyApp } from "./RoyalFamilyApp";

function TflContent() {
  const lines = [
    { name: "Victoria", status: "Good service", color: "#0098d4" },
    { name: "Central", status: "Minor delays", color: "#e32017" },
    { name: "Jubilee", status: "Good service", color: "#a0a5a9" },
    { name: "Northern", status: "Good service", color: "#000000" },
    { name: "District", status: "Good service", color: "#00782a" },
  ];
  return (
    <div className="app-content tfl">
      <h2>Line Status</h2>
      <ul className="line-list">
        {lines.map((l) => (
          <li key={l.name}>
            <span className="line-dot" style={{ background: l.color }} />
            <span className="line-name">{l.name}</span>
            <span className="line-status">{l.status}</span>
          </li>
        ))}
      </ul>
      <div className="section">
        <h3>Journey Planner</h3>
        <input placeholder="From" />
        <input placeholder="To" />
        <button>Plan journey</button>
      </div>
    </div>
  );
}

function UberContent({ username }: { username: string }) {
  const [location, setLocation] = useState("");
  const [requested, setRequested] = useState(false);
  const [price, setPrice] = useState<number | null>(null);

  // Wait for the person to finish typing the full location before showing a
  // price, rather than flashing a number after every keystroke.
  useEffect(() => {
    if (!location.trim()) {
      setPrice(null);
      return;
    }
    const handle = setTimeout(() => {
      setPrice(Math.random() * 20 + 8);
    }, 500);
    return () => clearTimeout(handle);
  }, [location]);

  function handleRequest() {
    if (!location.trim() || price === null) return;
    // No real dispatch API yet — auto-confirm locally for now.
    setRequested(true);
  }

  function handleReset() {
    setRequested(false);
    setLocation("");
    setPrice(null);
  }

  if (requested) {
    return (
      <div className="app-content uber">
        <div className="uber-confirmed">
          <div className="uber-confirmed-icon">🚗</div>
          <h2>Taxi confirmed</h2>
          <p className="uber-on-way">{username} is on the way.</p>
          <p className="uber-pickup-note">Pickup: {location}</p>
        </div>
        <button className="cta" onClick={handleReset}>
          Request another
        </button>
      </div>
    );
  }

  return (
    <div className="app-content uber">
      <h2>Where to?</h2>
      <input
        placeholder="Enter your location"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />
      {price !== null && (
        <div className="ride-options">
          <div className="ride-option">
            <span>Standard</span>
            <span>£{price.toFixed(2)}</span>
          </div>
        </div>
      )}
      <button className="cta" disabled={!location.trim() || price === null} onClick={handleRequest}>
        Request a taxi
      </button>
    </div>
  );
}

function SwiftCorporateContent() {
  const services = [
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

  const stats = [
    { value: "300+", label: "Companies served" },
    { value: "£120M", label: "Client revenue supported" },
    { value: "12", label: "Years in business" },
  ];

  return (
    <div className="app-content swift">
      <div className="swift-hero">
        <div className="swift-hero-badge">SWIFT CORPORATE</div>
        <h2 className="swift-motto">Helping Your Company Grow</h2>
        <p className="swift-hero-sub">
          Swift Corporate partners with ambitious businesses to plan, staff, and scale — with a
          dedicated team behind every stage of the journey.
        </p>
      </div>

      <div className="swift-stats">
        {stats.map((s) => (
          <div className="swift-stat" key={s.label}>
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="section">
        <h3>What we do</h3>
        <div className="swift-services">
          {services.map((s) => (
            <div className="swift-service-card" key={s.title}>
              <div className="swift-service-icon">{s.icon}</div>
              <strong>{s.title}</strong>
              <p>{s.copy}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="section swift-contact">
        <h3>Ready to grow?</h3>
        <p>Get in touch with our team and we'll walk you through how Swift Corporate can help.</p>
        <a
          className="app-content-cta-link"
          href="https://discord.gg/93FQDz6Uk"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button className="cta">Contact us</button>
        </a>
      </div>
    </div>
  );
}

function MapsContent() {
  return (
    <div className="app-content maps">
      <div className="map-toolbar">
        <input placeholder="Search Maps" />
      </div>
      <div className="map-canvas">
        <div className="map-pin">📍</div>
        <div className="map-grid" />
      </div>
    </div>
  );
}

function PsRollsContent() {
  const practiceAreas = [
    {
      icon: "🏢",
      title: "Corporate Law",
      copy: "Advising businesses across Westbridge on structure, contracts, and disputes.",
    },
    {
      icon: "⚖️",
      title: "Criminal Law",
      copy: "Robust representation for criminal matters, from first hearing through to trial.",
    },
    {
      icon: "📄",
      title: "Employment Law",
      copy: "Guidance for both employers and employees on contracts, disputes, and tribunals.",
    },
  ];

  return (
    <div className="app-content ps-rolls">
      <div className="rolls-hero">
        <div className="rolls-hero-badge">C&amp;M ROLLS</div>
        <h2 className="rolls-motto">"Where Justice Lays"</h2>
        <p className="rolls-hero-sub">
          A private law firm operating within Westbridge, catered towards corporate law,
          criminal law, and employment law.
        </p>
      </div>

      <div className="section">
        <h3>Practice areas</h3>
        <div className="rolls-services">
          {practiceAreas.map((p) => (
            <div className="rolls-service-card" key={p.title}>
              <div className="rolls-service-icon">{p.icon}</div>
              <strong>{p.title}</strong>
              <p>{p.copy}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>Job openings</h3>
        <p>
          We have a multitude of job openings available if you wish to take them, as well as
          being open to taking on new cases too.
        </p>
        <p>
          We're also offering trainee contracts for those wanting to get into PS Law and working
          within the courts, but just can't seem to find their foothold.
        </p>
      </div>

      <div className="section">
        <h3>Taking new cases</h3>
        <p>
          Our doors are open to taking a whole plethora of cases, with a wide array of
          solicitors and barristers — some who sit on the King's Bench.
        </p>
      </div>

      <div className="section rolls-contact">
        <h3>Any questions?</h3>
        <p>Feel free to open a ticket and a member of our team will be with you.</p>
        <a
          className="app-content-cta-link"
          href="https://discord.gg/crjrGHbqc"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button className="cta">Open a ticket</button>
        </a>
      </div>
    </div>
  );
}

function BlumeContent() {
  return <div className="app-content blume" />;
}

export function AppContent({
  id,
  username,
  avatarUrl,
}: {
  id: AppId;
  username: string;
  avatarUrl: string | null;
}) {
  switch (id) {
    case "tfl":
      return <TflContent />;
    case "uber":
      return <UberContent username={username} />;
    case "swiftCorporate":
      return <SwiftCorporateContent />;
    case "maps":
      return <MapsContent />;
    case "psRolls":
      return <PsRollsContent />;
    case "royalFamily":
      return <RoyalFamilyApp />;
    case "blume":
      return <BlumeContent />;
    case "instagram":
      return <InstagramApp username={username} />;
    case "messages":
      return <MessagesApp username={username} avatarUrl={avatarUrl} />;
    case "backgrounds":
      return <BackgroundsApp />;
    default:
      return <div className="app-content">Coming soon</div>;
  }
}
