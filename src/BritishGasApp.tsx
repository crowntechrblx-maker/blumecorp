import { useEffect, useState } from "react";
import { ImageLightbox } from "./ImageLightbox";

type BritGasTab = "home" | "incidents" | "contact" | "settings";

interface BritGasIncident {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  postedByUserId: string;
  postedByUsername: string;
  createdAt: number;
}

interface BritGasAdminEntry {
  userId: string;
  username: string;
  addedByUsername: string;
  createdAt: number;
}

const DISCORD_URL = "https://discord.gg/JU9xh7Y4eu";
const CONTACT_EMAIL = "britishgascustomerserviceWB@gmail.com";

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(f);
  });
}

function formatDateTime(value: number): string {
  const d = new Date(value);
  return `${d.toLocaleDateString()}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function BritishGasApp() {
  const [tab, setTab] = useState<BritGasTab>("home");
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [incidents, setIncidents] = useState<BritGasIncident[]>([]);
  const [admins, setAdmins] = useState<BritGasAdminEntry[]>([]);
  const [rootAdmins, setRootAdmins] = useState<string[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const [incidentTitle, setIncidentTitle] = useState("");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [incidentImageFile, setIncidentImageFile] = useState<File | null>(null);
  const [postingIncident, setPostingIncident] = useState(false);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [deletingIncidentId, setDeletingIncidentId] = useState<string | null>(null);

  const [adminInput, setAdminInput] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [removingAdminId, setRemovingAdminId] = useState<string | null>(null);

  function load() {
    fetch("/api/blume-content?type=britishGas")
      .then((res) => res.json())
      .then((data) => {
        setCanManage(!!data.canManage);
        setIncidents(data.incidents || []);
        setAdmins(data.admins || []);
        setRootAdmins(data.rootAdmins || []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handlePostIncident() {
    if (!incidentTitle.trim()) return;
    setPostingIncident(true);
    setIncidentError(null);
    try {
      const imageDataUrl = incidentImageFile ? await fileToDataUrl(incidentImageFile) : undefined;
      const res = await fetch("/api/blume-content?type=britishGas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addIncident",
          title: incidentTitle.trim(),
          description: incidentDescription.trim(),
          imageDataUrl,
        }),
      });
      if (!res.ok) {
        setIncidentError(await res.text());
        return;
      }
      const data = await res.json();
      setIncidents(data.incidents || []);
      setIncidentTitle("");
      setIncidentDescription("");
      setIncidentImageFile(null);
    } catch {
      setIncidentError("Couldn't post that incident.");
    } finally {
      setPostingIncident(false);
    }
  }

  async function handleDeleteIncident(id: string) {
    setDeletingIncidentId(id);
    try {
      const res = await fetch(`/api/blume-content?type=britishGas&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setIncidents((prev) => prev.filter((i) => i.id !== id));
      }
    } finally {
      setDeletingIncidentId(null);
    }
  }

  async function handleAddAdmin() {
    if (!adminInput.trim()) return;
    setAddingAdmin(true);
    setAdminError(null);
    try {
      const res = await fetch("/api/blume-content?type=britishGas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addAdmin", username: adminInput.trim() }),
      });
      if (!res.ok) {
        setAdminError(await res.text());
        return;
      }
      const data = await res.json();
      setAdmins(data.admins || []);
      setAdminInput("");
    } catch {
      setAdminError("Couldn't add that admin.");
    } finally {
      setAddingAdmin(false);
    }
  }

  async function handleRemoveAdmin(userId: string) {
    setRemovingAdminId(userId);
    setAdminError(null);
    try {
      const res = await fetch("/api/blume-content?type=britishGas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeAdmin", userId }),
      });
      if (!res.ok) {
        setAdminError(await res.text());
        return;
      }
      const data = await res.json();
      setAdmins(data.admins || []);
    } catch {
      setAdminError("Couldn't remove that admin.");
    } finally {
      setRemovingAdminId(null);
    }
  }

  return (
    <div className="app-content britgas">
      <img className="britgas-hero" src="/british-gas-hero.jpg" alt="British Gas" />

      <div className="britgas-tabbar">
        <button className={`britgas-tab${tab === "home" ? " britgas-tab-active" : ""}`} onClick={() => setTab("home")}>
          Home
        </button>
        <button
          className={`britgas-tab${tab === "incidents" ? " britgas-tab-active" : ""}`}
          onClick={() => setTab("incidents")}
        >
          Incidents
        </button>
        <button
          className={`britgas-tab${tab === "contact" ? " britgas-tab-active" : ""}`}
          onClick={() => setTab("contact")}
        >
          Contact
        </button>
        {canManage && (
          <button
            className={`britgas-tab${tab === "settings" ? " britgas-tab-active" : ""}`}
            onClick={() => setTab("settings")}
          >
            Settings
          </button>
        )}
      </div>

      <div className="britgas-body">
        {tab === "home" && (
          <div className="britgas-home">
            <div className="britgas-home-welcome">
              <h2>Welcome to British Gas</h2>
              <p>
                Boiler installations, servicing, and emergency call-outs across Westbridge. Check the Incidents tab
                for any live service disruptions, or reach us on the Contact tab.
              </p>
            </div>
            <div className="britgas-award-banner">
              <p>
                We've been awarded the Uswitch Energy Awards, Best Overall Improvement two years running! Cheers to
                another year. We've also been approved as a Which? trusted trader and approved service for boiler
                installation.
              </p>
            </div>
            <div className="britgas-home-photos">
              <button
                type="button"
                className="britgas-home-photo-btn"
                onClick={() => setLightboxUrl("/british-gas-photo-1.jpg")}
              >
                <img className="britgas-home-photo" src="/british-gas-photo-1.jpg" alt="" />
              </button>
              <button
                type="button"
                className="britgas-home-photo-btn"
                onClick={() => setLightboxUrl("/british-gas-photo-2.jpg")}
              >
                <img className="britgas-home-photo" src="/british-gas-photo-2.jpg" alt="" />
              </button>
            </div>
          </div>
        )}

        {tab === "incidents" && (
          <div className="britgas-incidents">
            {loading ? (
              <p className="britgas-muted">Loading…</p>
            ) : incidents.length === 0 ? (
              <p className="britgas-muted">No incidents reported.</p>
            ) : (
              incidents.map((incident) => (
                <div className="britgas-incident-card" key={incident.id}>
                  <div className="britgas-incident-header">
                    <img className="britgas-hazard-icon" src="/icons/britgas-hazard.png" alt="" aria-hidden="true" />
                    <h3>{incident.title}</h3>
                    <img className="britgas-hazard-icon" src="/icons/britgas-hazard.png" alt="" aria-hidden="true" />
                  </div>
                  <p className="britgas-incident-date">{formatDateTime(incident.createdAt)}</p>
                  {incident.description && <p className="britgas-incident-description">{incident.description}</p>}
                  {incident.imageUrl && (
                    <button
                      type="button"
                      className="britgas-incident-image-btn"
                      onClick={() => setLightboxUrl(incident.imageUrl)}
                    >
                      <img className="britgas-incident-image" src={incident.imageUrl} alt={incident.title} />
                    </button>
                  )}
                  <div className="britgas-incident-footer">
                    <img className="britgas-mascot-emoji" src="/icons/british-gas-mascots.png" alt="" />
                    <span>Please contact us at British Gas if you have any questions.</span>
                  </div>
                  {canManage && (
                    <button
                      className="britgas-incident-delete"
                      disabled={deletingIncidentId === incident.id}
                      onClick={() => handleDeleteIncident(incident.id)}
                    >
                      {deletingIncidentId === incident.id ? "Removing…" : "Remove"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "contact" && (
          <div className="britgas-contact">
            <h2>Get in touch</h2>
            <a className="britgas-discord-btn" href={DISCORD_URL} target="_blank" rel="noreferrer">
              Join our Discord
            </a>
            <p className="britgas-contact-email">
              Or email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
          </div>
        )}

        {tab === "settings" && canManage && (
          <div className="britgas-settings">
            <div className="britgas-settings-section">
              <h3>Post an incident</h3>
              <input
                placeholder="Incident title"
                value={incidentTitle}
                onChange={(e) => setIncidentTitle(e.target.value)}
              />
              <textarea
                placeholder="Description (optional)"
                value={incidentDescription}
                onChange={(e) => setIncidentDescription(e.target.value)}
                rows={4}
              />
              <label className="britgas-file-label">
                Attach an image (optional)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setIncidentImageFile(e.target.files?.[0] || null)}
                />
              </label>
              {incidentError && <p className="britgas-error">{incidentError}</p>}
              <button
                className="britgas-cta"
                disabled={!incidentTitle.trim() || postingIncident}
                onClick={handlePostIncident}
              >
                {postingIncident ? "Posting…" : "Post incident"}
              </button>
            </div>

            <hr className="britgas-divider" />

            <div className="britgas-settings-section">
              <h3>British Gas admins</h3>
              <div className="britgas-admin-form">
                <input
                  placeholder="Username or user ID"
                  value={adminInput}
                  onChange={(e) => setAdminInput(e.target.value)}
                />
                <button
                  className="britgas-admin-add-btn"
                  disabled={!adminInput.trim() || addingAdmin}
                  onClick={handleAddAdmin}
                >
                  {addingAdmin ? "Adding…" : "Add admin"}
                </button>
              </div>
              {adminError && <p className="britgas-error">{adminError}</p>}
              <div className="britgas-admin-list">
                {rootAdmins.map((username) => (
                  <div className="britgas-admin-row" key={username}>
                    <span>
                      <strong>{username}</strong> — Permanent admin
                    </span>
                  </div>
                ))}
                {admins.map((a) => (
                  <div className="britgas-admin-row" key={a.userId}>
                    <span>
                      <strong>{a.username}</strong> — added by {a.addedByUsername}
                    </span>
                    <button
                      className="britgas-admin-remove"
                      disabled={removingAdminId === a.userId}
                      onClick={() => handleRemoveAdmin(a.userId)}
                    >
                      {removingAdminId === a.userId ? "…" : "Remove"}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <hr className="britgas-divider" />

            <div className="britgas-settings-section">
              <h3>Posted incidents</h3>
              {incidents.length === 0 ? (
                <p className="britgas-muted">Nothing posted yet.</p>
              ) : (
                <div className="britgas-admin-list">
                  {incidents.map((incident) => (
                    <div className="britgas-admin-row" key={incident.id}>
                      <span>
                        <strong>{incident.title}</strong> — {formatDateTime(incident.createdAt)}
                      </span>
                      <button
                        className="britgas-admin-remove"
                        disabled={deletingIncidentId === incident.id}
                        onClick={() => handleDeleteIncident(incident.id)}
                      >
                        {deletingIncidentId === incident.id ? "…" : "Remove"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="britgas-footer">
        <span>British Gas Westbridge</span>
        <a href={DISCORD_URL} target="_blank" rel="noreferrer">
          Discord
        </a>
      </div>

      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
