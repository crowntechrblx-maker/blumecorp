import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import { CustomSelect } from "./CustomSelect";
import { useFadingError } from "./useFadingError";

interface VerifileGroup {
  id: number;
  name: string;
  tier: "red" | "white";
  category?: string;
}

interface VerifilePerson {
  userId: string;
  username: string;
  avatarUrl: string | null;
  fullAvatarUrl?: string | null;
  friendsCount?: number | null;
  followersCount?: number | null;
  createdAt?: string | null;
  groups: VerifileGroup[];
}

interface VerifilePunishment {
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
  canDelete?: boolean;
}

interface VerifileWhitelistEntry {
  userId: string;
  username: string;
  addedByUsername: string;
  addedAt: number;
}

const PUNISHMENT_TYPES = ["Warning", "Suspension", "Demotion", "Termination", "Ban", "Note"];
const REQUEST_ACCESS_URL = "https://discord.gg/DHs9HnQ3JE";

function formatDateTime(value: number): string {
  const d = new Date(value);
  return `${d.toLocaleDateString()}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatDateTimeNoSeconds(value: Date | number): string {
  const d = typeof value === "number" ? new Date(value) : value;
  return `${d.toLocaleDateString()}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatDateForFilename(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function formatAccountAge(createdAt: string | null | undefined): string {
  if (!createdAt) return "Unknown";
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "Unknown";
  const now = new Date();
  let years = now.getFullYear() - created.getFullYear();
  let months = now.getMonth() - created.getMonth();
  if (now.getDate() < created.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  parts.push(`${months} month${months === 1 ? "" : "s"}`);
  return `${parts.join(", ")} (joined ${created.toLocaleDateString()})`;
}

async function loadRemoteImageAsDataUrl(
  url: string
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const format = blob.type.includes("png") ? "PNG" : "JPEG";
    return { dataUrl, format };
  } catch {
    return null;
  }
}

export function VerifileApp({ username }: { username: string }) {
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [whitelist, setWhitelist] = useState<VerifileWhitelistEntry[]>([]);

  const [services, setServices] = useState<VerifileGroup[]>([]);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const { error: searchError, setError: setSearchError } = useFadingError();
  const [person, setPerson] = useState<VerifilePerson | null>(null);

  const [punishments, setPunishments] = useState<VerifilePunishment[]>([]);
  const [punishmentsLoading, setPunishmentsLoading] = useState(false);
  const [removingPunishmentId, setRemovingPunishmentId] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

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
      const res = await fetch("/api/blume-content?type=verifile");
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
      const res = await fetch("/api/blume-search?verifileMyServices=1");
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
      const res = await fetch(`/api/blume-content?type=verifile&target=${encodeURIComponent(userId)}`);
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
      const res = await fetch(`/api/blume-search?verifileSearch=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setSearchError(await res.text());
        return;
      }
      const data: VerifilePerson = await res.json();
      setPerson(data);
      await loadPunishments(data.userId);
    } catch {
      setSearchError("Couldn't reach Verifile search.");
    } finally {
      setSearching(false);
    }
  }

  async function handleAddPunishment() {
    if (!person || !punishmentDetails.trim() || !punishmentServiceId) return;
    setSubmittingPunishment(true);
    setPunishmentError(null);
    try {
      const res = await fetch("/api/blume-content?type=verifile", {
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
      setPunishmentError("Couldn't reach Verifile.");
    } finally {
      setSubmittingPunishment(false);
    }
  }

  async function handleRemovePunishment(id: string) {
    setRemovingPunishmentId(id);
    try {
      await fetch(`/api/blume-content?type=verifile&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (person) await loadPunishments(person.userId);
    } finally {
      setRemovingPunishmentId(null);
    }
  }

  async function generatePersonReport() {
    if (!person) return;
    setGeneratingReport(true);
    try {
      const generatedAt = new Date();
      const photoUrls = [person.avatarUrl, person.fullAvatarUrl].filter(
        (u): u is string => !!u
      );
      const loadedPhotos = (
        await Promise.all(photoUrls.map((u) => loadRemoteImageAsDataUrl(u)))
      ).filter((p): p is { dataUrl: string; format: "PNG" | "JPEG" } => !!p);

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 48;
      const maxWidth = pageWidth - marginX * 2;
      const bottomLimit = pageHeight - 70;
      let y = 56;

      function ensureSpace(lineHeight: number): boolean {
        if (y + lineHeight > bottomLimit) {
          doc.addPage();
          y = 56;
          return true;
        }
        return false;
      }

      function heading(text: string) {
        ensureSpace(30);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(7, 32, 59);
        doc.text(text.toUpperCase(), marginX, y);
        y += 6;
        doc.setDrawColor(200, 200, 200);
        doc.line(marginX, y, pageWidth - marginX, y);
        y += 16;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);
      }

      function line(text: string) {
        const wrapped = doc.splitTextToSize(text, maxWidth) as string[];
        for (const w of wrapped) {
          ensureSpace(14);
          doc.text(w, marginX, y);
          y += 14;
        }
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(7, 32, 59);
      doc.text("VERIFILE IDENTITY RECORD", marginX, y);
      y += 26;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(20, 20, 20);
      doc.text(person.username, marginX, y);
      y += 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text(`User ID: ${person.userId}`, marginX, y);
      y += 20;

      if (loadedPhotos.length > 0) {
        const photoTop = y;
        const photoH = 90;
        let photoX = marginX;
        for (const photo of loadedPhotos) {
          doc.addImage(photo.dataUrl, photo.format, photoX, photoTop, 70, photoH);
          photoX += 82;
        }
        y = photoTop + photoH + 18;
      }

      heading("Account Overview");
      line(`Friends: ${person.friendsCount ?? "Unknown"}`);
      line(`Followers: ${person.followersCount ?? "Unknown"}`);
      line(`Account age: ${formatAccountAge(person.createdAt)}`);
      y += 6;

      heading(`Groups (${person.groups.length})`);
      if (person.groups.length === 0) {
        line("No relevant group memberships found.");
      } else {
        for (const g of person.groups) {
          ensureSpace(14);
          if (g.tier === "red") {
            doc.setTextColor(160, 30, 30);
          } else {
            doc.setTextColor(40, 40, 40);
          }
          doc.text(`•  ${g.name}${g.category ? ` (${g.category})` : ""}`, marginX, y);
          y += 14;
        }
        doc.setTextColor(40, 40, 40);
      }

      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        const footerY = pageHeight - 28;
        doc.setDrawColor(220, 220, 220);
        doc.line(marginX, footerY - 14, pageWidth - marginX, footerY - 14);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(120, 120, 120);
        doc.text("Powered by Blume Corporation", marginX, footerY);
        const generatedText = `Generated by ${username || "an unknown user"} on ${formatDateTimeNoSeconds(generatedAt)}`;
        const textWidth = doc.getTextWidth(generatedText);
        doc.text(generatedText, pageWidth - marginX - textWidth, footerY);
      }

      doc.save(`Verifile-${person.username}-${formatDateForFilename(generatedAt)}.pdf`);
    } finally {
      setGeneratingReport(false);
    }
  }

  async function handleAddAccess() {
    if (!newAccessUsername.trim()) return;
    setAddingAccess(true);
    setAddAccessError(null);
    try {
      const res = await fetch("/api/blume-content?type=verifile", {
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
      setAddAccessError("Couldn't reach Verifile.");
    } finally {
      setAddingAccess(false);
    }
  }

  async function handleRemoveAccess(userId: string) {
    setRemovingAccessId(userId);
    try {
      await fetch("/api/blume-content?type=verifile", {
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
    return <div className="verifile-app verifile-loading">Loading…</div>;
  }

  if (!canAccess) {
    return (
      <div className="verifile-app verifile-landing">
        <div className="verifile-landing-hero">
          <span className="verifile-landing-eyebrow">Blume</span>
          <h2 className="verifile-landing-title">Verifile</h2>
          <p className="verifile-landing-lede">
            Verifile lets whitelisted services confirm who someone is and log conduct against
            their name. Search a Roblox username to see their verified group standing, then
            record warnings, suspensions, or terminations tied to your service and your name.
          </p>
        </div>

        <div className="verifile-landing-example">
          <span className="verifile-landing-example-label">Example lookup</span>
          <div className="verifile-person-card verifile-landing-card">
            <div className="verifile-person-header">
              <img className="verifile-person-avatar" src="/icons/verifile-example-avatar.svg" alt="" />
              <div className="verifile-person-identity">
                <span className="verifile-person-username">harlow_reeves19</span>
                <span className="verifile-person-userid">User ID: 12345678</span>
              </div>
            </div>
            <div className="verifile-person-section">
              <span className="verifile-person-label">Groups</span>
              <div className="verifile-group-list">
                <span className="verifile-group-chip verifile-group-red">Shadow District</span>
              </div>
            </div>
            <div className="verifile-person-section">
              <span className="verifile-person-label">History</span>
              <div className="verifile-punishment-list">
                <div className="verifile-punishment-card">
                  <div className="verifile-punishment-head">
                    <span className="verifile-punishment-type">Ban</span>
                    <span className="verifile-punishment-service">Home Office</span>
                  </div>
                  <p className="verifile-punishment-details">
                    Permanently blacklisted from government groups for NST.
                  </p>
                  <span className="verifile-punishment-meta">Logged by a verified government service member</span>
                </div>
              </div>
            </div>
          </div>
          <span className="verifile-landing-example-note">Illustrative — not a real record.</span>
        </div>

        <div className="verifile-landing-cta">
          <p>Access is by whitelist only. Join the Blume Discord to request it.</p>
          <a
            className="verifile-cta-btn verifile-landing-btn"
            href={REQUEST_ACCESS_URL}
            target="_blank"
            rel="noreferrer"
          >
            Join the Blume Discord
          </a>
        </div>

        <div className="verifile-footer">
          <span className="verifile-footer-note">Signed in as {username}</span>
          <span className="verifile-powered-by">
            <img className="verifile-powered-by-mark" src="/blume-logo.png" alt="" />
            Powered by Blume
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="verifile-app">
      <div className="verifile-topbar">
        <span className="verifile-title">Verifile</span>
        {isSuperUser && (
          <button className="verifile-add-access-btn" onClick={() => setShowAddAccess(true)}>
            +
          </button>
        )}
      </div>

      <div className="verifile-search-row">
        <input
          className="verifile-search-input"
          placeholder="Search a username…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !searching) handleSearch();
          }}
        />
        <button
          className="verifile-cta-btn"
          disabled={!query.trim() || searching}
          onClick={handleSearch}
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>
      {searchError && <p className="verifile-error">{searchError}</p>}

      {person && (
        <div className="verifile-person-card">
          <div className="verifile-person-header">
            {person.avatarUrl ? (
              <img className="verifile-person-avatar" src={person.avatarUrl} alt="" />
            ) : (
              <div className="verifile-person-avatar verifile-person-avatar-empty" />
            )}
            <div className="verifile-person-identity">
              <span className="verifile-person-username">{person.username}</span>
              <span className="verifile-person-userid">User ID: {person.userId}</span>
            </div>
            <button
              className="verifile-print-btn"
              disabled={generatingReport}
              onClick={generatePersonReport}
            >
              {generatingReport ? "Preparing…" : "Print"}
            </button>
          </div>

          <div className="verifile-person-section">
            <span className="verifile-person-label">Groups</span>
            {person.groups.length === 0 ? (
              <p className="verifile-muted">No relevant group memberships found.</p>
            ) : (
              <div className="verifile-group-list">
                {person.groups.map((g) => (
                  <span
                    key={g.id}
                    className={`verifile-group-chip ${g.tier === "red" ? "verifile-group-red" : ""}`}
                  >
                    {g.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="verifile-person-section">
            <span className="verifile-person-label">Log an entry</span>
            {services.length === 0 ? (
              <p className="verifile-muted">
                You aren't confirmed as a member of any recognized service, so you can't log entries.
              </p>
            ) : (
              <div className="verifile-add-punishment-form">
                <CustomSelect
                  className="verifile-type-select"
                  value={punishmentType}
                  onChange={setPunishmentType}
                  options={PUNISHMENT_TYPES.map((t) => ({ value: t, label: t }))}
                />
                <CustomSelect
                  className="verifile-service-select"
                  value={punishmentServiceId}
                  onChange={setPunishmentServiceId}
                  options={services.map((s) => ({
                    value: String(s.id),
                    label: s.name,
                    tone: s.tier,
                  }))}
                />
                <textarea
                  className="verifile-details-input"
                  placeholder="Details…"
                  value={punishmentDetails}
                  onChange={(e) => setPunishmentDetails(e.target.value)}
                />
                <button
                  className="verifile-cta-btn"
                  disabled={!punishmentDetails.trim() || submittingPunishment}
                  onClick={handleAddPunishment}
                >
                  {submittingPunishment ? "Logging…" : "Log entry"}
                </button>
              </div>
            )}
            {punishmentError && <p className="verifile-error">{punishmentError}</p>}
          </div>

          <div className="verifile-person-section">
            <span className="verifile-person-label">History</span>
            {punishmentsLoading ? (
              <p className="verifile-muted">Loading…</p>
            ) : punishments.length === 0 ? (
              <p className="verifile-muted">No entries on file.</p>
            ) : (
              <div className="verifile-punishment-list">
                {punishments.map((p) => (
                  <div key={p.id} className="verifile-punishment-card">
                    <div className="verifile-punishment-head">
                      <span className="verifile-punishment-type">{p.type}</span>
                      <span className="verifile-punishment-service">{p.serviceGroupName}</span>
                    </div>
                    <p className="verifile-punishment-details">{p.details}</p>
                    <div className="verifile-punishment-footer">
                      <span className="verifile-punishment-meta">
                        Logged by {p.addedByUsername} on {formatDateTime(p.createdAt)}
                      </span>
                      {p.canDelete && (
                        <button
                          className="verifile-remove-access-btn"
                          disabled={removingPunishmentId === p.id}
                          onClick={() => handleRemovePunishment(p.id)}
                        >
                          {removingPunishmentId === p.id ? "…" : "Remove"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showAddAccess && (
        <div className="verifile-modal-backdrop" onClick={() => setShowAddAccess(false)}>
          <div className="verifile-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Verifile access</h3>
            <div className="verifile-add-access-form">
              <input
                placeholder="Roblox username…"
                value={newAccessUsername}
                onChange={(e) => setNewAccessUsername(e.target.value)}
              />
              <button
                className="verifile-cta-btn"
                disabled={!newAccessUsername.trim() || addingAccess}
                onClick={handleAddAccess}
              >
                {addingAccess ? "Adding…" : "Add"}
              </button>
            </div>
            {addAccessError && <p className="verifile-error">{addAccessError}</p>}
            <div className="verifile-access-list">
              {whitelist.length === 0 ? (
                <p className="verifile-muted">No additional people have been granted access.</p>
              ) : (
                whitelist.map((w) => (
                  <div key={w.userId} className="verifile-access-row">
                    <span>{w.username}</span>
                    <button
                      className="verifile-remove-access-btn"
                      disabled={removingAccessId === w.userId}
                      onClick={() => handleRemoveAccess(w.userId)}
                    >
                      {removingAccessId === w.userId ? "…" : "Remove"}
                    </button>
                  </div>
                ))
              )}
            </div>
            <button className="verifile-modal-close" onClick={() => setShowAddAccess(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      <div className="verifile-footer">
        <span className="verifile-footer-note">Signed in as {username}</span>
        <span className="verifile-powered-by">
          <img className="verifile-powered-by-mark" src="/blume-logo.png" alt="" />
          Powered by Blume
        </span>
      </div>
    </div>
  );
}
