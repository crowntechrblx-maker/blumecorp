import { useEffect, useRef, useState } from "react";
import { getChargeName } from "./pncCharges";
import { ImageLightbox, isImageFile } from "./ImageLightbox";

type HmctsPanel = "search" | "chat" | "cases" | "lrr" | "publicRecords" | "personnel" | "prRequests";

interface HmctsTile {
  id: string;
  label: string;
  color: string;
  glyph: string;
  locked?: boolean;
  editorOnly?: boolean;
  editable?: boolean;
  external?: string;
  detail?: string;
  panel?: HmctsPanel;
}

const TILES: HmctsTile[] = [
  {
    id: "backgroundSearches",
    label: "Background Searches",
    color: "#1b2a4a",
    glyph: "BGS",
    locked: true,
    panel: "search",
  },
  {
    id: "internalMessaging",
    label: "Internal Messaging",
    color: "#5c2d91",
    glyph: "MSG",
    editorOnly: true,
    panel: "chat",
  },
  {
    id: "caseDocket",
    label: "Cases & Citations",
    color: "#7a0d0d",
    glyph: "CDM",
    editorOnly: true,
    panel: "cases",
  },
  {
    id: "legalResearch",
    label: "Legal Research Repositories",
    color: "#5c2d91",
    glyph: "LRR",
    locked: true,
    panel: "lrr",
  },
  {
    id: "personnelDirectory",
    label: "Personnel Directory",
    color: "#038387",
    glyph: "PD",
    panel: "personnel",
  },
  {
    id: "publicRecords",
    label: "Public Records",
    color: "#498205",
    glyph: "PR",
    panel: "publicRecords",
  },
];

function HmctsTileIcon({ id }: { id: string }) {
  const common = {
    className: "hmcts-tile-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#fff",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (id) {
    case "backgroundSearches":
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <line x1="15.3" y1="15.3" x2="20.5" y2="20.5" />
        </svg>
      );
    case "internalMessaging":
      return (
        <svg {...common}>
          <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" />
          <line x1="7.5" y1="9" x2="16.5" y2="9" />
          <line x1="7.5" y1="12" x2="13.5" y2="12" />
        </svg>
      );
    case "caseDocket":
      return (
        <svg {...common}>
          <path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h4l1.8 2H19a1.5 1.5 0 0 1 1.5 1.5V17A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z" />
        </svg>
      );
    case "legalResearch":
      return (
        <svg {...common}>
          <path d="M12 5.5c-1.8-1-4-1.5-6-1.5v13.5c2 0 4.2.5 6 1.5" />
          <path d="M12 5.5c1.8-1 4-1.5 6-1.5v13.5c-2 0-4.2.5-6 1.5" />
          <line x1="12" y1="5.5" x2="12" y2="19" />
        </svg>
      );
    case "personnelDirectory":
      return (
        <svg {...common}>
          <circle cx="9" cy="8.5" r="3" />
          <path d="M3.5 19c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2" />
          <circle cx="17" cy="8" r="2.2" />
          <path d="M15.2 13.8c2.2.3 3.8 2.2 3.8 4.6" />
        </svg>
      );
    case "publicRecords":
      return (
        <svg {...common}>
          <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
          <path d="M14 3.5V8h4" />
          <line x1="8.5" y1="12.5" x2="15.5" y2="12.5" />
          <line x1="8.5" y1="15.8" x2="15.5" y2="15.8" />
        </svg>
      );
    default:
      return null;
  }
}

const QUOTE =
  '"The rule of law is a fundamental constitutional principle which underpins an open, fair and peaceful society, where citizens and businesses can prosper. Our judges and magistrates are its cornerstone"';

function randomMaskedName(): string {
  const len = 8 + Math.floor(Math.random() * 5);
  return "*".repeat(len);
}

// Same shapes as Blume's Person Search — Background Searches hits the same
// underlying lookup, just gated by HMCTS's ranked tier instead of Blume clearance.
type GroupCategory = "Emergency Services" | "Intelligence" | "IE" | "OCG" | "Other";
const GROUP_CATEGORY_ORDER: GroupCategory[] = [
  "Emergency Services",
  "Intelligence",
  "IE",
  "OCG",
  "Other",
];
function categoryLabel(cat: string): string {
  return cat === "IE" ? "Immigration Enforcement" : cat === "OCG" ? "Organised Crime Group" : cat;
}

interface PersonGroup {
  id: number;
  name: string;
  tier: "red" | "white";
  category?: GroupCategory;
}
interface VehicleTag {
  id: string;
  userId: string;
  vehicleType: string;
  addedByUsername: string;
  createdAt: number;
}
interface KnownFriend {
  userId: string;
  username: string;
  avatarUrl: string | null;
  redGroupNames: string[];
}
interface FormerGroup extends PersonGroup {
  lastSeenAt: number;
}
interface VerifilePunishment {
  id: string;
  type: string;
  details: string;
  serviceGroupName: string;
  addedByUsername: string;
  createdAt: number;
}
interface PersonSearchResult {
  userId: string;
  username: string;
  avatarUrl: string | null;
  customPlate: string | null;
  arrestHistory: unknown;
  groups: PersonGroup[];
  formerGroups?: FormerGroup[];
  vehicleTags: VehicleTag[];
  knownFriends: KnownFriend[];
  apiError: string | null;
  lastSeenOnlineAt: number | null;
  punishments?: VerifilePunishment[];
}
interface HistorySnapshot {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  customPlate: string | null;
  searchedByUsername: string;
  createdAt: number;
}

function formatDateTimeNoSeconds(value: Date | number): string {
  const d = typeof value === "number" ? new Date(value) : value;
  const datePart = d.toLocaleDateString();
  const timePart = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

function formatLastOnline(ts: number): string {
  const diffMs = Math.max(0, Date.now() - ts);
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 24) {
    const h = Math.max(hours, 1);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const ARREST_SHOWN_CAP = 5;
const ARREST_RECENT_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
const ARREST_CHARGE_KEYS = ["chargeIds", "charges", "chargeId", "charge"];
const ARREST_OFFICER_KEYS = ["officer", "arrestedBy", "by", "arrestingOfficer"];
const ARREST_DATE_KEYS = [
  "date",
  "timestamp",
  "createdAt",
  "time",
  "arrestedAt",
  "arrestDate",
  "arrestTime",
  "dateTime",
  "occurredAt",
];

function getFieldCI(obj: Record<string, unknown>, names: string[]): unknown {
  const lowerToKey = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k] as const));
  for (const name of names) {
    const actualKey = lowerToKey.get(name.toLowerCase());
    if (actualKey !== undefined && obj[actualKey] !== undefined) return obj[actualKey];
  }
  return undefined;
}

function normalizeTimestampMs(value: number): number {
  return value > 0 && value < 10_000_000_000 ? value * 1000 : value;
}

