import { useEffect, useRef, useState } from "react";

interface HmctsTile {
  id: string;
  label: string;
  color: string;
  glyph: string;
  locked?: boolean;
  editable?: boolean;
  external?: string;
  detail?: string;
}

const TILES: HmctsTile[] = [
  { id: "outlook", label: "Outlook Web App", color: "#0072c6", glyph: "OWA" },
  { id: "onedrive", label: "One Drive for Business (My Docs)", color: "#0364b8", glyph: "OD" },
  { id: "teamsites", label: "Team Sites – Conferencing and Shared Docs", color: "#038387", glyph: "TS", locked: true },
  { id: "judicialIntranet", label: "Judicial Intranet", color: "#7a0d0d", glyph: "JI", locked: true },
  { id: "judicialCollege", label: "Judicial College", color: "#5c2d91", glyph: "JC", locked: true },
  { id: "help", label: "Welcome and Help", color: "#498205", glyph: "?" },
  { id: "security", label: "Security", color: "#3b3a39", glyph: "SEC" },
  { id: "eirs", label: "eIRS", color: "#7a0d0d", glyph: "eIRS", locked: true },
  { id: "chatnow", label: "Chat Now for Magistrate Peer Mentoring, Guidance, Coaching and Advice", color: "#b4009e", glyph: "CHAT" },
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
  { id: "bbc", label: "BBC", color: "#000000", glyph: "BBC", external: "https://www.bbc.co.uk" },
  { id: "bing", label: "Bing", color: "#008373", glyph: "b", external: "https://www.bing.com" },
  { id: "passwordReset", label: "Self Service Password Reset", color: "#004e8c", glyph: "PW" },
];

const QUOTE =
  '"The rule of law is a fundamental constitutional principle which underpins an open, fair and peaceful society, where citizens and businesses can prosper. Our judges and magistrates are its cornerstone"';

function randomMaskedName(): string {
  const len = 8 + Math.floor(Math.random() * 5);
  return "*".repeat(len);
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
            <img src="/icons/royal-seal.svg" alt="" />
            <span>eJudiciary</span>
          </div>
          <div className="hmcts-signin-crest">
            <img src="/icons/royal-seal.svg" alt="" />
          </div>
          <blockquote className="hmcts-quote">{QUOTE}</blockquote>
          <p className="hmcts-quote-author">Lady Chief Justice of England and Wales</p>
        </div>
        <div className="hmcts-signin-right">
          <div className="hmcts-brand">
            <img src="/icons/royal-seal.svg" alt="" />
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
