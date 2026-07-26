import { useEffect, useState } from "react";
import type { AppId } from "./apps";
import { BackgroundsApp } from "./BackgroundsApp";
import { InstagramApp } from "./InstagramApp";
import { MessagesApp } from "./MessagesApp";
import { RoyalFamilyApp } from "./RoyalFamilyApp";
import { BlumeApp } from "./BlumeApp";
import { SettingsApp } from "./SettingsApp";
import { PsRollsApp } from "./PsRollsApp";
import { SwiftCorporateApp } from "./SwiftCorporateApp";

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
  const [initializing, setInitializing] = useState(true);

  // Brief branded splash before the app is usable, like Uber's own
  // launch animation — the wordmark scales/fades in, holds briefly, then
  // the real "Where to?" screen takes over.
  useEffect(() => {
    const timer = setTimeout(() => setInitializing(false), 1600);
    return () => clearTimeout(timer);
  }, []);

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

  if (initializing) {
    return (
      <div className="app-content uber uber-splash">
        <div className="uber-splash-logo">UBER</div>
      </div>
    );
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

export function AppContent({
  id,
  username,
  avatarUrl,
  isAdmin,
  onMaximize,
}: {
  id: AppId;
  username: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  onMaximize?: () => void;
}) {
  switch (id) {
    case "tfl":
      return <TflContent />;
    case "uber":
      return <UberContent username={username} />;
    case "swiftCorporate":
      return <SwiftCorporateApp />;
    case "psRolls":
      return <PsRollsApp />;
    case "royalFamily":
      return <RoyalFamilyApp />;
    case "blume":
      return <BlumeApp username={username} onMaximize={onMaximize} />;
    case "instagram":
      return <InstagramApp username={username} isAdmin={isAdmin} />;
    case "messages":
      return <MessagesApp username={username} avatarUrl={avatarUrl} isAdmin={isAdmin} />;
    case "backgrounds":
      return <BackgroundsApp />;
    case "settings":
      return <SettingsApp />;
    default:
      return <div className="app-content">Coming soon</div>;
  }
}
