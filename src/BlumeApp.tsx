import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFadingError } from "./useFadingError";
import { getChargeName } from "./pncCharges";

interface BlumeReport {
  id: string;
  title: string;
  body: string;
  authorUsername: string;
  createdAt: number;
  linkedUserId?: string;
  linkedUsername?: string;
}

interface BlumeBlogPost {
  id: string;
  title: string;
  excerpt: string;
  readMinutes: number;
  authorUsername: string;
  createdAt: number;
}

interface PersonGroup {
  id: number;
  name: string;
  tier: "red" | "white";
}

interface VehicleTag {
  id: string;
  userId: string;
  vehicleType: string;
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
  vehicleTags: VehicleTag[];
  apiError: string | null;
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

interface GroupScanMember {
  userId: string;
  username: string;
  avatarUrl: string | null;
  customPlate: string | null;
  groupIds: number[];
  scannedAt: number;
  relevantGroups?: PersonGroup[];
}

// Renders whatever shape the arrest data actually turns out to be — a flat
// list of names/IDs, or a list of record objects with fields like
// chargeIds/officer/date — decoding any numeric charge codes through the
// PNC table along the way, since we don't control that API's exact schema.
function ArrestRecord({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <p className="blume-muted">None on file.</p>;
  }
  const list = Array.isArray(data) ? data : [data];
  if (list.length === 0) {
    return <p className="blume-muted">None on file.</p>;
  }

  function renderChargeLike(value: unknown): string {
    if (typeof value === "number") return getChargeName(value);
    if (typeof value === "string" && /^\d+$/.test(value)) return getChargeName(value);
    return String(value);
  }

  return (
    <div className="blume-arrest-list">
      {list.map((item, i) => {
        if (typeof item === "number" || typeof item === "string") {
          return (
            <div className="blume-arrest-row" key={i}>
              {renderChargeLike(item)}
            </div>
          );
        }
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const chargeField = obj.chargeIds ?? obj.charges ?? obj.chargeId ?? obj.charge;
          const charges = Array.isArray(chargeField)
            ? chargeField.map(renderChargeLike)
            : chargeField !== undefined
              ? [renderChargeLike(chargeField)]
              : [];
          const officer = obj.officer ?? obj.arrestedBy ?? obj.by ?? obj.arrestingOfficer;
          const when = obj.date ?? obj.timestamp ?? obj.createdAt ?? obj.time;
          const knownKeys = new Set([
            "chargeIds",
            "charges",
            "chargeId",
            "charge",
            "officer",
            "arrestedBy",
            "by",
            "arrestingOfficer",
            "date",
            "timestamp",
            "createdAt",
            "time",
          ]);
          const rest = Object.entries(obj).filter(([k]) => !knownKeys.has(k));
          return (
            <div className="blume-arrest-row" key={i}>
              {charges.length > 0 && (
                <div className="blume-arrest-charges">{charges.join(", ")}</div>
              )}
              <div className="blume-arrest-meta">
                {officer !== undefined && <span>Arrested by {String(officer)}</span>}
                {when !== undefined && (
                  <span>
                    {typeof when === "number"
                      ? new Date(when).toLocaleString()
                      : String(when)}
                  </span>
                )}
              </div>
              {rest.length > 0 && charges.length === 0 && (
                <div className="blume-arrest-raw">
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
          <div className="blume-arrest-row" key={i}>
            {String(item)}
          </div>
        );
      })}
    </div>
  );
}

// Mirrors lib/roblox.ts's PERSON_SEARCH_GROUPS exactly — used here just to
// give Group Viewer a clickable list of every group it's worth browsing,
// instead of making the user go find and paste each numeric ID by hand.
const GROUP_VIEWER_SECTIONS: PersonGroup[] = [
  { id: 10742221, name: "G-Block", tier: "red" },
  { id: 223035360, name: "Shadow District", tier: "red" },
  { id: 679403020, name: "Harakat", tier: "red" },
  { id: 16684944, name: "Irish", tier: "red" },
  { id: 34067916, name: "CHS", tier: "red" },
  { id: 541807, name: "UK | United Kingdom", tier: "red" },
  { id: 14641286, name: "TUI Airways | Roblox", tier: "red" },
  { id: 696897291, name: "Motorway Roleplay Community", tier: "red" },
  { id: 11939831, name: "Nottinghamshire, England", tier: "red" },
  { id: 16339807, name: "Liber Studios", tier: "red" },
  { id: 34544324, name: "UK | Sandford Studios", tier: "red" },
  { id: 12982639, name: "NEMG | North East Medical Group", tier: "red" },
  { id: 8103, name: "UK Explorium Studios", tier: "red" },
  { id: 32650605, name: "London Air Ambulance", tier: "white" },
  { id: 879056831, name: "London Ambulance Service", tier: "white" },
  { id: 493990898, name: "Metropolitan Police Service", tier: "white" },
  { id: 360230741, name: "London Fire Brigade", tier: "white" },
  { id: 931656944, name: "British Forces", tier: "white" },
  { id: 820909258, name: "British Transport Police", tier: "white" },
  { id: 743983922, name: "Greater Manchester Police", tier: "white" },
  { id: 987422423, name: "Police Service of Northern Ireland", tier: "white" },
  { id: 154853936, name: "MI5", tier: "white" },
  { id: 142915989, name: "National Crime Agency", tier: "white" },
  { id: 685466511, name: "SIS (MI6)", tier: "white" },
  { id: 34974741, name: "Immigration Enforcement", tier: "white" },
  { id: 11086948, name: "Hatzola", tier: "white" },
  { id: 35167585, name: "Royal Households", tier: "white" },
  { id: 841518502, name: "Home Office", tier: "white" },
  { id: 278125181, name: "National Police Air Service", tier: "white" },
  { id: 740750486, name: "Kent Police", tier: "white" },
  { id: 567563234, name: "HM Revenue and Customs", tier: "white" },
  { id: 187507831, name: "Central Intelligence Agency", tier: "white" },
  { id: 963189576, name: "JTF2", tier: "white" },
  { id: 315987361, name: "Regional Organised Crime Unit", tier: "white" },
  { id: 496716538, name: "U.S Marshals Service", tier: "white" },
  { id: 841282433, name: "London Freemasons", tier: "white" },
  { id: 1033941381, name: "Consulate of the People's Republic of China", tier: "white" },
];

const PLACEHOLDER_ACTIVE = [
  { username: "n.harrow", role: "Field" },
  { username: "t.ackland", role: "Analyst" },
  { username: "r.voss", role: "Field" },
  { username: "k.imani", role: "Command" },
];

const PLACEHOLDER_PINS = [
  { label: "Westbridge Central", x: 38, y: 44 },
  { label: "Docklands", x: 68, y: 62 },
  { label: "North Sector", x: 30, y: 22 },
];

const INDUSTRIES = [
  {
    title: "Energy & Utilities",
    copy: "Grid load, maintenance schedules, and weather risk in one operating picture.",
  },
  {
    title: "Logistics",
    copy: "Fleet, freight, and inventory reconciled across every carrier and warehouse.",
  },
  {
    title: "Manufacturing",
    copy: "Line performance and supplier risk modeled down to the individual part.",
  },
  {
    title: "Public Sector",
    copy: "Cross-agency coordination without forcing a single system of record.",
  },
  {
    title: "Healthcare",
    copy: "Capacity and patient flow visible across facilities, in real time.",
  },
  {
    title: "Financial Services",
    copy: "Exposure and counterparty risk modeled as one connected graph.",
  },
];

const FEATURES = [
  {
    num: "01",
    title: "Integrate",
    copy: "Connect source systems as they are — ERPs, sensors, spreadsheets, legacy databases — without months of migration or a rip-and-replace mandate.",
  },
  {
    num: "02",
    title: "Model",
    copy: "Turn raw, disconnected records into a shared object model that reflects how your operation actually works, not how a schema assumed it would.",
  },
  {
    num: "03",
    title: "Act",
    copy: "Give operators, analysts, and executives one live surface to monitor, simulate, and commit decisions — with a full record of what changed and why.",
  },
];

const APPROACH = [
  {
    title: "Weeks, not years",
    copy: "Deployment starts against your real data in the first weeks of engagement — not after a discovery phase that outlives the contract.",
  },
  {
    title: "Your systems stay",
    copy: "Blume sits alongside existing infrastructure. Nothing needs to be torn out for the model to go live.",
  },
  {
    title: "Built with your team",
    copy: "Engineers embed on-site during rollout, and hand over a model your own team can extend without us in the room.",
  },
];

const REQUEST_ACCESS_URL = "https://discord.gg/ye7FsHsCTM";

// Drop uploaded hero images in public/blume/hero/ and list their paths here
// (e.g. "/blume/hero/1.jpg") to cycle them behind the hero headline. Leave
// empty to keep the plain navy gradient.
const HERO_IMAGES: string[] = [];
const HERO_CYCLE_MS = 5000;

function useHeroCycle(count: number, intervalMs: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [count, intervalMs]);
  return index;
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealed(true);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, revealed };
}

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`blume-reveal ${revealed ? "blume-in" : ""} ${className}`}>
      {children}
    </div>
  );
}

