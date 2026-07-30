import { useEffect, useState } from "react";
import { CustomSelect } from "./CustomSelect";
import { useFadingError } from "./useFadingError";

interface RedlineGroup {
  id: number;
  name: string;
  tier: "red" | "white";
  category?: string;
}

interface RedlinePerson {
  userId: string;
  username: string;
  avatarUrl: string | null;
  groups: RedlineGroup[];
}

interface RedlinePunishment {
  id: string;
  targetUserId: string;
  targetUsername: string;
  type: string;
  details: string;
  serviceGroupId: number;
  serviceGroupName: string;
  addedByUserId: string;
  addedByUsername: string;
  createdAt: number;
}

interface RedlineWhitelistEntry {
  userId: string;
  username: string;
  addedByUsername: string;
  addedAt: number;
}

const PUNISHMENT_TYPES = ["Warning", "Suspension", "Demotion", "Termination", "Ban", "Note"];

function formatDateTime(value: number): string {
  const d = new Date(value);
  return `${d.toLocaleDateString()}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function RedlineApp({ username }: { username: string }) {
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [whitelist, setWhitelist] = useState<RedlineWhitelistEntry[]>([]);

  const [services, setServices] = useState<RedlineGroup[]>([]);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const { error: searchError, setError: setSearchError } = useFadingError();
  const [person, setPerson] = useState<RedlinePerson | null>(null);

  const [punishments, setPunishments] = useState<RedlinePunishment[]>([]);
  const [punishmentsLoading, setPunishmentsLoading] = useState(false);

  const [punishmentType, setPunishmentType] = useState(PUNISHMENT_TYPES[0]);
  const [punishmentDetails, setPunishmentDetails] = useState("");
  const [punishmentServiceId, setPunishmentServiceId] = useState("");
  const [submittingPunishment, setSubmittingPunishment] = useState(false);
  const { error: punishmentError, setError: setPunishmentError } = useFadingError();

  const [showAddAccess, setShowAddAccess] = useState(false);
  const [newAccessUsername, setNewAccessUsername] = useState("");
  const [addingAccess, setAddingAccess] = useState(false);
  const { error: addAccessError, setError: setAddAccessError } = useFadingError();
  const [removingAccessId, setRemovingAccessId] = useState<string | null>(null);

  async function loadAccess() {
    setLoadingAccess(true);
    try {
      const res = await fetch("/api/blume-content?type=redline");
      const data = await res.json();
      setCanAccess(!!data.canAccess);
      setIsSuperUser(!!data.isSuperUser);
      setWhitelist(data.whitelist || []);
    } finally {
      setLoadingAccess(false);
    }
  }

  async function loadServices() {
    try {
      const res = await fetch("/api/blume-search?redlineMyServices=1");
      if (!res.ok) return;
      const data = await res.json();
      setServices(data.services || []);
    } catch {
    }
  }

  useEffect(() => {
    loadAccess();
  }, []);

  useEffect(() => {
    if (canAccess) loadServices();
  }, [canAccess]);

  useEffect(() => {
    if (services.length > 0 && !punishmentServiceId) {
      setPunishmentServiceId(String(services[0].id));
    }
  }, [services]);

  async function loadPunishments(userId: string) {
    setPunishmentsLoading(true);
    try {
      const res = await fetch(`/api/blume-content?type=redline&target=${encodeURIComponent(userId)}`);
      const data = await res.json();
      setPunishments(data.punishments || []);
    } finally {
      setPunishmentsLoading(false);
    }
  }

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    setPerson(null);
    setPunishments([]);
    try {
      const res = await fetch(`/api/blume-search?redlineSearch=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setSearchError(await res.text());
        return;
      }
      const data: RedlinePerson = await res.json();
      setPerson(data);
      await loadPunishments(data.userId);
    } catch {
      setSearchError("Couldn't reach Redline search.");
    } finally {
      setSearching(false);
    }
  }

  async function handleAddPunishment() {
    if (!person || !punishmentDetails.trim() || !punishmentServiceId) return;
    setSubmittingPunishment(true);
    setPunishmentError(null);
    try {
      const res = await fetch("/api/blume-content?type=redline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addPunishment",
          targetUserId: person.userId,
          targetUsername: person.username,
          type: punishmentType,
          details: punishmentDetails.trim(),
          serviceGroupId: punishmentServiceId,
        }),
      });
      if (!res.ok) {
        setPunishmentError(await res.text());
        return;
      }
      setPunishmentDetails("");
      await loadPunishments(person.userId);
    } catch {
      setPunishmentError("Couldn't reach Redline.");
    } finally {
      setSubmittingPunishment(false);
    }
  }

  async function handleAddAccess() {
    if (!newAccessUsername.trim()) return;
    setAddingAccess(true);
    setAddAccessError(null);
    try {
      const res = await fetch("/api/blume-content?type=redline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addWhitelist", username: newAccessUsername.trim() }),
      });
      if (!res.ok) {
        setAddAccessError(await res.text());
        return;
      }
      setNewAccessUsername("");
      await loadAccess();
    } catch {
      setAddAccessError("Couldn't reach Redline.");
    } finally {
      setAddingAccess(false);
    }
  }

  async function handleRemoveAccess(userId: string) {
    setRemovingAccessId(userId);
    try {
      await fetch("/api/blume-content?type=redline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeWhitelist", userId }),
      });
      await loadAccess();
    } finally {
      setRemovingAccessId(null);
    }
  }

  if (loadingAccess) {
    return <div className="redline-app redline-loading">Loading…</div>;
  }

  if (!canAccess) {
    return (
      <div className="redline-app redline-restricted">
        <div className="redline-restricted-card">
          <h2>Access restricted</h2>
          <p>You aren't cleared to use Redline. Contact a Redline administrator for access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="redline-app">
      <div className="redline-topbar">
        <span className="redline-title">Redline</span>
        {isSuperUser && (
          <button className="redline-add-access-btn" onClick={() => setShowAddAccess(true)}>
            +
          </button>
        )}
      </div>

      <div className="redline-search-row">
        <input
          className="redline-search-input"
          placeholder="Search a username…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !searching) handleSearch();
          }}
        />
        <button
          className="redline-cta-btn"
          disabled={!query.trim() || searching}
          onClick={handleSearch}
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>
      {searchError && <p className="redline-error">{searchError}</p>}

      {person && (
        <div className="redline-person-card">
          <div className="redline-person-header">
            {person.avatarUrl ? (
              <img className="redline-person-avatar" src={person.avatarUrl} alt="" />
            ) : (
              <div className="redline-person-avatar redline-person-avatar-empty" />
            )}
            <div className="redline-person-identity">
              <span className="redline-person-username">{person.username}</span>
              <span className="redline-person-userid">User ID: {person.userId}</span>
            </div>
          </div>

          <div className="redline-person-section">
            <span className="redline-person-label">Groups</span>
            {person.groups.length === 0 ? (
              <p className="redline-muted">No relevant group memberships found.</p>
            ) : (
              <div className="redline-group-list">
                {person.groups.map((g) => (
                  <span
                    key={g.id}
                    className={`redline-group-chip ${g.tier === "red" ? "redline-group-red" : ""}`}
                  >
                    {g.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="redline-person-section">
            <span className="redline-person-label">Log an entry</span>
            {services.length === 0 ? (
              <p className="redline-muted">
                You aren't confirmed as a member of any recognized service, so you can't log entries.
              </p>
            ) : (
              <div className="redline-add-punishment-form">
                <CustomSelect
                  className="redline-type-select"
                  value={punishmentType}
                  onChange={setPunishmentType}
                  options={PUNISHMENT_TYPES.map((t) => ({ value: t, label: t }))}
                />
                <CustomSelect
                  className="redline-service-select"
                  value={punishmentServiceId}
                  onChange={setPunishmentServiceId}
                  options={services.map((s) => ({
                    value: String(s.id),
                    label: s.name,
                    tone: s.tier,
                  }))}
                />
                <textarea
                  className="redline-details-input"
                  placeholder="Details…"
                  value={punishmentDetails}
                  onChange={(e) => setPunishmentDetails(e.target.value)}
                />
                <button
                  className="redline-cta-btn"
                  disabled={!punishmentDetails.trim() || submittingPunishment}
                  onClick={handleAddPunishment}
                >
                  {submittingPunishment ? "Logging…" : "Log entry"}
                </button>
              </div>
            )}
            {punishmentError && <p className="redline-error">{punishmentError}</p>}
          </div>

          <div className="redline-person-section">
            <span className="redline-person-label">History</span>
            {punishmentsLoading ? (
              <p className="redline-muted">Loading…</p>
            ) : punishments.length === 0 ? (
              <p className="redline-muted">No entries on file.</p>
            ) : (
              <div className="redline-punishment-list">
                {punishments.map((p) => (
                  <div key={p.id} className="redline-punishment-card">
                    <div className="redline-punishment-head">
                      <span className="redline-punishment-type">{p.type}</span>
                      <span className="redline-punishment-service">{p.serviceGroupName}</span>
                    </div>
                    <p className="redline-punishment-details">{p.details}</p>
                    <span className="redline-punishment-meta">
                      Logged by {p.addedByUsername} on {formatDateTime(p.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showAddAccess && (
        <div className="redline-modal-backdrop" onClick={() => setShowAddAccess(false)}>
          <div className="redline-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Redline access</h3>
            <div className="redline-add-access-form">
              <input
                placeholder="Roblox username…"
                value={newAccessUsername}
                onChange={(e) => setNewAccessUsername(e.target.value)}
              />
              <button
                className="redline-cta-btn"
                disabled={!newAccessUsername.trim() || addingAccess}
                onClick={handleAddAccess}
              >
                {addingAccess ? "Adding…" : "Add"}
              </button>
            </div>
            {addAccessError && <p className="redline-error">{addAccessError}</p>}
            <div className="redline-access-list">
              {whitelist.length === 0 ? (
                <p className="redline-muted">No additional people have been granted access.</p>
              ) : (
                whitelist.map((w) => (
                  <div key={w.userId} className="redline-access-row">
                    <span>{w.username}</span>
                    <button
                      className="redline-remove-access-btn"
                      disabled={removingAccessId === w.userId}
                      onClick={() => handleRemoveAccess(w.userId)}
                    >
                      {removingAccessId === w.userId ? "…" : "Remove"}
                    </button>
                  </div>
                ))
              )}
            </div>
            <button className="redline-modal-close" onClick={() => setShowAddAccess(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      <p className="redline-footer-note">Signed in as {username}</p>
    </div>
  );
}
