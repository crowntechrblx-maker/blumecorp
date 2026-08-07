import { useEffect, useRef, useState } from "react";
import { getChargeName } from "./pncCharges";

interface HmctsTile {
  id: string;
  label: string;
  color: string;
  glyph: string;
  locked?: boolean;
  editable?: boolean;
  external?: string;
  detail?: string;
  search?: boolean;
}

const TILES: HmctsTile[] = [
  {
    id: "backgroundSearches",
    label: "Background Searches",
    color: "#1b2a4a",
    glyph: "BGS",
    locked: true,
    search: true,
  },
  {
    id: "caseDocket",
    label: "Case and Docket Management",
    color: "#7a0d0d",
    glyph: "CDM",
    locked: true,
    editable: true,
    detail: "Links to active court schedules, electronic filing systems, and case tracking workflows.",
  },
  {
    id: "legalResearch",
    label: "Legal Research Repositories",
    color: "#5c2d91",
    glyph: "LRR",
    locked: true,
    editable: true,
    detail: "Internal databases for local court rules, bench books, precedent decisions, and statutory updates.",
  },
  {
    id: "personnelDirectory",
    label: "Personnel Directory",
    color: "#038387",
    glyph: "PD",
    locked: true,
    editable: true,
    detail: "Contact lists, role descriptions, and organizational charts for judges, clerks, and administrative staff.",
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
  const [restricted, setRestricted] = useState(false);
  const restrictedTimer = useRef<number | null>(null);

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

  function handleTileClick(tile: HmctsTile) {
    if (tile.locked && !ranked) {
      setRestricted(true);
      if (restrictedTimer.current) window.clearTimeout(restrictedTimer.current);
      restrictedTimer.current = window.setTimeout(() => setRestricted(false), 2400);
      return;
    }
    if (tile.external) {
      window.open(tile.external, "_blank", "noreferrer");
      return;
    }
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
        <input className="hmcts-topbar-search" placeholder="Search this site" readOnly />
      </div>

      {activeTile ? (
        activeTile.search ? (
          <BackgroundSearchPanel onBack={() => setActiveTile(null)} />
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
        <>
          <div className="hmcts-tile-grid">
            {TILES.map((tile) => {
              const locked = !!tile.locked && !ranked;
              return (
                <button
                  key={tile.id}
                  className={`hmcts-tile${locked ? " hmcts-tile-locked" : ""}`}
                  style={{ background: tile.color }}
                  onClick={() => handleTileClick(tile)}
                >
                  {locked && <span className="hmcts-tile-lock">🔒</span>}
                  <span className="hmcts-tile-glyph">{tile.glyph}</span>
                  <span className="hmcts-tile-label">{tile.label}</span>
                </button>
              );
            })}
          </div>
          {restricted && (
            <p className="hmcts-restricted-note">
              Restricted — this service requires a recognised judiciary rank.
            </p>
          )}
        </>
      )}
    </div>
  );
}
