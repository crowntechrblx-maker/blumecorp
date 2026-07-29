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

const TFL_BUS_ROUTES = [
  { number: "1", from: "King Edward Station", to: "Oxbridge Bus Station" },
  { number: "7", from: "Westbridge Bus Station", to: "Matlock Broadway Station" },
  { number: "12", from: "Clayton Road Station", to: "Shopeton North Railway Station" },
  { number: "21", from: "Hilcox Road Station", to: "King Edward Station" },
  { number: "34", from: "Oxbridge Bus Station", to: "Clayton Road Station" },
  { number: "9", from: "Matlock Broadway Station", to: "Hilcox Road Station" },
];

const TFL_DELAY_BUCKET_MS = 5 * 60 * 1000;

function tflDelayBucket(): number {
  return Math.floor(Date.now() / TFL_DELAY_BUCKET_MS);
}

function busDelayForBucket(bucket: number, routeIndex: number): number {
  const seed = bucket * 1000 + routeIndex;
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  const frac = x - Math.floor(x); // deterministic pseudo-random in [0, 1)
  if (frac < 0.55) return 0; // weighted toward running on time
  return 1 + Math.floor(((frac - 0.55) / 0.45) * 14);
}

function TflContent() {
  const [bucket, setBucket] = useState(tflDelayBucket);

  useEffect(() => {
    const id = window.setInterval(() => {
      setBucket((prev) => {
        const next = tflDelayBucket();
        return next === prev ? prev : next;
      });
    }, 15000);
    return () => window.clearInterval(id);
  }, []);

  const delays = TFL_BUS_ROUTES.map((_, i) => busDelayForBucket(bucket, i));

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

function UberContent() {
  const [location, setLocation] = useState("");
  const [requested, setRequested] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setInitializing(false), 1600);
    return () => clearTimeout(timer);
  }, []);

  if (initializing) {
    return (
      <div className="app-content uber uber-splash">
        <div className="uber-splash-logo">UBER</div>
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
        disabled={requested}
      />
      <button
        className="cta"
        disabled={!location.trim() || requested}
        onClick={() => setRequested(true)}
      >
        Request a taxi
      </button>
      {requested && (
        <p className="uber-not-ready">Uber isn't ready yet. Once it is, we'll be sure to notify you.</p>
      )}
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
      return <UberContent />;
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
