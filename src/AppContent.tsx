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

const TFL_STATIONS = [
  { name: "King Edward Station", street: "Commercial Street" },
  { name: "Westbridge Bus Station", street: "Commercial Street" },
  { name: "Clayton Road Station", street: "Chittering Street" },
  { name: "Hilcox Road Station", street: "Guildhall Street" },
  { name: "Matlock Broadway Station", street: "St. James Street" },
  { name: "Shopeton North Railway Station", street: "Tower Road" },
  { name: "Oxbridge Bus Station", street: "Barking Street" },
];

// A handful of generic routes strung between the real stations above — not
// tied to any particular line, just enough to make the board feel alive.
const TFL_BUS_ROUTES = [
  { number: "1", from: "King Edward Station", to: "Oxbridge Bus Station" },
  { number: "7", from: "Westbridge Bus Station", to: "Matlock Broadway Station" },
  { number: "12", from: "Clayton Road Station", to: "Shopeton North Railway Station" },
  { number: "21", from: "Hilcox Road Station", to: "King Edward Station" },
  { number: "34", from: "Oxbridge Bus Station", to: "Clayton Road Station" },
  { number: "9", from: "Matlock Broadway Station", to: "Hilcox Road Station" },
];

function randomBusDelay(): number {
  // Weighted toward running on time, occasionally a real delay.
  return Math.random() < 0.55 ? 0 : Math.floor(Math.random() * 14) + 1;
}

function TflContent() {
  const [delays, setDelays] = useState<number[]>(() => TFL_BUS_ROUTES.map(randomBusDelay));

  useEffect(() => {
    const id = window.setInterval(() => {
      setDelays(TFL_BUS_ROUTES.map(randomBusDelay));
    }, 25000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="app-content tfl">
      <h2>Westbridge Transport</h2>
      <div className="section">
        <h3>Stations</h3>
        <ul className="tfl-station-list">
          {TFL_STATIONS.map((s) => (
            <li key={s.name}>
              <span className="tfl-station-name">{s.name}</span>
              <span className="tfl-station-street">{s.street}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="section">
        <h3>Bus Routes</h3>
        <ul className="tfl-route-list">
          {TFL_BUS_ROUTES.map((r, i) => {
            const delay = delays[i] ?? 0;
            return (
              <li key={r.number}>
                <span className="tfl-route-number">{r.number}</span>
                <span className="tfl-route-path">
                  {r.from} <span aria-hidden="true">→</span> {r.to}
                </span>
                <span className={`tfl-route-delay${delay === 0 ? " tfl-route-on-time" : ""}`}>
                  {delay === 0 ? "On time" : `Delayed ${delay} min`}
                </span>
              </li>
            );
          })}
        </ul>
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