function ArrestRecord({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <p className="hmcts-bgsearch-muted">None on file.</p>;
  }
  const list = Array.isArray(data) ? data : [data];
  if (list.length === 0) {
    return <p className="hmcts-bgsearch-muted">None on file.</p>;
  }

  function renderChargeLike(value: unknown): string {
    if (typeof value === "number") return getChargeName(value);
    if (typeof value === "string" && /^\d+$/.test(value)) return getChargeName(value);
    return String(value);
  }

  function extractWhenMs(item: unknown): number | null {
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const when = getFieldCI(obj, ARREST_DATE_KEYS);
      if (typeof when === "number") return normalizeTimestampMs(when);
      if (typeof when === "string") {
        const parsed = Date.parse(when);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    return null;
  }

  function renderItem(item: unknown, key: number) {
    if (typeof item === "number" || typeof item === "string") {
      return (
        <div className="hmcts-bgsearch-arrest-row" key={key}>
          {renderChargeLike(item)}
        </div>
      );
    }
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const chargeField = getFieldCI(obj, ARREST_CHARGE_KEYS);
      const charges = Array.isArray(chargeField)
        ? chargeField.map(renderChargeLike)
        : chargeField !== undefined
          ? [renderChargeLike(chargeField)]
          : [];
      const officer = getFieldCI(obj, ARREST_OFFICER_KEYS);
      const whenMs = extractWhenMs(item);
      const knownKeysLower = new Set(
        [...ARREST_CHARGE_KEYS, ...ARREST_OFFICER_KEYS, ...ARREST_DATE_KEYS].map((k) => k.toLowerCase())
      );
      const rest = Object.entries(obj).filter(([k]) => !knownKeysLower.has(k.toLowerCase()));
      return (
        <div className="hmcts-bgsearch-arrest-row" key={key}>
          {charges.length > 0 && <div className="hmcts-bgsearch-arrest-charges">{charges.join(", ")}</div>}
          <div className="hmcts-bgsearch-arrest-meta">
            {officer !== undefined && <span>Arrested by {String(officer)}</span>}
            {whenMs !== null && <span>{new Date(whenMs).toLocaleString()}</span>}
          </div>
          {rest.length > 0 && charges.length === 0 && (
            <div className="hmcts-bgsearch-arrest-raw">
              {rest.map(([k, v]) => (
                <span key={k}>
                  {k}: {String(v)}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="hmcts-bgsearch-arrest-row" key={key}>
        {String(item)}
      </div>
    );
  }

  const indexed = list.map((item, i) => ({ item, i, whenMs: extractWhenMs(item) }));
  const sorted = [...indexed].sort((a, b) => (b.whenMs ?? -Infinity) - (a.whenMs ?? -Infinity));
  const shown = sorted.slice(0, ARREST_SHOWN_CAP);

  const recentCutoff = Date.now() - ARREST_RECENT_WINDOW_MS;
  const recentCount = indexed.filter((e) => e.whenMs !== null && e.whenMs >= recentCutoff).length;

  return (
    <div>
      {shown.map((e) => renderItem(e.item, e.i))}
      {recentCount > 0 && (
        <div className="hmcts-bgsearch-arrest-row hmcts-bgsearch-arrest-overflow">
          {recentCount} arrest{recentCount === 1 ? "" : "s"} in the last 10 days
        </div>
      )}
    </div>
  );
}

function BackgroundSearchPanel({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PersonSearchResult | null>(null);
  const [usernameCopied, setUsernameCopied] = useState(false);
  const [showPreviousPhotos, setShowPreviousPhotos] = useState(false);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function handleSearch(overrideQuery?: string) {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/blume-search?hmctsBackgroundSearch=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setError(await res.text());
        setResult(null);
        return;
      }
      const data = (await res.json()) as PersonSearchResult;
      setResult(data);
      setQuery(data.username);
      setShowPreviousPhotos(false);
    } catch {
      setError("Couldn't reach the search service.");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    if (!result) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/blume-search?hmctsBackgroundHistory=${encodeURIComponent(result.userId)}`);
      const data = await res.json();
      setHistory(data.history || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  function togglePreviousPhotos() {
    const next = !showPreviousPhotos;
    setShowPreviousPhotos(next);
    if (next && history.length === 0) loadHistory();
  }

  function handleCopyUsername(username: string) {
    navigator.clipboard?.writeText(username).catch(() => {});
    setUsernameCopied(true);
    window.setTimeout(() => setUsernameCopied(false), 1500);
  }

  return (
    <div className="hmcts-bgsearch-view">
      <button className="hmcts-back" onClick={onBack}>
        ← Back
      </button>
      <div className="hmcts-bgsearch-card">
        <h4 className="hmcts-bgsearch-title">Background Searches</h4>
        <div className="hmcts-bgsearch-form">
          <input
            placeholder="Search by name or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handleSearch();
            }}
          />
          <button className="hmcts-bgsearch-btn" disabled={!query.trim() || loading} onClick={() => handleSearch()}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
        {error && <p className="hmcts-bgsearch-error">{error}</p>}
        {result && (
          <div className="hmcts-bgsearch-result">
            <div className="hmcts-bgsearch-head">
              {result.avatarUrl && <img className="hmcts-bgsearch-avatar" src={result.avatarUrl} alt="" />}
              <div>
                <div
                  className="hmcts-bgsearch-name"
                  title="Click to copy username"
                  onClick={() => handleCopyUsername(result.username)}
                >
                  {result.username}
                  {usernameCopied && <span className="hmcts-bgsearch-copied">Copied</span>}
                </div>
                <div className="hmcts-bgsearch-meta-row">
                  <span>ID {result.userId}</span>
                  {result.lastSeenOnlineAt && <span>Last online {formatLastOnline(result.lastSeenOnlineAt)}</span>}
                </div>
              </div>
            </div>

            {result.apiError && <p className="hmcts-bgsearch-error">{result.apiError}</p>}

            <div className="hmcts-bgsearch-actions">
              <button className="hmcts-bgsearch-link-btn" onClick={togglePreviousPhotos}>
                {showPreviousPhotos ? "Hide previous photos" : "View previous photos"}
              </button>
            </div>

            {showPreviousPhotos && (
              <div className="hmcts-bgsearch-history-panel">
                {historyLoading ? (
                  <p className="hmcts-bgsearch-muted">Loading…</p>
                ) : history.length === 0 ? (
                  <p className="hmcts-bgsearch-muted">No previous photos cached.</p>
                ) : (
                  <div className="hmcts-bgsearch-photo-grid">
                    {history.map((h) => (
                      <div className="hmcts-bgsearch-photo-item" key={h.id}>
                        {h.avatarUrl ? <img src={h.avatarUrl} alt="" /> : <div className="hmcts-bgsearch-photo-empty" />}
                        <span>{new Date(h.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="hmcts-bgsearch-section">
              <span className="hmcts-bgsearch-label">Groups</span>
              {result.groups.length === 0 ? (
                <p className="hmcts-bgsearch-muted">No relevant group memberships found.</p>
              ) : (
                <div>
                  {GROUP_CATEGORY_ORDER.map((cat) => {
                    const items = result.groups.filter(
                      (g) => (g.category || (g.tier === "red" ? "OCG" : "Emergency Services")) === cat
                    );
                    if (items.length === 0) return null;
                    return (
                      <div key={cat} className="hmcts-bgsearch-group-category">
                        <span
                          className={`hmcts-bgsearch-label${cat === "IE" || cat === "OCG" ? " hmcts-bgsearch-label-red" : ""}`}
                        >
                          {categoryLabel(cat)}
                        </span>
                        <div className="hmcts-bgsearch-chip-list">
                          {items.map((g) => (
                            <span
                              key={g.id}
                              className={`hmcts-bgsearch-chip${g.tier === "red" ? " hmcts-bgsearch-chip-red" : ""}`}
                            >
                              {g.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {result.formerGroups && result.formerGroups.length > 0 && (
              <div className="hmcts-bgsearch-section">
                <span className="hmcts-bgsearch-label hmcts-bgsearch-label-red">Former membership (last 6 months)</span>
                <div className="hmcts-bgsearch-chip-list">
                  {result.formerGroups.map((g) => (
                    <span key={g.id} className="hmcts-bgsearch-chip hmcts-bgsearch-chip-red">
                      {g.name} — last seen {formatDateTimeNoSeconds(g.lastSeenAt)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.knownFriends.length > 0 && (
              <div className="hmcts-bgsearch-section">
                <span className="hmcts-bgsearch-label">Known friends</span>
                <div className="hmcts-bgsearch-chip-list">
                  {result.knownFriends.map((f) => (
                    <button
                      key={f.userId}
                      className={`hmcts-bgsearch-friend-chip${f.redGroupNames.length > 0 ? " hmcts-bgsearch-friend-chip-red" : ""}`}
                      onClick={() => handleSearch(f.username)}
                      title={f.redGroupNames.length > 0 ? `${f.username} — in ${f.redGroupNames.join(", ")}` : `Search ${f.username}`}
                    >
                      {f.avatarUrl && <img src={f.avatarUrl} alt="" />}
                      <span>{f.username}</span>
                      {f.redGroupNames.length > 0 && <span className="hmcts-bgsearch-friend-tag">{f.redGroupNames[0]}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="hmcts-bgsearch-section">
              <span className="hmcts-bgsearch-label">Arrest history</span>
              <ArrestRecord data={result.arrestHistory} />
            </div>

            <div className="hmcts-bgsearch-section">
              <span className="hmcts-bgsearch-label">Disciplinary record (Verifile)</span>
              {!result.punishments || result.punishments.length === 0 ? (
                <p className="hmcts-bgsearch-muted">None on file.</p>
              ) : (
                <div>
                  {result.punishments.map((p) => (
                    <div className="hmcts-bgsearch-arrest-row" key={p.id}>
                      <div className="hmcts-bgsearch-arrest-charges">
                        {p.type} — {p.serviceGroupName}
                      </div>
                      <div>{p.details}</div>
                      <div className="hmcts-bgsearch-arrest-meta">
                        <span>Logged by {p.addedByUsername}</span>
                        <span>{formatDateTimeNoSeconds(p.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface HmctsMessage {
  id: string;
  fromUserId: string;
  fromUsername: string;
  departments: string[];
  text: string;
  createdAt: number;
  kind?: "publicRecordsRequest";
  requestId?: string;
}

function InternalMessagingPanel({
  onBack,
  onOpenRequest,
}: {
  onBack: () => void;
  onOpenRequest?: (requestId: string) => void;
}) {
  const [messages, setMessages] = useState<HmctsMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  async function loadMessages() {
    try {
      const res = await fetch("/api/blume-content?type=hmctsChat");
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
    }
  }

  useEffect(() => {
    loadMessages();
    const id = window.setInterval(loadMessages, 4000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => setIsAdmin(!!data?.isAdmin))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleDeleteMessage(id: string) {
    setContextMenu(null);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    try {
      await fetch(`/api/blume-content?type=hmctsChat&id=${id}`, { method: "DELETE" });
    } catch {
    }
  }

  async function handleSend() {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/blume-content?type=hmctsChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setText("");
    } catch {
      setError("Couldn't send that message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="hmcts-bgsearch-view">
      <button className="hmcts-back" onClick={onBack}>
        ← Back
      </button>
      <div className="hmcts-bgsearch-card hmcts-chat-card">
        <h4 className="hmcts-bgsearch-title">Internal Messaging</h4>
        <div className="hmcts-chat-messages" ref={listRef}>
          {messages.length === 0 && <p className="hmcts-bgsearch-muted">No messages yet.</p>}
          {messages.map((m) => (
            <div
              className="hmcts-chat-message"
              key={m.id}
              onContextMenu={(e) => {
                if (!isAdmin) return;
                e.preventDefault();
                setContextMenu({ id: m.id, x: e.clientX, y: e.clientY });
              }}
            >
              <div className="hmcts-chat-message-head">
                <span className="hmcts-chat-message-name">{m.fromUsername}</span>
                {m.departments.map((d) => (
                  <span className="hmcts-chat-dept-tag" key={d}>
                    {d}
                  </span>
                ))}
                <span className="hmcts-chat-message-time">{formatDateTimeNoSeconds(m.createdAt)}</span>
              </div>
              <div className="hmcts-chat-message-text">{m.text}</div>
              {m.kind === "publicRecordsRequest" && m.requestId && (
                <button
                  className="hmcts-bgsearch-link-btn"
                  onClick={() => onOpenRequest?.(m.requestId as string)}
                >
                  View Request
                </button>
              )}
            </div>
          ))}
        </div>
        {contextMenu && (
          <div
            className="hmcts-chat-context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => handleDeleteMessage(contextMenu.id)}>Delete</button>
          </div>
        )}
        {error && <p className="hmcts-bgsearch-error">{error}</p>}
        <div className="hmcts-bgsearch-form">
          <input
            placeholder="Message the channel…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !sending) handleSend();
            }}
          />
          <button className="hmcts-bgsearch-btn" disabled={!text.trim() || sending} onClick={handleSend}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

interface HmctsCaseAttachment {
  name: string;
  url: string;
}
interface HmctsCase {
  id: string;
  title: string;
  info: string;
  subjectUserId: string | null;
  subjectUsername: string | null;
  photos: HmctsCaseAttachment[];
  files: HmctsCaseAttachment[];
  isPublic: boolean;
  createdByUserId: string;
  createdByUsername: string;
  createdAt: number;
}

const HMCTS_CASE_PHOTO_LIMIT = 4;
const HMCTS_CASE_FILE_LIMIT = 3;

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(f);
  });
}

function CaseDocketPanel({ onBack }: { onBack: () => void }) {
  const [cases, setCases] = useState<HmctsCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [subjectQuery, setSubjectQuery] = useState("");
  const [info, setInfo] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editInfo, setEditInfo] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [editAddPhotoFiles, setEditAddPhotoFiles] = useState<File[]>([]);
  const [editAddDocFiles, setEditAddDocFiles] = useState<File[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit(c: HmctsCase) {
    setEditingId(c.id);
    setEditTitle(c.title);
    setEditInfo(c.info);
    setEditIsPublic(c.isPublic);
    setEditAddPhotoFiles([]);
    setEditAddDocFiles([]);
    setEditError(null);
    setExpandedIds((prev) => new Set(prev).add(c.id));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleSaveEdit(c: HmctsCase) {
    if (!editTitle.trim()) {
      setEditError("Missing title.");
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const addPhotos = await Promise.all(
        editAddPhotoFiles.map(async (f) => ({ name: f.name, dataUrl: await fileToDataUrl(f) }))
      );
      const addFiles = await Promise.all(
        editAddDocFiles.map(async (f) => ({ name: f.name, dataUrl: await fileToDataUrl(f) }))
      );
      const res = await fetch(`/api/blume-content?type=hmctsCases&id=${encodeURIComponent(c.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), info: editInfo.trim(), isPublic: editIsPublic, addPhotos, addFiles }),
      });
      if (!res.ok) {
        setEditError(await res.text());
        return;
      }
      const updated = await res.json();
      setCases((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setEditingId(null);
    } catch {
      setEditError("Couldn't save changes.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/blume-content?type=hmctsCases&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError(await res.text());
        return;
      }
      setCases((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setDeleteError("Couldn't remove that case.");
    } finally {
      setDeletingId(null);
    }
  }

  async function loadCases() {
    setLoading(true);
    try {
      const res = await fetch("/api/blume-content?type=hmctsCases");
      const data = await res.json();
      setCases(data.cases || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCases();
  }, []);

  async function handleSubmit() {
    if (!title.trim()) {
      setError("Missing title.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const photos = await Promise.all(
        photoFiles.map(async (f) => ({ name: f.name, dataUrl: await fileToDataUrl(f) }))
      );
      const files = await Promise.all(
        docFiles.map(async (f) => ({ name: f.name, dataUrl: await fileToDataUrl(f) }))
      );
      const res = await fetch("/api/blume-content?type=hmctsCases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), info: info.trim(), subjectQuery: subjectQuery.trim(), isPublic, photos, files }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const entry = await res.json();
      setCases((prev) => [entry, ...prev]);
      setTitle("");
      setSubjectQuery("");
      setInfo("");
      setIsPublic(false);
      setPhotoFiles([]);
      setDocFiles([]);
      setShowForm(false);
    } catch {
      setError("Couldn't save that case.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="hmcts-bgsearch-view">
      <button className="hmcts-back" onClick={onBack}>
        ← Back
      </button>
      <div className="hmcts-bgsearch-card">
        <div className="hmcts-case-header">
          <h4 className="hmcts-bgsearch-title" style={{ margin: 0 }}>
            Cases & Citations
          </h4>
          <button className="hmcts-plus-btn" onClick={() => setShowForm((s) => !s)} title="New case">
            +
          </button>
        </div>
        {showForm && (
          <div className="hmcts-case-form">
            <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input
              placeholder="Subject — Roblox username or ID (optional)"
              value={subjectQuery}
              onChange={(e) => setSubjectQuery(e.target.value)}
            />
            <textarea placeholder="Information" value={info} onChange={(e) => setInfo(e.target.value)} rows={4} />
            <label className="hmcts-case-file-label">
              Photos
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setPhotoFiles(Array.from(e.target.files || []).slice(0, 4))}
              />
            </label>
            <label className="hmcts-case-file-label">
              Files
              <input type="file" multiple onChange={(e) => setDocFiles(Array.from(e.target.files || []).slice(0, 3))} />
            </label>
            <label className="hmcts-case-checkbox-label">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              Mark as public (title will be visible via Public Records)
            </label>
            {error && <p className="hmcts-bgsearch-error">{error}</p>}
            <button className="hmcts-bgsearch-btn" disabled={submitting} onClick={handleSubmit}>
              {submitting ? "Saving…" : "File case"}
            </button>
          </div>
        )}

        <div className="hmcts-case-divider" />

        {deleteError && <p className="hmcts-bgsearch-error">{deleteError}</p>}

        {loading ? (
          <p className="hmcts-bgsearch-muted">Loading…</p>
        ) : cases.length === 0 ? (
          <p className="hmcts-bgsearch-muted">No cases filed yet.</p>
        ) : (
          <div className="hmcts-case-list">
            {cases.map((c) => {
              const expanded = expandedIds.has(c.id);
              const isEditing = editingId === c.id;
              const photosLeft = HMCTS_CASE_PHOTO_LIMIT - c.photos.length;
              const filesLeft = HMCTS_CASE_FILE_LIMIT - c.files.length;
              return (
                <div className={`hmcts-case-card${expanded ? " hmcts-case-card-expanded" : ""}`} key={c.id}>
                  <button className="hmcts-case-card-head" onClick={() => toggleExpanded(c.id)}>
                    <span className="hmcts-case-card-title">
                      <span className={`hmcts-case-caret${expanded ? " hmcts-case-caret-open" : ""}`}>▸</span>
                      <strong>{c.title}</strong>
                    </span>
                    <span className={`hmcts-case-visibility${c.isPublic ? " hmcts-case-visibility-public" : ""}`}>
                      {c.isPublic ? "Public" : "Private"}
                    </span>
                  </button>
                  {!expanded && (
                    <span className="hmcts-bgsearch-history-meta hmcts-case-collapsed-meta">
                      {c.subjectUsername ? `Subject: ${c.subjectUsername} · ` : ""}Filed by {c.createdByUsername} ·{" "}
                      {formatDateTimeNoSeconds(c.createdAt)}
                    </span>
                  )}
                  {expanded && !isEditing && (
                    <div className="hmcts-case-card-body">
                      {c.subjectUsername && <p className="hmcts-bgsearch-muted">Subject: {c.subjectUsername}</p>}
                      {c.info && <p className="hmcts-body-text">{c.info}</p>}
                      {c.photos.length > 0 && (
                        <div className="hmcts-bgsearch-photo-grid">
                          {c.photos.map((p, i) => (
                            <button
                              key={i}
                              type="button"
                              className="image-link-thumb-btn"
                              onClick={() => setLightboxUrl(p.url)}
                            >
                              <img src={p.url} alt={p.name} className="image-link-thumb" />
                            </button>
                          ))}
                        </div>
                      )}
                      {c.files.length > 0 && (
                        <div className="hmcts-case-file-list">
                          {c.files.map((f, i) =>
                            isImageFile(f.name) ? (
                              <button
                                key={i}
                                type="button"
                                className="image-link-thumb-btn"
                                onClick={() => setLightboxUrl(f.url)}
                              >
                                <img src={f.url} alt={f.name} className="image-link-thumb" />
                              </button>
                            ) : (
                              <a href={f.url} target="_blank" rel="noreferrer" key={i}>
                                {f.name}
                              </a>
                            )
                          )}
                        </div>
                      )}
                      <span className="hmcts-bgsearch-history-meta">
                        Filed by {c.createdByUsername} · {formatDateTimeNoSeconds(c.createdAt)}
                      </span>
                      <div className="hmcts-case-actions">
                        <button className="hmcts-bgsearch-link-btn" onClick={() => startEdit(c)}>
                          Edit
                        </button>
                        <button
                          className="hmcts-bgsearch-link-btn hmcts-case-delete-btn"
                          disabled={deletingId === c.id}
                          onClick={() => handleDelete(c.id)}
                        >
                          {deletingId === c.id ? "Removing…" : "Remove case"}
                        </button>
                      </div>
                    </div>
                  )}
                  {expanded && isEditing && (
                    <div className="hmcts-case-card-body hmcts-case-form">
                      <input placeholder="Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                      <textarea
                        placeholder="Information"
                        value={editInfo}
                        onChange={(e) => setEditInfo(e.target.value)}
                        rows={4}
                      />
                      {photosLeft > 0 && (
                        <label className="hmcts-case-file-label">
                          Add photos ({photosLeft} more allowed)
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => setEditAddPhotoFiles(Array.from(e.target.files || []).slice(0, photosLeft))}
                          />
                        </label>
                      )}
                      {filesLeft > 0 && (
                        <label className="hmcts-case-file-label">
                          Add files ({filesLeft} more allowed)
                          <input
                            type="file"
                            multiple
                            onChange={(e) => setEditAddDocFiles(Array.from(e.target.files || []).slice(0, filesLeft))}
                          />
                        </label>
                      )}
                      <label className="hmcts-case-checkbox-label">
                        <input type="checkbox" checked={editIsPublic} onChange={(e) => setEditIsPublic(e.target.checked)} />
                        Mark as public (title will be visible via Public Records)
                      </label>
                      {editError && <p className="hmcts-bgsearch-error">{editError}</p>}
                      <div className="hmcts-case-actions">
                        <button className="hmcts-bgsearch-btn" disabled={editSubmitting} onClick={() => handleSaveEdit(c)}>
                          {editSubmitting ? "Saving…" : "Save changes"}
                        </button>
                        <button className="hmcts-bgsearch-link-btn" disabled={editSubmitting} onClick={cancelEdit}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

interface HmctsLrrPost {
  id: string;
  title: string;
  link: string;
  postedByUsername: string;
  createdAt: number;
}

function LrrPanel({ onBack, canEdit }: { onBack: () => void; canEdit: boolean }) {
  const [posts, setPosts] = useState<HmctsLrrPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPosts() {
    setLoading(true);
    try {
      const res = await fetch("/api/blume-content?type=hmctsLrr");
      const data = await res.json();
      setPosts(data.posts || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPosts();
  }, []);

  async function handleSubmit() {
    if (!title.trim() || !link.trim()) {
      setError("Missing title or link.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/blume-content?type=hmctsLrr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), link: link.trim() }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const entry = await res.json();
      setPosts((prev) => [entry, ...prev]);
      setTitle("");
      setLink("");
      setShowForm(false);
    } catch {
      setError("Couldn't save that update.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="hmcts-bgsearch-view">
      <button className="hmcts-back" onClick={onBack}>
        ← Back
      </button>
      <div className="hmcts-bgsearch-card">
        <div className="hmcts-case-header">
          <h4 className="hmcts-bgsearch-title" style={{ margin: 0 }}>
            Legal Research Repositories
          </h4>
          {canEdit && (
            <button className="hmcts-plus-btn" onClick={() => setShowForm((s) => !s)} title="Post an update">
              +
            </button>
          )}
        </div>
        {showForm && canEdit && (
          <div className="hmcts-case-form">
            <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input placeholder="Link (https://…)" value={link} onChange={(e) => setLink(e.target.value)} />
            {error && <p className="hmcts-bgsearch-error">{error}</p>}
            <button className="hmcts-bgsearch-btn" disabled={submitting} onClick={handleSubmit}>
              {submitting ? "Posting…" : "Post update"}
            </button>
          </div>
        )}

        {loading ? (
          <p className="hmcts-bgsearch-muted">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="hmcts-bgsearch-muted">No updates posted yet.</p>
        ) : (
          <div>
            {posts.map((p) => (
              <div className="hmcts-case-card" key={p.id}>
                <a className="hmcts-lrr-link" href={p.link} target="_blank" rel="noreferrer">
                  {p.title}
                </a>
                <span className="hmcts-bgsearch-history-meta">
                  Posted by {p.postedByUsername} · {formatDateTimeNoSeconds(p.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PublicRecordsPanel({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ userId: string; username: string; records: { id: string; title: string; createdAt: number }[] } | null>(
    null
  );

  const [reqUsername, setReqUsername] = useState("");
  const [reqInfo, setReqInfo] = useState("");
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [reqSent, setReqSent] = useState(false);

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/blume-content?type=hmctsPublicRecords&query=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setError(await res.text());
        setResult(null);
        return;
      }
      setResult(await res.json());
    } catch {
      setError("Couldn't reach the records service.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitRequest() {
    if (!reqUsername.trim() || !reqInfo.trim()) return;
    setReqSubmitting(true);
    setReqError(null);
    setReqSent(false);
    try {
      const res = await fetch("/api/blume-content?type=hmctsPublicRecordsRequests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: reqUsername.trim(), requestedInfo: reqInfo.trim() }),
      });
      if (!res.ok) {
        setReqError(await res.text());
        return;
      }
      setReqUsername("");
      setReqInfo("");
      setReqSent(true);
    } catch {
      setReqError("Couldn't send that request.");
    } finally {
      setReqSubmitting(false);
    }
  }

  return (
    <div className="hmcts-bgsearch-view">
      <button className="hmcts-back" onClick={onBack}>
        ← Back
      </button>
      <div className="hmcts-bgsearch-card">
        <h4 className="hmcts-bgsearch-title">Public Records</h4>
        <p className="hmcts-pr-hint">
          Records are made public at the discretion of the Crown Prosecution Service and His Majesty's Courts and
          Tribunal Service. Feel free to request further information by filing a public records request.
        </p>

        <div className="hmcts-case-header">
          <span className="hmcts-bgsearch-label" style={{ marginBottom: 0 }}>
            Public Records Request
          </span>
        </div>
        <div className="hmcts-case-form">
          <input
            placeholder="Username the request is about…"
            value={reqUsername}
            onChange={(e) => setReqUsername(e.target.value)}
          />
          <textarea
            placeholder="What information are you requesting?"
            value={reqInfo}
            onChange={(e) => setReqInfo(e.target.value)}
            rows={3}
          />
          {reqError && <p className="hmcts-bgsearch-error">{reqError}</p>}
          {reqSent && <p className="hmcts-bgsearch-muted">Request sent — MOJ, CPS, and Home Office have been notified.</p>}
          <button
            className="hmcts-bgsearch-btn"
            disabled={!reqUsername.trim() || !reqInfo.trim() || reqSubmitting}
            onClick={handleSubmitRequest}
          >
            {reqSubmitting ? "Sending…" : "Send request"}
          </button>
        </div>

        <div className="hmcts-case-divider" />

        <div className="hmcts-bgsearch-form">
          <input
            placeholder="Search by name or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handleSearch();
            }}
          />
          <button className="hmcts-bgsearch-btn" disabled={!query.trim() || loading} onClick={handleSearch}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
        {error && <p className="hmcts-bgsearch-error">{error}</p>}
        {result && (
          <div className="hmcts-bgsearch-result">
            <p>
              <strong>{result.username}</strong> <span className="hmcts-bgsearch-muted">ID {result.userId}</span>
            </p>
            {result.records.length === 0 ? (
              <p className="hmcts-bgsearch-muted">No public records found.</p>
            ) : (
              <div className="hmcts-bgsearch-chip-list">
                {result.records.map((r) => (
                  <span className="hmcts-bgsearch-chip" key={r.id}>
                    {r.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface HmctsPersonnelEntry {
  userId: string;
  username: string;
  avatarUrl: string | null;
  departments: string[];
}

function PersonnelDirectoryPanel({ onBack }: { onBack: () => void }) {
  const [people, setPeople] = useState<HmctsPersonnelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/blume-content?type=hmctsPersonnel")
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => setPeople(data.personnel || []))
      .catch((e) => setError(e.message || "Couldn't load the directory."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = people.filter((p) => p.username.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="hmcts-bgsearch-view">
      <button className="hmcts-back" onClick={onBack}>
        ← Back
      </button>
      <div className="hmcts-bgsearch-card">
        <h4 className="hmcts-bgsearch-title">Personnel Directory</h4>
        <div className="hmcts-bgsearch-form">
          <input placeholder="Filter by name…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {loading && <p className="hmcts-bgsearch-muted">Loading…</p>}
        {error && <p className="hmcts-bgsearch-error">{error}</p>}
        {!loading && !error && filtered.length === 0 && <p className="hmcts-bgsearch-muted">No personnel found.</p>}
        {!loading && filtered.length > 0 && (
          <div className="hmcts-personnel-grid">
            {filtered.map((p) => (
              <div className="hmcts-personnel-card" key={p.userId}>
                {p.avatarUrl ? (
                  <img className="hmcts-personnel-avatar" src={p.avatarUrl} alt={p.username} />
                ) : (
                  <div className="hmcts-personnel-avatar hmcts-personnel-avatar-blank" />
                )}
                <div className="hmcts-personnel-info">
                  <p className="hmcts-personnel-name">{p.username}</p>
                  <div className="hmcts-personnel-depts">
                    {p.departments.length === 0 ? (
                      <span className="hmcts-personnel-dept-tag hmcts-personnel-dept-none">No department on file</span>
                    ) : (
                      p.departments.map((d) => (
                        <span className="hmcts-personnel-dept-tag" key={d}>
                          {d}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface HmctsPrRequesterGroup {
  id: number;
  name: string;
  category: string;
}

interface HmctsFoiAttachment {
  name: string;
  url: string;
}

interface HmctsPublicRecordsRequest {
  id: string;
  foiYear: number;
  foiNumber: number;
  subjectUsername: string;
  subjectUserId: string;
  requestedInfo: string;
  requesterUserId: string;
  requesterUsername: string;
  requesterGroups: HmctsPrRequesterGroup[];
  status: "pending" | "replied";
  reply?: string;
  replyAttachments?: HmctsFoiAttachment[];
  repliedByUsername?: string;
  repliedAt?: number;
  createdAt: number;
}

function foiReference(r: HmctsPublicRecordsRequest): string {
  return `FOI${r.foiYear}/${r.foiNumber}`;
}

function foiLetterHeader(r: HmctsPublicRecordsRequest): string {
  return `Dear ${r.requesterUsername}\nReference: ${foiReference(r)}\nOur response to your above information request is attached below.`;
}

function foiLetterFooter(username: string): string {
  return `Kind Regards, ${username || "…"}`;
}

function PublicRecordsRequestsPanel({
  onBack,
  focusRequestId,
}: {
  onBack: () => void;
  focusRequestId?: string | null;
}) {
  const [requests, setRequests] = useState<HmctsPublicRecordsRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyFiles, setReplyFiles] = useState<Record<string, File[]>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/blume-content?type=hmctsPublicRecordsRequests")
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => setRequests(data.requests || []))
      .catch((e) => setError(e.message || "Couldn't load requests."))
      .finally(() => setLoading(false));

    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => setCurrentUsername(data?.username || ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!focusRequestId || loading) return;
    const el = document.getElementById(`hmcts-pr-request-${focusRequestId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusRequestId, loading]);

  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function handleReply(r: HmctsPublicRecordsRequest) {
    const body = (replyDrafts[r.id] || "").trim();
    if (!body) return;
    setSubmittingId(r.id);
    setReplyErrors((prev) => ({ ...prev, [r.id]: "" }));
    try {
      const files = replyFiles[r.id] || [];
      const attachments = await Promise.all(
        files.map(async (f) => ({ name: f.name, dataUrl: await fileToDataUrl(f) }))
      );
      const fullReply = `${foiLetterHeader(r)}\n\n${body}\n\n${foiLetterFooter(currentUsername)}`;
      const res = await fetch("/api/blume-content?type=hmctsPublicRecordsRequests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", id: r.id, reply: fullReply, attachments }),
      });
      if (!res.ok) {
        const message = await res.text();
        setReplyErrors((prev) => ({ ...prev, [r.id]: message }));
        return;
      }
      const updated = await res.json();
      setRequests((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch {
      setReplyErrors((prev) => ({ ...prev, [r.id]: "Couldn't send that reply." }));
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleDelete(r: HmctsPublicRecordsRequest) {
    setDeletingId(r.id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/blume-content?type=hmctsPublicRecordsRequests&id=${r.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setDeleteError(await res.text());
        return;
      }
      setRequests((prev) => prev.filter((x) => x.id !== r.id));
    } catch {
      setDeleteError("Couldn't remove that request.");
    } finally {
      setDeletingId(null);
    }
  }

  function handleCopy(r: HmctsPublicRecordsRequest) {
    const text = `eJudiciary has replied to your Public Records request regarding ${r.subjectUsername} (Reference: ${foiReference(
      r
    )}). Check your Westbridge OS messages for the response.`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(r.id);
    window.setTimeout(() => setCopiedId((c) => (c === r.id ? null : c)), 1500);
  }

  return (
    <div className="hmcts-bgsearch-view">
      <button className="hmcts-back" onClick={onBack}>
        ← Back
      </button>
      <div className="hmcts-bgsearch-card">
        <h4 className="hmcts-bgsearch-title">FOI Requests</h4>
        {loading && <p className="hmcts-bgsearch-muted">Loading…</p>}
        {error && <p className="hmcts-bgsearch-error">{error}</p>}
        {deleteError && <p className="hmcts-bgsearch-error">{deleteError}</p>}
        {!loading && !error && requests.length === 0 && <p className="hmcts-bgsearch-muted">No requests yet.</p>}
        <div className="hmcts-case-list">
          {requests.map((r) => (
            <div
              className={`hmcts-case-card${focusRequestId === r.id ? " hmcts-pr-request-focused" : ""}`}
              id={`hmcts-pr-request-${r.id}`}
              key={r.id}
            >
              <div className="hmcts-case-card-head" style={{ cursor: "default" }}>
                <span className="hmcts-case-card-title">
                  <strong>Re: {r.subjectUsername}</strong>
                  <span className="hmcts-bgsearch-muted"> · {foiReference(r)}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className={`hmcts-case-visibility${r.status === "replied" ? " hmcts-case-visibility-public" : ""}`}>
                    {r.status === "replied" ? "Replied" : "Pending"}
                  </span>
                  <button
                    className="hmcts-case-delete-btn"
                    disabled={deletingId === r.id}
                    onClick={() => handleDelete(r)}
                  >
                    {deletingId === r.id ? "Removing…" : "Remove"}
                  </button>
                </span>
              </div>
              <div className="hmcts-case-card-body">
                <span className="hmcts-bgsearch-label" style={{ marginBottom: 0 }}>
                  Request
                </span>
                <p className="hmcts-body-text">{r.requestedInfo}</p>
                <p className="hmcts-bgsearch-muted">
                  Requested by {r.requesterUsername} · {formatDateTimeNoSeconds(r.createdAt)}
                </p>

                <div className="hmcts-case-divider" />

                <span className="hmcts-bgsearch-label" style={{ marginBottom: 0 }}>
                  Response
                </span>
                {r.status === "pending" ? (
                  <>
                    <div className="hmcts-foi-letter">
                      <p className="hmcts-foi-letter-fixed">{foiLetterHeader(r)}</p>
                      <textarea
                        className="hmcts-foi-letter-body"
                        placeholder="Write the response…"
                        value={replyDrafts[r.id] || ""}
                        onChange={(e) => {
                          setReplyDrafts((prev) => ({ ...prev, [r.id]: e.target.value }));
                          autoGrow(e.target);
                        }}
                        ref={autoGrow}
                        rows={8}
                      />
                      <p className="hmcts-foi-letter-fixed">{foiLetterFooter(currentUsername)}</p>
                    </div>
                    <label className="hmcts-case-file-label">
                      Attach files (optional, up to 5)
                      <input
                        type="file"
                        multiple
                        onChange={(e) =>
                          setReplyFiles((prev) => ({ ...prev, [r.id]: Array.from(e.target.files || []).slice(0, 5) }))
                        }
                      />
                    </label>
                    {replyErrors[r.id] && <p className="hmcts-bgsearch-error">{replyErrors[r.id]}</p>}
                    <button
                      className="hmcts-bgsearch-btn"
                      disabled={!(replyDrafts[r.id] || "").trim() || submittingId === r.id}
                      onClick={() => handleReply(r)}
                    >
                      {submittingId === r.id ? "Sending…" : "Send response"}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="hmcts-foi-letter-sent">{r.reply}</p>
                    {r.replyAttachments && r.replyAttachments.length > 0 && (
                      <div className="hmcts-case-file-list">
                        {r.replyAttachments.map((a, i) =>
                          isImageFile(a.name) ? (
                            <button
                              key={i}
                              type="button"
                              className="image-link-thumb-btn"
                              onClick={() => setLightboxUrl(a.url)}
                            >
                              <img src={a.url} alt={a.name} className="image-link-thumb" />
                            </button>
                          ) : (
                            <a href={a.url} target="_blank" rel="noreferrer" key={i}>
                              {a.name}
                            </a>
                          )
                        )}
                      </div>
                    )}
                    <p className="hmcts-bgsearch-muted">
                      Replied by {r.repliedByUsername} · {r.repliedAt ? formatDateTimeNoSeconds(r.repliedAt) : ""}
                    </p>
                    <div className="hmcts-pr-copy-box">
                      <textarea
                        readOnly
                        rows={1}
                        ref={autoGrow}
                        value={`eJudiciary has replied to your Public Records request regarding ${r.subjectUsername} (Reference: ${foiReference(
                          r
                        )}). Check your Westbridge OS messages for the response.`}
                      />
                      <button className="hmcts-bgsearch-link-btn" onClick={() => handleCopy(r)}>
                        {copiedId === r.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

export function HmctsApp() {
  const [stage, setStage] = useState<"signin" | "authenticating" | "dashboard">("signin");
  const [typedName] = useState(randomMaskedName);
  const [revealCount, setRevealCount] = useState(0);
  const [ranked, setRanked] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [activeTile, setActiveTile] = useState<HmctsTile | null>(null);
  const [prFocusId, setPrFocusId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    tiles: HmctsTile[];
    lrr: HmctsLrrPost[];
    cases: HmctsCase[];
    personnel: HmctsPersonnelEntry[];
  }>({ tiles: [], lrr: [], cases: [], personnel: [] });

  useEffect(() => {
    fetch("/api/blume-content?type=hmcts")
      .then((res) => res.json())
      .then((data) => {
        setRanked(!!data.ranked);
        setCanEdit(!!data.canEdit);
      })
      .catch(() => setRanked(false));
  }, []);

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchResults({ tiles: [], lrr: [], cases: [], personnel: [] });
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const id = window.setTimeout(async () => {
      const tileMatches = TILES.filter((tile) => !isTileLocked(tile) && tile.label.toLowerCase().includes(q));
      let lrr: HmctsLrrPost[] = [];
      let cases: HmctsCase[] = [];
      let personnel: HmctsPersonnelEntry[] = [];
      const jobs: Promise<void>[] = [];
      if (ranked) {
        jobs.push(
          fetch("/api/blume-content?type=hmctsLrr")
            .then((r) => (r.ok ? r.json() : { posts: [] }))
            .then((data) => {
              lrr = ((data.posts || []) as HmctsLrrPost[]).filter((p) => p.title.toLowerCase().includes(q)).slice(0, 5);
            })
            .catch(() => {})
        );
      }
      if (canEdit) {
        jobs.push(
          fetch("/api/blume-content?type=hmctsCases")
            .then((r) => (r.ok ? r.json() : { cases: [] }))
            .then((data) => {
              cases = ((data.cases || []) as HmctsCase[]).filter((c) => c.title.toLowerCase().includes(q)).slice(0, 5);
            })
            .catch(() => {})
        );
      }
      jobs.push(
        fetch("/api/blume-content?type=hmctsPersonnel")
          .then((r) => (r.ok ? r.json() : { personnel: [] }))
          .then((data) => {
            personnel = ((data.personnel || []) as HmctsPersonnelEntry[])
              .filter((p) => p.username.toLowerCase().includes(q))
              .slice(0, 5);
          })
          .catch(() => {})
      );
      await Promise.all(jobs);
      setSearchResults({ tiles: tileMatches, lrr, cases, personnel });
      setSearchLoading(false);
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, ranked, canEdit]);

  useEffect(() => {
    if (stage !== "signin") return;
    if (revealCount >= typedName.length) {
      const done = window.setTimeout(() => setStage("authenticating"), 1400);
      return () => window.clearTimeout(done);
    }
    const id = window.setTimeout(() => setRevealCount((c) => c + 1), 160);
    return () => window.clearTimeout(id);
  }, [revealCount, typedName, stage]);

  useEffect(() => {
    if (stage !== "authenticating") return;
    const id = window.setTimeout(() => setStage("dashboard"), 2200);
    return () => window.clearTimeout(id);
  }, [stage]);

  function isTileLocked(tile: HmctsTile): boolean {
    if (tile.editorOnly) return !canEdit;
    if (tile.locked) return !ranked;
    return false;
  }

  function handleTileClick(tile: HmctsTile) {
    if (tile.external) {
      window.open(tile.external, "_blank", "noreferrer");
      return;
    }
    setActiveTile(tile);
  }

  function goToTile(tile: HmctsTile) {
    setSearchQuery("");
    setSearchOpen(false);
    handleTileClick(tile);
  }

  function goToPanel(panel: HmctsPanel) {
    const tile = TILES.find((t) => t.panel === panel);
    if (!tile) return;
    setSearchQuery("");
    setSearchOpen(false);
    setActiveTile(tile);
  }

  // Not a dashboard tile — only reachable via the "View Request" button on an
  // automated chat message, per spec.
  function openPublicRecordsRequests(requestId?: string) {
    setPrFocusId(requestId || null);
    setActiveTile({ id: "publicRecordsRequests", label: "Public Records Requests", color: "#498205", glyph: "PRR", panel: "prRequests" });
  }

  if (stage === "signin" || stage === "authenticating") {
    return (
      <div className="hmcts-app hmcts-signin">
        <div className="hmcts-signin-left">
          <div className="hmcts-brand hmcts-brand-light">
            <img src="/icons/royal-coat-of-arms.png" alt="" />
            <span>eJudiciary</span>
          </div>
          <div className="hmcts-signin-crest">
            <img src="/icons/royal-coat-of-arms.png" alt="" />
          </div>
          <blockquote className="hmcts-quote">{QUOTE}</blockquote>
          <p className="hmcts-quote-author">Lady Chief Justice of England and Wales</p>
        </div>
        <div className="hmcts-signin-right">
          {stage === "signin" ? (
            <>
              <h2>Sign in</h2>
              <input
                className="hmcts-signin-input"
                readOnly
                value={typedName.slice(0, revealCount) + "@eJudiciary.net"}
              />
              <button className="hmcts-signin-next" disabled={revealCount < typedName.length}>
                Next
              </button>
              <span className="hmcts-signin-dots">•••</span>
            </>
          ) : (
            <div className="hmcts-authenticating">
              <span className="hmcts-spinner" />
              <p>Signing you in…</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="hmcts-app hmcts-dashboard">
      <div className="hmcts-topbar">
        <span className="hmcts-topbar-brand">eJUDICIARY</span>
        <div className="hmcts-topbar-search-wrap">
          <input
            className="hmcts-topbar-search"
            placeholder="Search this site"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
          />
          {searchOpen && searchQuery.trim() && (
            <div className="hmcts-search-dropdown">
              {searchLoading && <p className="hmcts-search-empty">Searching…</p>}
              {!searchLoading &&
                searchResults.tiles.length === 0 &&
                searchResults.personnel.length === 0 &&
                searchResults.lrr.length === 0 &&
                searchResults.cases.length === 0 && <p className="hmcts-search-empty">No matches.</p>}
              {searchResults.tiles.length > 0 && (
                <div className="hmcts-search-group">
                  <p className="hmcts-search-group-label">Services</p>
                  {searchResults.tiles.map((tile) => (
                    <button key={tile.id} className="hmcts-search-result" onMouseDown={() => goToTile(tile)}>
                      {tile.label}
                    </button>
                  ))}
                </div>
              )}
              {searchResults.personnel.length > 0 && (
                <div className="hmcts-search-group">
                  <p className="hmcts-search-group-label">Personnel</p>
                  {searchResults.personnel.map((p) => (
                    <button key={p.userId} className="hmcts-search-result" onMouseDown={() => goToPanel("personnel")}>
                      {p.username}
                    </button>
                  ))}
                </div>
              )}
              {searchResults.lrr.length > 0 && (
                <div className="hmcts-search-group">
                  <p className="hmcts-search-group-label">Legal Research</p>
                  {searchResults.lrr.map((post) => (
                    <button key={post.id} className="hmcts-search-result" onMouseDown={() => goToPanel("lrr")}>
                      {post.title}
                    </button>
                  ))}
                </div>
              )}
              {searchResults.cases.length > 0 && (
                <div className="hmcts-search-group">
                  <p className="hmcts-search-group-label">Cases & Citations</p>
                  {searchResults.cases.map((c) => (
                    <button key={c.id} className="hmcts-search-result" onMouseDown={() => goToPanel("cases")}>
                      {c.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {activeTile ? (
        activeTile.panel === "search" ? (
          <BackgroundSearchPanel onBack={() => setActiveTile(null)} />
        ) : activeTile.panel === "chat" ? (
          <InternalMessagingPanel
            onBack={() => setActiveTile(null)}
            onOpenRequest={(id) => openPublicRecordsRequests(id)}
          />
        ) : activeTile.panel === "cases" ? (
          <CaseDocketPanel onBack={() => setActiveTile(null)} />
        ) : activeTile.panel === "lrr" ? (
          <LrrPanel onBack={() => setActiveTile(null)} canEdit={canEdit} />
        ) : activeTile.panel === "publicRecords" ? (
          <PublicRecordsPanel onBack={() => setActiveTile(null)} />
        ) : activeTile.panel === "personnel" ? (
          <PersonnelDirectoryPanel onBack={() => setActiveTile(null)} />
        ) : activeTile.panel === "prRequests" ? (
          <PublicRecordsRequestsPanel onBack={() => setActiveTile(null)} focusRequestId={prFocusId} />
        ) : (
          <div className="hmcts-tile-detail">
            <button className="hmcts-back" onClick={() => setActiveTile(null)}>
              ← Back
            </button>
            <h3>{activeTile.label}</h3>
            <p className="hmcts-body-text">{activeTile.detail || "This service isn't available in the current build. Check back soon."}</p>
            {activeTile.editable && (
              <p className={`hmcts-edit-access${canEdit ? " hmcts-edit-access-granted" : ""}`}>
                {canEdit
                  ? "You have editing access — Crown Prosecution, Home Office, or Ministry of Justice."
                  : "Editing access is restricted to Crown Prosecution, Home Office, and Ministry of Justice."}
              </p>
            )}
          </div>
        )
      ) : (
        <div className="hmcts-tile-grid">
          {TILES.filter((tile) => !isTileLocked(tile)).map((tile) => (
            <button
              key={tile.id}
              className="hmcts-tile"
              style={{ background: tile.color }}
              onClick={() => handleTileClick(tile)}
            >
              <HmctsTileIcon id={tile.id} />
              <span className="hmcts-tile-label">{tile.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