// Driven by rAF and measured against the real rendered width every frame,
// rather than a CSS keyframe tied to a percentage of the element's width —
// that's what left a gap once the custom font finished loading and the
// track's actual width shifted out from under a fixed-percentage animation.
function BlumeMarquee() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const setRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    const SPEED = 36; // px per second
    let lastTime: number | null = null;
    let raf = 0;

    function tick(time: number) {
      const setEl = setRef.current;
      const trackEl = trackRef.current;
      if (setEl && trackEl) {
        const setWidth = setEl.getBoundingClientRect().width;
        if (setWidth > 0 && lastTime !== null) {
          const dt = (time - lastTime) / 1000;
          offsetRef.current -= SPEED * dt;
          if (offsetRef.current <= -setWidth) {
            offsetRef.current += setWidth;
          }
          trackEl.style.transform = `translateX(${offsetRef.current}px)`;
        }
      }
      lastTime = time;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="blume-marquee">
      <div className="blume-marquee-track" ref={trackRef}>
        <div className="blume-marquee-set" ref={setRef}>
          {INDUSTRIES.map((ind) => (
            <span className="blume-marquee-item" key={ind.title}>
              {ind.title}
            </span>
          ))}
        </div>
        <div className="blume-marquee-set" aria-hidden="true">
          {INDUSTRIES.map((ind) => (
            <span className="blume-marquee-item" key={ind.title}>
              {ind.title}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BlumeApp({
  username,
  onMaximize,
}: {
  username: string;
  onMaximize?: () => void;
}) {
  const [canAccess, setCanAccess] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const heroIndex = useHeroCycle(HERO_IMAGES.length, HERO_CYCLE_MS);

  const [reports, setReports] = useState<BlumeReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkedPerson, setLinkedPerson] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { error, fading, setError } = useFadingError();
  const [reportSearchQuery, setReportSearchQuery] = useState("");

  const [personLinkedReports, setPersonLinkedReports] = useState<BlumeReport[]>([]);
  const [personLinkedReportsLoading, setPersonLinkedReportsLoading] = useState(false);

  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({});
  function togglePanel(key: string) {
    setCollapsedPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const [blogPosts, setBlogPosts] = useState<BlumeBlogPost[]>([]);
  const [canEditBlog, setCanEditBlog] = useState(false);
  const [blogTitle, setBlogTitle] = useState("");
  const [blogExcerpt, setBlogExcerpt] = useState("");
  const [blogSubmitting, setBlogSubmitting] = useState(false);
  const { error: blogError, fading: blogFading, setError: setBlogError } = useFadingError();

  const [personQuery, setPersonQuery] = useState("");
  const [personResult, setPersonResult] = useState<PersonSearchResult | null>(null);
  const [personLoading, setPersonLoading] = useState(false);
  const { error: personError, fading: personFading, setError: setPersonError } = useFadingError();
  const [newVehicleType, setNewVehicleType] = useState("");
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [showPreviousPhotos, setShowPreviousPhotos] = useState(false);
  const [showPreviousPlates, setShowPreviousPlates] = useState(false);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [groupSearchId, setGroupSearchId] = useState("");
  const [groupScanning, setGroupScanning] = useState(false);
  const [groupScanProgress, setGroupScanProgress] = useState({ scanned: 0, total: 0 });
  const [groupScanLog, setGroupScanLog] = useState<string[]>([]);
  const [groupScanError, setGroupScanError] = useState<string | null>(null);
  const groupScanStopRef = useRef(false);

  const [viewerGroupId, setViewerGroupId] = useState("");
  const [viewerResults, setViewerResults] = useState<GroupScanMember[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function loadAccess() {
    try {
      const res = await fetch("/api/blume-content?type=report");
      const data = await res.json();
      setCanAccess(!!data.canAccess);
      setReports(data.reports || []);
    } finally {
      setLoadingReports(false);
    }
  }

  async function loadBlog() {
    const res = await fetch("/api/blume-content?type=blog");
    const data = await res.json();
    setBlogPosts(data.posts || []);
    setCanEditBlog(!!data.canEdit);
  }

  useEffect(() => {
    loadAccess();
    loadBlog();
  }, []);

  function handleLogin() {
    if (!canAccess) return;
    onMaximize?.();
    // Let the window's resize animation get underway before the content
    // swaps, so the transition reads as one fluid motion rather than a cut.
    window.setTimeout(() => setLoggedIn(true), 260);
  }

  function handleLogout() {
    setLoggedIn(false);
  }

  async function handleAddReport() {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/blume-content?type=report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: body.trim(),
          linkedPerson: linkedPerson.trim() || undefined,
        }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      setTitle("");
      setBody("");
      setLinkedPerson("");
      await loadAccess();
      if (personResult) await loadPersonLinkedReports(personResult.userId);
    } finally {
      setSubmitting(false);
    }
  }

  async function loadPersonLinkedReports(userId: string) {
    setPersonLinkedReportsLoading(true);
    try {
      const res = await fetch(
        `/api/blume-content?type=report&personId=${encodeURIComponent(userId)}`
      );
      const data = await res.json();
      setPersonLinkedReports(data.reports || []);
    } finally {
      setPersonLinkedReportsLoading(false);
    }
  }

  async function handleDeleteReport(id: string) {
    await fetch(`/api/blume-content?type=report&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await loadAccess();
  }

  async function handleAddBlogPost() {
    if (!blogTitle.trim() || !blogExcerpt.trim()) return;
    setBlogSubmitting(true);
    setBlogError(null);
    try {
      const res = await fetch("/api/blume-content?type=blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: blogTitle.trim(), excerpt: blogExcerpt.trim() }),
      });
      if (!res.ok) {
        setBlogError(await res.text());
        return;
      }
      setBlogTitle("");
      setBlogExcerpt("");
      await loadBlog();
    } finally {
      setBlogSubmitting(false);
    }
  }

  async function handleDeleteBlogPost(id: string) {
    await fetch(`/api/blume-content?type=blog&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await loadBlog();
  }

  async function handlePersonSearch() {
    if (!personQuery.trim()) return;
    setPersonLoading(true);
    setPersonError(null);
    setShowPreviousPhotos(false);
    setShowPreviousPlates(false);
    setPersonLinkedReports([]);
    try {
      const res = await fetch(`/api/blume-search?query=${encodeURIComponent(personQuery.trim())}`);
      if (!res.ok) {
        setPersonResult(null);
        setPersonError(await res.text());
        return;
      }
      const data: PersonSearchResult = await res.json();
      setPersonResult(data);
      await loadPersonLinkedReports(data.userId);
    } catch {
      setPersonError("Couldn't reach Person Search.");
    } finally {
      setPersonLoading(false);
    }
  }

  async function loadHistory() {
    if (!personResult) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/blume-search?history=${encodeURIComponent(personResult.userId)}`);
      const data = await res.json();
      setHistory(data.history || []);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function togglePreviousPhotos() {
    const next = !showPreviousPhotos;
    setShowPreviousPhotos(next);
    setShowPreviousPlates(false);
    if (next) await loadHistory();
  }

  async function togglePreviousPlates() {
    const next = !showPreviousPlates;
    setShowPreviousPlates(next);
    setShowPreviousPhotos(false);
    if (next) await loadHistory();
  }

  async function handleAddVehicle() {
    if (!personResult || !newVehicleType.trim()) return;
    setAddingVehicle(true);
    try {
      const res = await fetch("/api/blume-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addVehicle",
          userId: personResult.userId,
          vehicleType: newVehicleType.trim(),
        }),
      });
      if (!res.ok) {
        setPersonError(await res.text());
        return;
      }
      const data = await res.json();
      setPersonResult((prev) => (prev ? { ...prev, vehicleTags: data.vehicleTags || [] } : prev));
      setNewVehicleType("");
    } finally {
      setAddingVehicle(false);
    }
  }

  async function handleRemoveVehicle(id: string) {
    if (!personResult) return;
    const res = await fetch("/api/blume-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "removeVehicle", id }),
    });
    if (!res.ok) {
      setPersonError(await res.text());
      return;
    }
    const data = await res.json();
    setPersonResult((prev) => (prev ? { ...prev, vehicleTags: data.vehicleTags || [] } : prev));
  }

  // Client-driven so it works within Vercel's serverless timeouts and the
  // records API's 50 req/min limit: the browser tab pages through the
  // group's member list, then walks each member one at a time with a ~1.3s
  // gap between records-API calls, updating progress as it goes. Stopping
  // just flips a ref the loop checks between steps; resuming later re-runs
  // the same group and the backend skips anyone scanned recently.
  async function startGroupScan() {
    const groupId = groupSearchId.trim();
    if (!groupId || groupScanning) return;
    setGroupScanning(true);
    setGroupScanError(null);
    setGroupScanLog([]);
    setGroupScanProgress({ scanned: 0, total: 0 });
    groupScanStopRef.current = false;
    // Group Viewer always looks at whatever group was just searched — no
    // need to go find and retype the ID again. It's still an editable field
    // if they want to drill into a different (sub)group afterwards.
    setViewerGroupId(groupId);
    try {
      const allMembers: { userId: string; username: string }[] = [];
      let cursor = "";
      do {
        const res = await fetch(
          `/api/blume-search?groupMembers=${encodeURIComponent(groupId)}${
            cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
          }`
        );
        if (!res.ok) {
          setGroupScanError(await res.text());
          return;
        }
        const data = await res.json();
        allMembers.push(...(data.members || []));
        cursor = data.nextCursor || "";
        setGroupScanProgress((p) => ({ ...p, total: allMembers.length }));
      } while (cursor && !groupScanStopRef.current);

      // Paced right up against the records API's real 50/min cap (1200ms
      // between calls, measured start-to-start rather than tacked on after
      // each request finishes) instead of leaving a conservative margin.
      // Cache hits (already-scanned-recently members) don't touch that API
      // at all, so they skip the wait entirely.
      const MIN_INTERVAL_MS = 1200;
      for (let i = 0; i < allMembers.length; i++) {
        if (groupScanStopRef.current) break;
        const m = allMembers[i];
        const requestStart = Date.now();
        let hitRecordsApi = true;
        try {
          const res = await fetch("/api/blume-search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "scanMember", userId: m.userId }),
          });
          if (res.ok) {
            const data = await res.json();
            hitRecordsApi = !data.skipped;
            setGroupScanLog((log) =>
              [`${m.username}${data.skipped ? " (already cached)" : ""}`, ...log].slice(0, 8)
            );
          } else {
            setGroupScanLog((log) => [`${m.username} — scan failed`, ...log].slice(0, 8));
          }
        } catch {
          setGroupScanLog((log) => [`${m.username} — network error`, ...log].slice(0, 8));
        }
        setGroupScanProgress((p) => ({ ...p, scanned: i + 1 }));
        if (!groupScanStopRef.current && hitRecordsApi && i < allMembers.length - 1) {
          const elapsed = Date.now() - requestStart;
          const remaining = MIN_INTERVAL_MS - elapsed;
          if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
        }
      }
    } catch {
      setGroupScanError("Couldn't reach Group Search.");
    } finally {
      setGroupScanning(false);
      await runGroupViewer(groupId);
    }
  }

  function stopGroupScan() {
    groupScanStopRef.current = true;
  }

  async function runGroupViewer(overrideGroupId?: string) {
    const groupId = (overrideGroupId ?? viewerGroupId).trim();
    if (!groupId) return;
    setViewerLoading(true);
    setViewerError(null);
    try {
      const res = await fetch(`/api/blume-search?groupScan=${encodeURIComponent(groupId)}`);
      if (!res.ok) {
        setViewerResults([]);
        setViewerError(await res.text());
        return;
      }
      const data = await res.json();
      setViewerResults(data.members || []);
    } catch {
      setViewerError("Couldn't reach Group Viewer.");
    } finally {
      setViewerLoading(false);
    }
  }

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="blume-app">
      {!loggedIn && (
        <>
          <div className="blume-grain" aria-hidden="true" />
          <header className="blume-navbar">
            <div className="blume-nav-inner">
              <span className="blume-brand">
                <span className="blume-brand-mark" />
                <span className="blume-brand-name">Blume</span>
              </span>

              <div className="blume-nav-actions">
                {canAccess && (
                  <button className="blume-btn-login" onClick={handleLogin}>
                    LOGIN
                  </button>
                )}
              </div>
            </div>
          </header>
        </>
      )}

      {!loggedIn && (
        <div className="blume-scroll" ref={scrollRef}>
          <section className="blume-hero">
            {HERO_IMAGES.length > 0 && (
              <div className="blume-hero-bg" aria-hidden="true">
                {HERO_IMAGES.map((src, i) => (
                  <div
                    key={src}
                    className="blume-hero-bg-image"
                    style={{ backgroundImage: `url(${src})`, opacity: i === heroIndex ? 1 : 0 }}
                  />
                ))}
                <div className="blume-hero-tint" />
              </div>
            )}
            <div className="blume-hero-mark" aria-hidden="true" />
            <div className="blume-hero-content">
              <h1>
                The world's foremost innovator of high-tech, high-performance security
                technology.
              </h1>
              <div className="blume-hero-actions">
                <a
                  className="blume-btn-primary"
                  href={REQUEST_ACCESS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Request access
                </a>
              </div>
            </div>
            <div className="blume-hero-scroll" aria-hidden="true">
              <span />
            </div>
          </section>

          <BlumeMarquee />

          <section className="blume-platform" id="blume-platform">
            <Reveal className="blume-section-head">
              <p className="blume-eyebrow">Platform</p>
              <h2>Built for the problem underneath the problem.</h2>
              <p className="blume-section-lede">
                Most operational failures aren't failures of judgment — they're failures of
                visibility. Blume closes that gap with three connected layers.
              </p>
            </Reveal>

            <div className="blume-feature-grid">
              {FEATURES.map((f) => (
                <Reveal className="blume-feature" key={f.num}>
                  <div className="blume-feature-num">{f.num}</div>
                  <h3>{f.title}</h3>
                  <p>{f.copy}</p>
                </Reveal>
              ))}
            </div>
          </section>

          <section className="blume-showcase">
            <Reveal className="blume-showcase-media">
              <div className="blume-mock-window">
                <div className="blume-mock-bar">
                  <span />
                  <span />
                  <span />
                  <div className="blume-mock-tabs">
                    <div className="blume-mock-tab blume-active">Operations</div>
                    <div className="blume-mock-tab">Assets</div>
                    <div className="blume-mock-tab">Alerts</div>
                  </div>
                </div>
                <div className="blume-mock-body">
                  <div className="blume-mock-side">
                    <div className="blume-mock-row blume-long" />
                    <div className="blume-mock-row" />
                    <div className="blume-mock-row" />
                    <div className="blume-mock-row blume-short" />
                    <div className="blume-mock-divider" />
                    <div className="blume-mock-row" />
                    <div className="blume-mock-row blume-short" />
                  </div>
                  <div className="blume-mock-main">
                    <div className="blume-mock-stat-row">
                      <div className="blume-mock-stat">
                        <span className="blume-mock-stat-label">Throughput</span>
                        <span className="blume-mock-stat-value">94.2%</span>
                      </div>
                      <div className="blume-mock-stat">
                        <span className="blume-mock-stat-label">Open incidents</span>
                        <span className="blume-mock-stat-value">3</span>
                      </div>
                      <div className="blume-mock-stat">
                        <span className="blume-mock-stat-label">Model freshness</span>
                        <span className="blume-mock-stat-value">Live</span>
                      </div>
                    </div>
                    <div className="blume-mock-graph">
                      <svg viewBox="0 0 400 120" preserveAspectRatio="none">
                        <polyline points="0,90 40,80 80,85 120,60 160,65 200,40 240,50 280,30 320,35 360,15 400,20" />
                      </svg>
                    </div>
                    <div className="blume-mock-list">
                      <div className="blume-mock-list-row">
                        <span className="blume-dot" />
                        Line 3 — capacity model updated
                      </div>
                      <div className="blume-mock-list-row">
                        <span className="blume-dot" />
                        Vendor feed reconnected — Northgate
                      </div>
                      <div className="blume-mock-list-row">
                        <span className="blume-dot blume-warn" />
                        Anomaly flagged — cold storage 6
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal className="blume-showcase-copy">
              <p className="blume-eyebrow blume-eyebrow-light">A single surface</p>
              <h2>Everyone looks at the same board.</h2>
              <p>
                No more reconciling three dashboards before a nine o'clock call. Every
                stakeholder, from the floor to the board, works against one continuously updated
                model — so a decision made in one room holds up in the next.
              </p>
              <ul className="blume-checklist">
                <li>Change history on every object, not just every table</li>
                <li>Permissions that follow the data, not the department</li>
                <li>Simulations run against the same model that runs live</li>
              </ul>
            </Reveal>
          </section>

          <section className="blume-industries" id="blume-industries">
            <Reveal className="blume-section-head">
              <p className="blume-eyebrow">Industries</p>
              <h2>Where the stakes are highest, and the data is worst.</h2>
            </Reveal>
            <div className="blume-industry-grid">
              {INDUSTRIES.map((ind) => (
                <Reveal className="blume-industry-card" key={ind.title}>
                  <h3>{ind.title}</h3>
                  <p>{ind.copy}</p>
                </Reveal>
              ))}
            </div>
          </section>

          <section className="blume-blog" id="blume-blog">
            <Reveal className="blume-section-head">
              <p className="blume-eyebrow">From our blog</p>
              <h2>Field notes from the Blume team.</h2>
            </Reveal>

            {canEditBlog && (
              <div className="blume-blog-form">
                <input
                  placeholder="Post title"
                  value={blogTitle}
                  onChange={(e) => setBlogTitle(e.target.value)}
                />
                <textarea
                  placeholder="Short excerpt…"
                  value={blogExcerpt}
                  onChange={(e) => setBlogExcerpt(e.target.value)}
                  rows={3}
                />
                <button
                  className="blume-btn-primary blume-btn-primary-dark"
                  disabled={!blogTitle.trim() || !blogExcerpt.trim() || blogSubmitting}
                  onClick={handleAddBlogPost}
                >
                  {blogSubmitting ? "Publishing…" : "Publish"}
                </button>
                {blogError && (
                  <p className={`blume-error${blogFading ? " fading-out" : ""}`}>{blogError}</p>
                )}
              </div>
            )}

            <div className="blume-industry-grid">
              {blogPosts.length === 0 ? (
                <p className="blume-muted">No posts published yet.</p>
              ) : (
                blogPosts.map((p) => (
                  <Reveal className="blume-industry-card blume-blog-card" key={p.id}>
                    {canEditBlog && (
                      <div className="blume-blog-card-top">
                        <button
                          className="blume-report-delete"
                          onClick={() => handleDeleteBlogPost(p.id)}
                          title="Remove post"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <h3>{p.title}</h3>
                    <p>{p.excerpt}</p>
                    <span className="blume-blog-meta">
                      {p.authorUsername} · {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </Reveal>
                ))
              )}
            </div>
          </section>

          <section className="blume-approach" id="blume-approach">
            <div className="blume-approach-inner">
              <p className="blume-eyebrow blume-eyebrow-light">Approach</p>
              <h2>We install into how you already work.</h2>
              <div className="blume-approach-grid">
                {APPROACH.map((a) => (
                  <Reveal className="blume-approach-item" key={a.title}>
                    <h3>{a.title}</h3>
                    <p>{a.copy}</p>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section className="blume-cta" id="blume-company">
            <Reveal className="blume-cta-inner">
              <p className="blume-eyebrow">Company</p>
              <h2>Blume works with organizations who can't afford to guess.</h2>
              <p>
                We're a small team building the layer we wish existed the last time an outage, a
                shortage, or a missed handoff turned out to be a data problem in disguise.
              </p>
              <a
                className="blume-btn-primary blume-btn-primary-dark"
                href={REQUEST_ACCESS_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Talk to us
              </a>
            </Reveal>
          </section>

          <footer className="blume-footer">
            <div className="blume-footer-inner">
              <div className="blume-footer-brand">
                <span className="blume-footer-mark" />
                <span>Blume</span>
              </div>
              <div className="blume-footer-links">
                <div className="blume-footer-col">
                  <h4>Product</h4>
                  <button onClick={() => scrollToSection("blume-platform")}>Platform</button>
                  <button onClick={() => scrollToSection("blume-industries")}>Industries</button>
                  <button onClick={() => scrollToSection("blume-approach")}>Approach</button>
                </div>
                <div className="blume-footer-col">
                  <h4>Company</h4>
                  <button onClick={() => scrollToSection("blume-company")}>About</button>
                  <a href={REQUEST_ACCESS_URL} target="_blank" rel="noopener noreferrer">
                    Contact
                  </a>
                </div>
                <div className="blume-footer-col">
                  <h4>Legal</h4>
                  <a href="https://www.blumecorp.uk/privacy" target="_blank" rel="noopener noreferrer">
                    Privacy
                  </a>
                  <a href="https://www.blumecorp.uk/tos" target="_blank" rel="noopener noreferrer">
                    Terms
                  </a>
                </div>
              </div>
            </div>
            <div className="blume-footer-bottom">
              <span>© 2026 Blume Technologies, Inc.</span>
            </div>
          </footer>
        </div>
      )}

      {loggedIn && (
        <div className="blume-dashboard">
          <div className="blume-active-strip">
            <span className="blume-active-label">ACTIVE FIELD AGENTS</span>
            <div className="blume-active-list">
              {PLACEHOLDER_ACTIVE.map((a) => (
                <div className="blume-active-chip" key={a.username}>
                  <span className="blume-status-dot" />
                  <span className="blume-active-name">{a.username}</span>
                  <span className="blume-active-role">{a.role}</span>
                </div>
              ))}
            </div>
            <button className="blume-btn-login blume-btn-login-ghost blume-logout-btn" onClick={handleLogout}>
              LOGOUT
            </button>
          </div>

          <div className="blume-columns">
            <div className={`blume-panel blume-reports-panel${collapsedPanels.reports ? " blume-panel-collapsed" : ""}`}>
              <button className="blume-panel-header blume-panel-header-toggle" onClick={() => togglePanel("reports")}>
                <span>Intelligence Reports</span>
                <span className="blume-panel-toggle-icon">{collapsedPanels.reports ? "▸" : "▾"}</span>
              </button>
              {!collapsedPanels.reports && (
                <>
                  <div className="blume-report-form">
                    <input
                      placeholder="Report title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                    <textarea
                      placeholder="Report details…"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={3}
                    />
                    <input
                      placeholder="Link to a person (optional) — name or ID"
                      value={linkedPerson}
                      onChange={(e) => setLinkedPerson(e.target.value)}
                    />
                    <button
                      className="blume-cta-btn"
                      disabled={!title.trim() || !body.trim() || submitting}
                      onClick={handleAddReport}
                    >
                      {submitting ? "Filing…" : "File report"}
                    </button>
                    {error && <p className={`blume-error${fading ? " fading-out" : ""}`}>{error}</p>}
                  </div>
                  <div className="blume-reports-search">
                    <input
                      placeholder="Search reports…"
                      value={reportSearchQuery}
                      onChange={(e) => setReportSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="blume-reports-list">
                    {loadingReports ? (
                      <p className="blume-muted">Loading…</p>
                    ) : reports.length === 0 ? (
                      <p className="blume-muted">No reports filed yet.</p>
                    ) : (
                      (() => {
                        const q = reportSearchQuery.trim().toLowerCase();
                        const filtered = q
                          ? reports.filter(
                              (r) =>
                                r.title.toLowerCase().includes(q) ||
                                r.body.toLowerCase().includes(q) ||
                                r.authorUsername.toLowerCase().includes(q) ||
                                (r.linkedUsername || "").toLowerCase().includes(q)
                            )
                          : reports;
                        return filtered.length === 0 ? (
                          <p className="blume-muted">No reports match "{reportSearchQuery}".</p>
                        ) : (
                          filtered.map((r) => (
                            <div className="blume-report-card" key={r.id}>
                              <div className="blume-report-card-head">
                                <strong>{r.title}</strong>
                                <button
                                  className="blume-report-delete"
                                  onClick={() => handleDeleteReport(r.id)}
                                  title="Delete report"
                                >
                                  ✕
                                </button>
                              </div>
                              <p>{r.body}</p>
                              <span className="blume-report-meta">
                                Filed by {r.authorUsername} · {new Date(r.createdAt).toLocaleString()}
                                {r.linkedUsername && (
                                  <>
                                    {" "}
                                    · linked to <strong>{r.linkedUsername}</strong>
                                  </>
                                )}
                              </span>
                            </div>
                          ))
                        );
                      })()
                    )}
                  </div>
                </>
              )}
            </div>

            <div className={`blume-panel blume-map-panel${collapsedPanels.map ? " blume-panel-collapsed" : ""}`}>
              <button className="blume-panel-header blume-panel-header-toggle" onClick={() => togglePanel("map")}>
                <span>Surveillance Grid</span>
                <span className="blume-panel-toggle-icon">{collapsedPanels.map ? "▸" : "▾"}</span>
              </button>
              {!collapsedPanels.map && (
                <div className="blume-map">
                  <div className="blume-map-grid" />
                  {PLACEHOLDER_PINS.map((p) => (
                    <div
                      className="blume-map-pin"
                      key={p.label}
                      style={{ left: `${p.x}%`, top: `${p.y}%` }}
                      title={p.label}
                    >
                      <span className="blume-map-pin-dot" />
                      <span className="blume-map-pin-label">{p.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`blume-panel blume-search-panel${collapsedPanels.search ? " blume-panel-collapsed" : ""}`}>
              <button className="blume-panel-header blume-panel-header-toggle" onClick={() => togglePanel("search")}>
                <span>Person Search</span>
                <span className="blume-panel-toggle-icon">{collapsedPanels.search ? "▸" : "▾"}</span>
              </button>
              {!collapsedPanels.search && (
              <>
              <div className="blume-search-form">
                <input
                  placeholder="Search by name or ID…"
                  value={personQuery}
                  onChange={(e) => setPersonQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !personLoading) handlePersonSearch();
                  }}
                />
                <button
                  className="blume-cta-btn"
                  disabled={!personQuery.trim() || personLoading}
                  onClick={handlePersonSearch}
                >
                  {personLoading ? "Searching…" : "Search"}
                </button>
              </div>
              {personError && (
                <p className={`blume-error${personFading ? " fading-out" : ""}`}>{personError}</p>
              )}
              {!personResult && !personError && (
                <p className="blume-muted blume-search-hint">
                  Search by name or Roblox ID, {username}. Every search is logged and cached.
                </p>
              )}

              {personResult && (
                <div className="blume-person-result">
                  <div className="blume-person-head">
                    {personResult.avatarUrl && (
                      <img className="blume-person-photo" src={personResult.avatarUrl} alt="" />
                    )}
                    <div>
                      <strong className="blume-person-name">{personResult.username}</strong>
                      <span className="blume-person-id">ID {personResult.userId}</span>
                    </div>
                  </div>

                  {personResult.apiError && (
                    <p className="blume-error">{personResult.apiError}</p>
                  )}

                  <div className="blume-person-row">
                    <span className="blume-person-label">Equipped plate</span>
                    <span className="blume-person-value">
                      {personResult.customPlate || "None on file"}
                    </span>
                  </div>

                  <div className="blume-person-history-actions">
                    <button className="blume-view-previous-btn" onClick={togglePreviousPhotos}>
                      {showPreviousPhotos ? "Hide previous photos" : "View Previous Photos"}
                    </button>
                    <button className="blume-view-previous-btn" onClick={togglePreviousPlates}>
                      {showPreviousPlates ? "Hide previous plates" : "View Previous Plates"}
                    </button>
                  </div>

                  {showPreviousPhotos && (
                    <div className="blume-history-panel">
                      {historyLoading ? (
                        <p className="blume-muted">Loading…</p>
                      ) : history.length === 0 ? (
                        <p className="blume-muted">No previous photos cached.</p>
                      ) : (
                        <div className="blume-history-photo-grid">
                          {history.map((h) => (
                            <div className="blume-history-photo-item" key={h.id}>
                              {h.avatarUrl ? (
                                <img src={h.avatarUrl} alt="" />
                              ) : (
                                <div className="blume-history-photo-empty" />
                              )}
                              <span>{new Date(h.createdAt).toLocaleDateString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {showPreviousPlates && (
                    <div className="blume-history-panel">
                      {historyLoading ? (
                        <p className="blume-muted">Loading…</p>
                      ) : history.length === 0 ? (
                        <p className="blume-muted">No previous plates cached.</p>
                      ) : (
                        <div className="blume-history-list">
                          {history.map((h) => (
                            <div className="blume-history-row" key={h.id}>
                              <span>{h.customPlate || "—"}</span>
                              <span className="blume-history-meta">
                                {new Date(h.createdAt).toLocaleString()} · searched by{" "}
                                {h.searchedByUsername}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="blume-person-section">
                    <span className="blume-person-label">Known vehicles</span>
                    <div className="blume-vehicle-list">
                      {personResult.vehicleTags.length === 0 && (
                        <p className="blume-muted">None tagged yet.</p>
                      )}
                      {personResult.vehicleTags.map((v) => (
                        <div className="blume-vehicle-chip" key={v.id}>
                          <span>{v.vehicleType}</span>
                          <button onClick={() => handleRemoveVehicle(v.id)} title="Remove">
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="blume-vehicle-form">
                      <input
                        placeholder="Add a known vehicle type…"
                        value={newVehicleType}
                        onChange={(e) => setNewVehicleType(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !addingVehicle) handleAddVehicle();
                        }}
                      />
                      <button
                        className="blume-cta-btn"
                        disabled={!newVehicleType.trim() || addingVehicle}
                        onClick={handleAddVehicle}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="blume-person-section">
                    <span className="blume-person-label">Groups</span>
                    {personResult.groups.length === 0 ? (
                      <p className="blume-muted">No relevant group memberships found.</p>
                    ) : (
                      <div className="blume-group-list">
                        {personResult.groups.map((g) => (
                          <span
                            key={g.id}
                            className={`blume-group-chip ${g.tier === "red" ? "blume-group-red" : ""}`}
                          >
                            {g.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="blume-person-section">
                    <span className="blume-person-label">Arrest history</span>
                    <ArrestRecord data={personResult.arrestHistory} />
                  </div>

                  <div className="blume-person-section">
                    <span className="blume-person-label">Linked intelligence reports</span>
                    {personLinkedReportsLoading ? (
                      <p className="blume-muted">Loading…</p>
                    ) : personLinkedReports.length === 0 ? (
                      <p className="blume-muted">No reports linked to this person.</p>
                    ) : (
                      <div className="blume-reports-list">
                        {personLinkedReports.map((r) => (
                          <div className="blume-report-card" key={r.id}>
                            <div className="blume-report-card-head">
                              <strong>{r.title}</strong>
                            </div>
                            <p>{r.body}</p>
                            <span className="blume-report-meta">
                              Filed by {r.authorUsername} · {new Date(r.createdAt).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              </>
              )}
            </div>

            {canEditBlog && (
              <div className={`blume-panel blume-group-search-panel${collapsedPanels.groupSearch ? " blume-panel-collapsed" : ""}`}>
                <button
                  className="blume-panel-header blume-panel-header-toggle"
                  onClick={() => togglePanel("groupSearch")}
                >
                  <span>Group Search</span>
                  <span className="blume-panel-toggle-icon">{collapsedPanels.groupSearch ? "▸" : "▾"}</span>
                </button>
                {!collapsedPanels.groupSearch && (
                  <>
                    <p className="blume-muted blume-search-hint">
                      Paste a group ID and every member is scanned for their groups, photo, and
                      plate. This respects the records API's rate limit, so large groups take a
                      while — keep this tab open until it finishes.
                    </p>
                    <div className="blume-search-form">
                      <input
                        placeholder="Group ID…"
                        value={groupSearchId}
                        onChange={(e) => setGroupSearchId(e.target.value)}
                        disabled={groupScanning}
                      />
                      {groupScanning ? (
                        <button className="blume-cta-btn" onClick={stopGroupScan}>
                          Stop
                        </button>
                      ) : (
                        <button
                          className="blume-cta-btn"
                          disabled={!groupSearchId.trim()}
                          onClick={startGroupScan}
                        >
                          Start scan
                        </button>
                      )}
                    </div>
                    {groupScanError && <p className="blume-error">{groupScanError}</p>}
                    {(groupScanning || groupScanProgress.total > 0) && (
                      <div className="blume-group-scan-progress">
                        <span>
                          {groupScanProgress.scanned} / {groupScanProgress.total || "…"} scanned
                          {groupScanning ? "…" : groupScanProgress.total ? " — done" : ""}
                        </span>
                        {groupScanProgress.total > 0 && (
                          <div className="blume-group-scan-bar">
                            <div
                              className="blume-group-scan-bar-fill"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (groupScanProgress.scanned / Math.max(1, groupScanProgress.total)) * 100
                                )}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {groupScanLog.length > 0 && (
                      <div className="blume-group-scan-log">
                        {groupScanLog.map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {canEditBlog && (
              <div className={`blume-panel blume-group-viewer-panel${collapsedPanels.groupViewer ? " blume-panel-collapsed" : ""}`}>
                <button
                  className="blume-panel-header blume-panel-header-toggle"
                  onClick={() => togglePanel("groupViewer")}
                >
                  <span>Group Viewer</span>
                  <span className="blume-panel-toggle-icon">{collapsedPanels.groupViewer ? "▸" : "▾"}</span>
                </button>
                {!collapsedPanels.groupViewer && (
                  <>
                    <div className="blume-group-sections">
                      <span className="blume-person-label">Browse a group</span>
                      <div className="blume-group-list">
                        {GROUP_VIEWER_SECTIONS.map((g) => (
                          <button
                            key={g.id}
                            className={`blume-group-chip blume-group-section-btn ${
                              g.tier === "red" ? "blume-group-red" : ""
                            } ${viewerGroupId === String(g.id) ? "blume-group-section-active" : ""}`}
                            onClick={() => {
                              setViewerGroupId(String(g.id));
                              runGroupViewer(String(g.id));
                            }}
                            disabled={viewerLoading}
                          >
                            {g.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="blume-search-form">
                      <input
                        placeholder="Or paste a group ID…"
                        value={viewerGroupId}
                        onChange={(e) => setViewerGroupId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !viewerLoading) runGroupViewer();
                        }}
                      />
                      <button
                        className="blume-cta-btn"
                        disabled={!viewerGroupId.trim() || viewerLoading}
                        onClick={() => runGroupViewer()}
                      >
                        {viewerLoading ? "Searching…" : "Search"}
                      </button>
                    </div>
                    {viewerError && <p className="blume-error">{viewerError}</p>}
                    {!viewerLoading && !viewerError && viewerResults.length === 0 && (
                      <p className="blume-muted">
                        No scanned members found in that group yet — run a Group Search first.
                      </p>
                    )}
                    <div className="blume-group-viewer-list">
                      {viewerResults.map((m) => (
                        <div className="blume-group-viewer-row" key={m.userId}>
                          {m.avatarUrl && <img src={m.avatarUrl} alt="" />}
                          <div>
                            <strong>{m.username}</strong>
                            <span className="blume-history-meta">
                              {m.customPlate || "No plate on file"} · scanned{" "}
                              {new Date(m.scannedAt).toLocaleDateString()}
                            </span>
                            {m.relevantGroups && m.relevantGroups.length > 0 && (
                              <div className="blume-group-list blume-group-list-compact">
                                {m.relevantGroups.map((g) => (
                                  <span
                                    key={g.id}
                                    className={`blume-group-chip ${g.tier === "red" ? "blume-group-red" : ""}`}
                                  >
                                    {g.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
