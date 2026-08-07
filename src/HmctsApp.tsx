import { useEffect, useRef, useState } from "react";
import { getChargeName } from "./pncCharges";

type HmctsPanel = "search" | "chat" | "cases" | "lrr" | "publicRecords" | "personnel";

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
    label: "Case and Docket Management",
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
  const [showPreviousPlates, setShowPreviousPlates] = useState(false);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [newVehicleType, setNewVehicleType] = useState("");
  const [addingVehicle, setAddingVehicle] = useState(false);

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
      setShowPreviousPlates(false);
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
    setShowPreviousPlates(false);
    if (next && history.length === 0) loadHistory();
  }
  function togglePreviousPlates() {
    const next = !showPreviousPlates;
    setShowPreviousPlates(next);
    setShowPreviousPhotos(false);
    if (next && history.length === 0) loadHistory();
  }

  async function handleAddVehicle() {
    if (!result || !newVehicleType.trim()) return;
    setAddingVehicle(true);
    try {
      const res = await fetch("/api/blume-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hmctsAddVehicle", userId: result.userId, vehicleType: newVehicleType.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult((prev) => (prev ? { ...prev, vehicleTags: data.vehicleTags || [] } : prev));
        setNewVehicleType("");
      }
    } finally {
      setAddingVehicle(false);
    }
  }

  async function handleRemoveVehicle(id: string) {
    const res = await fetch("/api/blume-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hmctsRemoveVehicle", id }),
    });
    if (res.ok) {
      const data = await res.json();
      setResult((prev) => (prev ? { ...prev, vehicleTags: data.vehicleTags || [] } : prev));
    }
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

            <div className="hmcts-bgsearch-row">
              <span className="hmcts-bgsearch-label" style={{ marginBottom: 0 }}>
                Equipped plate
              </span>
              <span className="hmcts-bgsearch-row-value">{result.customPlate || "None on file"}</span>
            </div>

            <div className="hmcts-bgsearch-actions">
              <button className="hmcts-bgsearch-link-btn" onClick={togglePreviousPhotos}>
                {showPreviousPhotos ? "Hide previous photos" : "View previous photos"}
              </button>
              <button className="hmcts-bgsearch-link-btn" onClick={togglePreviousPlates}>
                {showPreviousPlates ? "Hide previous plates" : "View previous plates"}
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

            {showPreviousPlates && (
              <div className="hmcts-bgsearch-history-panel">
                {historyLoading ? (
                  <p className="hmcts-bgsearch-muted">Loading…</p>
                ) : history.length === 0 ? (
                  <p className="hmcts-bgsearch-muted">No previous plates cached.</p>
                ) : (
                  <div>
                    {history.map((h) => (
                      <div className="hmcts-bgsearch-history-row" key={h.id}>
                        <span>{h.customPlate || "—"}</span>
                        <span className="hmcts-bgsearch-history-meta">
                          {new Date(h.createdAt).toLocaleString()} · searched by {h.searchedByUsername}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="hmcts-bgsearch-section">
              <span className="hmcts-bgsearch-label">Known vehicles</span>
              <div className="hmcts-bgsearch-chip-list">
                {result.vehicleTags.length === 0 && <p className="hmcts-bgsearch-muted">None tagged yet.</p>}
                {result.vehicleTags.map((v) => (
                  <div className="hmcts-bgsearch-chip" key={v.id}>
                    <span>{v.vehicleType}</span>
                    <button onClick={() => handleRemoveVehicle(v.id)} title="Remove">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="hmcts-bgsearch-vehicle-form">
                <input
                  placeholder="Add a known vehicle type…"
                  value={newVehicleType}
                  onChange={(e) => setNewVehicleType(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !addingVehicle) handleAddVehicle();
                  }}
                />
                <button
                  className="hmcts-bgsearch-btn"
                  disabled={!newVehicleType.trim() || addingVehicle}
                  onClick={handleAddVehicle}
                >
                  Add
                </button>
              </div>
            </div>

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
}

function InternalMessagingPanel({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<HmctsMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
            <div className="hmcts-chat-message" key={m.id}>
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
            </div>
          ))}
        </div>
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
  createdByUsername: string;
  createdAt: number;
}

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

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
            Case and Docket Management
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

        {loading ? (
          <p className="hmcts-bgsearch-muted">Loading…</p>
        ) : cases.length === 0 ? (
          <p className="hmcts-bgsearch-muted">No cases filed yet.</p>
        ) : (
          <div className="hmcts-case-list">
            {cases.map((c) => {
              const expanded = expandedIds.has(c.id);
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
                  {expanded && (
                    <div className="hmcts-case-card-body">
                      {c.subjectUsername && <p className="hmcts-bgsearch-muted">Subject: {c.subjectUsername}</p>}
                      {c.info && <p>{c.info}</p>}
                      {c.photos.length > 0 && (
                        <div className="hmcts-bgsearch-photo-grid">
                          {c.photos.map((p, i) => (
                            <a href={p.url} target="_blank" rel="noreferrer" key={i}>
                              <img src={p.url} alt={p.name} className="hmcts-case-photo" />
                            </a>
                          ))}
                        </div>
                      )}
                      {c.files.length > 0 && (
                        <div className="hmcts-case-file-list">
                          {c.files.map((f, i) => (
                            <a href={f.url} target="_blank" rel="noreferrer" key={i}>
                              {f.name}
                            </a>
                          ))}
                        </div>
                      )}
                      <span className="hmcts-bgsearch-history-meta">
                        Filed by {c.createdByUsername} · {formatDateTimeNoSeconds(c.createdAt)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
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

  return (
    <div className="hmcts-bgsearch-view">
      <button className="hmcts-back" onClick={onBack}>
        ← Back
      </button>
      <div className="hmcts-bgsearch-card">
        <h4 className="hmcts-bgsearch-title">Public Records</h4>
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

export function HmctsApp() {
  const [stage, setStage] = useState<"signin" | "authenticating" | "dashboard">("signin");
  const [typedName] = useState(randomMaskedName);
  const [revealCount, setRevealCount] = useState(0);
  const [ranked, setRanked] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [activeTile, setActiveTile] = useState<HmctsTile | null>(null);
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
          <div className="hmcts-brand">
            <img src="/icons/royal-coat-of-arms.png" alt="" />
            <span>eJudiciary</span>
          </div>
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
                  <p className="hmcts-search-group-label">Case and Docket Management</p>
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
          <InternalMessagingPanel onBack={() => setActiveTile(null)} />
        ) : activeTile.panel === "cases" ? (
          <CaseDocketPanel onBack={() => setActiveTile(null)} />
        ) : activeTile.panel === "lrr" ? (
          <LrrPanel onBack={() => setActiveTile(null)} canEdit={canEdit} />
        ) : activeTile.panel === "publicRecords" ? (
          <PublicRecordsPanel onBack={() => setActiveTile(null)} />
        ) : activeTile.panel === "personnel" ? (
          <PersonnelDirectoryPanel onBack={() => setActiveTile(null)} />
        ) : (
          <div className="hmcts-tile-detail">
            <button className="hmcts-back" onClick={() => setActiveTile(null)}>
              ← Back
            </button>
            <h3>{activeTile.label}</h3>
            <p>{activeTile.detail || "This service isn't available in the current build. Check back soon."}</p>
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
              <span className="hmcts-tile-glyph">{tile.glyph}</span>
              <span className="hmcts-tile-label">{tile.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
