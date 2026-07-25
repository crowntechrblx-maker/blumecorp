import type { AppId } from "./apps";
import { BackgroundsApp } from "./BackgroundsApp";
import { InstagramApp } from "./InstagramApp";
import { Avatar } from "./Avatar";

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

function UberContent() {
  return (
    <div className="app-content uber">
      <h2>Where to?</h2>
      <input placeholder="Enter destination" />
      <div className="ride-options">
        {["UberX", "Comfort", "Black", "XL"].map((r) => (
          <div className="ride-option" key={r}>
            <span>{r}</span>
            <span>£{(Math.random() * 20 + 8).toFixed(2)}</span>
          </div>
        ))}
      </div>
      <button className="cta">Confirm Ride</button>
    </div>
  );
}

function SwiftCorporateContent() {
  return (
    <div className="app-content swift">
      <h2>Corporate Travel Dashboard</h2>
      <div className="stat-row">
        <div className="stat"><strong>128</strong><span>Bookings this month</span></div>
        <div className="stat"><strong>£42,310</strong><span>Spend</span></div>
        <div className="stat"><strong>96%</strong><span>On policy</span></div>
      </div>
      <table>
        <thead><tr><th>Traveller</th><th>Route</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>J. Whitfield</td><td>LHR → JFK</td><td>Confirmed</td></tr>
          <tr><td>A. Osei</td><td>LCY → CDG</td><td>Pending</td></tr>
          <tr><td>R. Patel</td><td>LGW → DXB</td><td>Confirmed</td></tr>
        </tbody>
      </table>
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
  return (
    <div className="app-content ps-rolls">
      <h2>PS C&amp;M Rolls</h2>
      <table>
        <thead><tr><th>Roll No.</th><th>Description</th><th>Qty</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>CM-1042</td><td>Structural steel batch</td><td>24</td><td>Approved</td></tr>
          <tr><td>CM-1043</td><td>Concrete mix record</td><td>12</td><td>In review</td></tr>
          <tr><td>CM-1044</td><td>Welding cert roll</td><td>8</td><td>Approved</td></tr>
        </tbody>
      </table>
      <button>Add new roll</button>
    </div>
  );
}

function RoyalFamilyContent() {
  return (
    <div className="app-content royal">
      <h2>The Royal Family</h2>
      <div className="royal-grid">
        {["The King", "The Queen", "The Prince of Wales", "The Princess of Wales"].map((n) => (
          <div className="royal-card" key={n}>
            <div className="royal-avatar">👤</div>
            <span>{n}</span>
          </div>
        ))}
      </div>
      <div className="section">
        <h3>Latest news</h3>
        <p>Placeholder headline about a royal engagement.</p>
        <p>Placeholder headline about a state visit.</p>
      </div>
    </div>
  );
}

function BlumeContent() {
  return (
    <div className="app-content blume">
      <h2>Blume</h2>
      <div className="blume-products">
        {["Meltdown", "Rose Facial Oil", "Bright Eyed", "Matcha Cleanser"].map((p) => (
          <div className="blume-card" key={p}>
            <div className="blume-swatch" />
            <span>{p}</span>
          </div>
        ))}
      </div>
      <button className="cta">Shop now</button>
    </div>
  );
}

function MessagesContent({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl: string | null;
}) {
  const chats = [
    { name: "Mum", preview: "Call me when you're free x" },
    { name: "Work", preview: "Meeting moved to 3pm" },
    { name: "Alex", preview: "Sounds good, see you then" },
  ];
  return (
    <div className="app-content messages">
      <div className="messages-header">
        <Avatar url={avatarUrl} size={22} />
        <strong>{username}</strong>
      </div>
      <div className="messages-list">
        {chats.map((c) => (
          <div className="message-item" key={c.name}>
            <div className="avatar" />
            <div>
              <strong>{c.name}</strong>
              <p>{c.preview}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="message-thread">
        <div className="bubble incoming">Hey, are we still on for later?</div>
        <div className="bubble outgoing">Yep, see you at 6</div>
      </div>
    </div>
  );
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
      return <UberContent />;
    case "swiftCorporate":
      return <SwiftCorporateContent />;
    case "maps":
      return <MapsContent />;
    case "psRolls":
      return <PsRollsContent />;
    case "royalFamily":
      return <RoyalFamilyContent />;
    case "blume":
      return <BlumeContent />;
    case "instagram":
      return <InstagramApp username={username} />;
    case "messages":
      return <MessagesContent username={username} avatarUrl={avatarUrl} />;
    case "backgrounds":
      return <BackgroundsApp />;
    default:
      return <div className="app-content">Coming soon</div>;
  }
}
