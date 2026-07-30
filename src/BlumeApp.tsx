import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import { jsPDF } from "jspdf";
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
  expiresAt?: number;
}

interface BlumeBlogPost {
  id: string;
  title: string;
  excerpt: string;
  readMinutes: number;
  authorUsername: string;
  createdAt: number;
}

type GroupCategory = "Emergency Services" | "Intelligence" | "IE" | "OCG";
const GROUP_CATEGORY_ORDER: GroupCategory[] = ["Emergency Services", "Intelligence", "IE", "OCG"];

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

interface GroupScanChange {
  username: boolean;
  groups: boolean;
  friends: boolean;
  at: number;
}

interface PersonSearchResult {
  userId: string;
  username: string;
  avatarUrl: string | null;
  customPlate: string | null;
  arrestHistory: unknown;
  groups: PersonGroup[];
  vehicleTags: VehicleTag[];
  knownFriends: KnownFriend[];
  groupScanChange: GroupScanChange | null;
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

interface GroupScanMember {
  userId: string;
  username: string;
  avatarUrl: string | null;
  customPlate: string | null;
  groupIds: number[];
  scannedAt: number;
  relevantGroups?: PersonGroup[];
}

function formatClockTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function loadInvertedLogoDataUrl(url: string): Promise<string | null> {
  try {
    const img = await loadImageElement(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function generatePaperTextureDataUrl(width = 850, height = 1200): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#fbf9f2";
  ctx.fillRect(0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 9;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function formatDateTimeNoSeconds(value: Date | number): string {
  const d = typeof value === "number" ? new Date(value) : value;
  const datePart = d.toLocaleDateString();
  const timePart = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

function formatDateForFilename(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
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

function randomStampAngle(): number {
  const magnitude = 10 + Math.random() * 25;
  return Math.random() < 0.5 ? -magnitude : magnitude;
}

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
        <div className="blume-arrest-row" key={key}>
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
        [...ARREST_CHARGE_KEYS, ...ARREST_OFFICER_KEYS, ...ARREST_DATE_KEYS].map((k) =>
          k.toLowerCase()
        )
      );
      const rest = Object.entries(obj).filter(([k]) => !knownKeysLower.has(k.toLowerCase()));
      return (
        <div className="blume-arrest-row" key={key}>
          {charges.length > 0 && (
            <div className="blume-arrest-charges">{charges.join(", ")}</div>
          )}
          <div className="blume-arrest-meta">
            {officer !== undefined && <span>Arrested by {String(officer)}</span>}
            {whenMs !== null && <span>{new Date(whenMs).toLocaleString()}</span>}
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
      <div className="blume-arrest-row" key={key}>
        {String(item)}
      </div>
    );
  }

  const indexed = list.map((item, i) => ({ item, i, whenMs: extractWhenMs(item) }));
  const sorted = [...indexed].sort((a, b) => (b.whenMs ?? -Infinity) - (a.whenMs ?? -Infinity));
  const shown = sorted.slice(0, ARREST_SHOWN_CAP);

  const recentCutoff = Date.now() - ARREST_RECENT_WINDOW_MS;
  const recentCount = indexed.filter(
    (e) => e.whenMs !== null && e.whenMs >= recentCutoff
  ).length;

  return (
    <div className="blume-arrest-list">
      {shown.map((e) => renderItem(e.item, e.i))}
      {recentCount > 0 && (
        <div className="blume-arrest-row blume-arrest-overflow">
          {recentCount} arrest{recentCount === 1 ? "" : "s"} in the last 10 days
        </div>
      )}
    </div>
  );
}

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

const REQUEST_ACCESS_URL = "https://discord.gg/DHs9HnQ3JE";

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

interface CustomSelectOption {
  value: string;
  label: string;
  tone?: "red" | "white";
}

function CustomSelect({
  value,
  options,
  onChange,
  className = "",
}: {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const selected = options[selectedIndex];

  function openList() {
    setHighlight(selectedIndex);
    setOpen(true);
  }

  function pick(index: number) {
    const opt = options[index];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(options.length - 1, h + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(highlight);
    }
  }

  return (
    <div className={`blume-custom-select ${className}`} ref={rootRef}>
      <button
        type="button"
        className={`blume-custom-select-trigger${open ? " blume-custom-select-open" : ""}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span
          className={`blume-custom-select-value${
            selected?.tone === "red" ? " blume-group-red" : ""
          }`}
        >
          {selected?.label || ""}
        </span>
        <span className="blume-custom-select-arrow">▾</span>
      </button>
      {open && (
        <ul className="blume-custom-select-list" role="listbox">
          {options.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`blume-custom-select-option${
                i === highlight ? " blume-custom-select-highlight" : ""
              }${opt.value === value ? " blume-custom-select-selected" : ""}${
                opt.tone === "red" ? " blume-group-red" : ""
              }`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BlumeMarquee() {
  const containerRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const setRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef(0);
  const offsetRef = useRef(0);
  const [copies, setCopies] = useState(2);

  useEffect(() => {
    const containerEl = containerRef.current;
    const setEl = setRef.current;
    if (!containerEl || !setEl) return;

    function recomputeCopies() {
      if (!containerEl) return;
      const setWidth = widthRef.current;
      const containerWidth = containerEl.getBoundingClientRect().width;
      if (setWidth <= 0) return;
      const needed = Math.ceil(containerWidth / setWidth) + 2;
      setCopies((prev) => (prev !== needed ? needed : prev));
    }

    function measure() {
      if (setEl) widthRef.current = setEl.getBoundingClientRect().width;
      recomputeCopies();
    }
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(setEl);
    ro.observe(containerEl);

    let cancelled = false;
    document.fonts?.ready
      ?.then(() => {
        if (!cancelled) measure();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const trackEl = trackRef.current;
    if (!trackEl) return;

    const SPEED = 36; // px per second
    let lastTime: number | null = null;
    let raf = 0;

    function tick(time: number) {
      const setWidth = widthRef.current;
      if (trackEl && setWidth > 0 && lastTime !== null) {
        const dt = Math.min((time - lastTime) / 1000, 0.1);
        offsetRef.current -= SPEED * dt;
        if (offsetRef.current <= -setWidth) offsetRef.current += setWidth;
        trackEl.style.left = `${offsetRef.current}px`;
      }
      lastTime = time;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="blume-marquee" ref={containerRef}>
      <div className="blume-marquee-track" ref={trackRef}>
        {Array.from({ length: copies }).map((_, copyIndex) => (
          <div
            className="blume-marquee-set"
            key={copyIndex}
            ref={copyIndex === 0 ? setRef : undefined}
            aria-hidden={copyIndex === 0 ? undefined : true}
          >
            {INDUSTRIES.map((ind) => (
              <span className="blume-marquee-item" key={ind.title}>
                {ind.title}
              </span>
            ))}
          </div>
        ))}
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
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const heroIndex = useHeroCycle(HERO_IMAGES.length, HERO_CYCLE_MS);

  const [inGameUsers, setInGameUsers] = useState<
    { username: string; avatarUrl: string | null; redGroupName: string | null; role: string | null }[]
  >([]);
  const [inGameLive, setInGameLive] = useState(false);
  const [inGameLastUpdatedAt, setInGameLastUpdatedAt] = useState<number | null>(null);
  const [inGameSearchQuery, setInGameSearchQuery] = useState("");
  const [activeAgents, setActiveAgents] = useState<{ username: string; role: string }[]>([]);

  const [reports, setReports] = useState<BlumeReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkedPerson, setLinkedPerson] = useState("");
  const [reportExpiry, setReportExpiry] = useState("");
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
  const [generatingReport, setGeneratingReport] = useState(false);
  const [confirmingReport, setConfirmingReport] = useState(false);
  const [generatingGroupReport, setGeneratingGroupReport] = useState(false);
  const [confirmingGroupReport, setConfirmingGroupReport] = useState(false);

  const [groupsTab, setGroupsTab] = useState<"search" | "settings">("search");
  const [groupQuery, setGroupQuery] = useState("");
  const [groupScanning, setGroupScanning] = useState(false);
  const [groupScanProgress, setGroupScanProgress] = useState({ scanned: 0, total: 0 });
  const [groupScanLog, setGroupScanLog] = useState<string[]>([]);
  const [groupScanError, setGroupScanError] = useState<string | null>(null);
  const groupScanStopRef = useRef(false);

  const [viewerResults, setViewerResults] = useState<GroupScanMember[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const [groupCatalog, setGroupCatalog] = useState<PersonGroup[]>([]);
  const [newGroupId, setNewGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupCategory, setNewGroupCategory] = useState<GroupCategory>("Emergency Services");
  const [addingGroup, setAddingGroup] = useState(false);
  const [removingGroupId, setRemovingGroupId] = useState<number | null>(null);
  const { error: addGroupError, fading: addGroupFading, setError: setAddGroupError } = useFadingError();

  const [monitoringUsers, setMonitoringUsers] = useState<
    { username: string; redGroupName: string | null; activityCount: number }[]
  >([]);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [monitoringSearch, setMonitoringSearch] = useState("");
  const [monitoringSelected, setMonitoringSelected] = useState<string | null>(null);
  const [monitoringDetailLoading, setMonitoringDetailLoading] = useState(false);
  const [monitoringData, setMonitoringData] = useState<{
    conversations: {
      withUsername: string;
      messages: { id: string; from: string; to: string; text: string; createdAt: number; deleted: boolean }[];
    }[];
    posts: { id: string; text: string; imageUrl: string | null; createdAt: number; deleted: boolean }[];
  } | null>(null);
  const [expandedMonitoringCards, setExpandedMonitoringCards] = useState<Record<string, boolean>>({});
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function loadAccess() {
    try {
      const res = await fetch("/api/blume-content?type=report");
      const data = await res.json();
      setCanAccess(!!data.canAccess);
      setIsSuperUser(!!data.isSuperUser);
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

  async function loadActiveAgents() {
    try {
      const res = await fetch("/api/blume-search?activeAgents=1");
      if (!res.ok) return;
      const data = await res.json();
      setActiveAgents(data.agents || []);
    } catch {
    }
  }

  async function loadInGameUsers() {
    try {
      const res = await fetch("/api/blume-search?activeInGame=1");
      if (!res.ok) return;
      const data = await res.json();
      setInGameUsers(data.users || []);
      setInGameLive(!!data.live);
      setInGameLastUpdatedAt(data.updatedAt || null);
    } catch {
    }
  }

  useEffect(() => {
    if (!loggedIn) return;
    loadActiveAgents();
    loadInGameUsers();
    const id = window.setInterval(() => {
      loadActiveAgents();
      loadInGameUsers();
    }, 20000);
    return () => window.clearInterval(id);
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    loadGroupCatalog();
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    loadMonitoringUsers();
  }, [loggedIn]);

  function handleLogin() {
    if (!canAccess) return;
    onMaximize?.();
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
          expiresAt: reportExpiry || undefined,
        }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      setTitle("");
      setBody("");
      setLinkedPerson("");
      setReportExpiry("");
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

  function jumpToPersonReports(username: string) {
    setCollapsedPanels((prev) => ({ ...prev, reports: false }));
    setReportSearchQuery(username);
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

  const [usernameCopied, setUsernameCopied] = useState(false);

  function handleUsernameClick(name: string) {
    setCollapsedPanels((prev) => ({ ...prev, search: false }));
    handlePersonSearch(name);
  }

  async function handleCopyUsername(name: string) {
    try {
      await navigator.clipboard.writeText(name);
      setUsernameCopied(true);
      window.setTimeout(() => setUsernameCopied(false), 1500);
    } catch {
    }
  }

  async function handlePersonSearch(overrideQuery?: string) {
    const q = (overrideQuery ?? personQuery).trim();
    if (!q) return;
    if (overrideQuery) setPersonQuery(overrideQuery);
    setPersonLoading(true);
    setPersonError(null);
    setShowPreviousPhotos(false);
    setShowPreviousPlates(false);
    setPersonLinkedReports([]);
    try {
      const res = await fetch(`/api/blume-search?query=${encodeURIComponent(q)}`);
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

  async function generatePersonReport() {
    if (!personResult) return;
    setGeneratingReport(true);
    try {
      let historyForReport = history;
      if (historyForReport.length === 0) {
        try {
          const res = await fetch(
            `/api/blume-search?history=${encodeURIComponent(personResult.userId)}`
          );
          const data = await res.json();
          historyForReport = data.history || [];
        } catch {
          historyForReport = [];
        }
      }
      const logoDataUrl = await loadInvertedLogoDataUrl("/blume-logo.png");
      const generatedAt = new Date();
      const textureDataUrl = generatePaperTextureDataUrl();

      const photoCandidates: { url: string; at: number }[] = [];
      if (personResult.avatarUrl) {
        photoCandidates.push({ url: personResult.avatarUrl, at: Number.MAX_SAFE_INTEGER });
      }
      for (const h of historyForReport) {
        if (h.avatarUrl) photoCandidates.push({ url: h.avatarUrl, at: h.createdAt });
      }
      const seenPhotoUrls = new Set<string>();
      const topPhotoUrls = photoCandidates
        .filter((p) => (seenPhotoUrls.has(p.url) ? false : (seenPhotoUrls.add(p.url), true)))
        .sort((a, b) => b.at - a.at)
        .slice(0, 3);
      const loadedPhotos = (
        await Promise.all(topPhotoUrls.map((p) => loadRemoteImageAsDataUrl(p.url)))
      ).filter((p): p is { dataUrl: string; format: "PNG" | "JPEG" } => !!p);

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 48;
      const maxWidth = pageWidth - marginX * 2;
      const bottomLimit = pageHeight - 70;
      let y = 56;

      function paintPageBackground() {
        if (!textureDataUrl) return;
        doc.addImage(textureDataUrl, "JPEG", 0, 0, pageWidth, pageHeight);
      }
      paintPageBackground();

      function ensureSpace(lineHeight: number) {
        if (y + lineHeight > bottomLimit) {
          doc.addPage();
          paintPageBackground();
          y = 56;
        }
      }

      function heading(text: string) {
        ensureSpace(30);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(20, 20, 20);
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
        const wrapped = doc.splitTextToSize(text, maxWidth);
        for (const w of wrapped) {
          ensureSpace(14);
          doc.text(w, marginX, y);
          y += 14;
        }
      }

      function spacer(h = 14) {
        y += h;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(20, 20, 20);
      doc.text("INTELLIGENCE REPORT", marginX, y);

      if (loadedPhotos.length > 0) {
        const photoSize = 36;
        const photoGap = 8;
        const rowWidth = loadedPhotos.length * photoSize + (loadedPhotos.length - 1) * photoGap;
        let photoX = pageWidth - marginX - rowWidth;
        const photoY = y - 26;
        for (const photo of loadedPhotos) {
          doc.addImage(photo.dataUrl, photo.format, photoX, photoY, photoSize, photoSize);
          doc.setDrawColor(170, 170, 170);
          doc.rect(photoX, photoY, photoSize, photoSize);
          photoX += photoSize + photoGap;
        }
      }
      y += 30;

      heading("Subject Overview");
      line(`Username: ${personResult.username}`);
      line(`User ID: ${personResult.userId}`);
      line(`Equipped plate: ${personResult.customPlate || "None on file"}`);
      const isActiveNow = inGameUsers.some(
        (u) => u.username.toLowerCase() === personResult.username.toLowerCase()
      );
      line(
        `Status: ${
          isActiveNow
            ? "Currently active in-game"
            : personResult.lastSeenOnlineAt
              ? `Last online ${formatLastOnline(personResult.lastSeenOnlineAt)}`
              : "No recent activity on file"
        }`
      );
      spacer();

      heading("Group Membership & Changes");
      if (personResult.groups.length === 0) {
        line("No relevant group memberships found.");
      } else {
        for (const g of personResult.groups) {
          line(`- ${g.name} (${g.category || (g.tier === "red" ? "Flagged" : "Standard")})`);
        }
      }
      if (personResult.groupScanChange) {
        spacer(6);
        const c = personResult.groupScanChange;
        const changed = [
          c.username && "username",
          c.groups && "group memberships",
          c.friends && "known friends",
        ]
          .filter(Boolean)
          .join(", ");
        line(
          `Most recent change detected: ${changed || "none"} — ${formatDateTimeNoSeconds(c.at)}`
        );
      }
      spacer();

      heading("Known Vehicles");
      if (personResult.vehicleTags.length === 0) {
        line("None tagged.");
      } else {
        for (const v of personResult.vehicleTags) {
          line(
            `- ${v.vehicleType} — tagged by ${v.addedByUsername} on ${new Date(v.createdAt).toLocaleDateString()}`
          );
        }
      }
      spacer();

      heading("Known Friends");
      if (personResult.knownFriends.length === 0) {
        line("None on file.");
      } else {
        for (const f of personResult.knownFriends) {
          line(
            `- ${f.username}${f.redGroupNames.length ? ` (${f.redGroupNames.join(", ")})` : ""}`
          );
        }
      }
      spacer();

      heading("Linked Intelligence Reports");
      if (personLinkedReports.length === 0) {
        line("No reports linked to this person.");
      } else {
        for (const r of personLinkedReports) {
          line(`${r.title} — filed by ${r.authorUsername} on ${new Date(r.createdAt).toLocaleDateString()}`);
          line(r.body);
          spacer(6);
        }
      }
      spacer();

      heading("Arrest History");
      const arrestList = Array.isArray(personResult.arrestHistory)
        ? (personResult.arrestHistory as unknown[])
        : personResult.arrestHistory != null
          ? [personResult.arrestHistory]
          : [];
      let hasNstArrest = false;
      const renderChargeLike = (value: unknown) => {
        if (typeof value === "number") return getChargeName(value);
        if (typeof value === "string" && /^\d+$/.test(value)) return getChargeName(value);
        return String(value);
      };
      if (arrestList.length === 0) {
        line("None on file.");
      } else {
        for (const item of arrestList) {
          if (item && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            const chargeField = getFieldCI(obj, ARREST_CHARGE_KEYS);
            const charges = Array.isArray(chargeField)
              ? chargeField.map(renderChargeLike)
              : chargeField !== undefined
                ? [renderChargeLike(chargeField)]
                : [];
            if (charges.some((c) => c === "National Security Threat")) hasNstArrest = true;
            const officer = getFieldCI(obj, ARREST_OFFICER_KEYS);
            const when = getFieldCI(obj, ARREST_DATE_KEYS);
            let whenMs: number | null = null;
            if (typeof when === "number") whenMs = normalizeTimestampMs(when);
            else if (typeof when === "string") {
              const parsed = Date.parse(when);
              if (!Number.isNaN(parsed)) whenMs = parsed;
            }
            line(
              `- ${charges.length > 0 ? charges.join(", ") : "Unspecified charge"}${
                officer !== undefined ? ` — by ${String(officer)}` : ""
              }${whenMs !== null ? ` — ${formatDateTimeNoSeconds(whenMs)}` : ""}`
            );
          } else {
            const resolved = renderChargeLike(item);
            if (resolved === "National Security Threat") hasNstArrest = true;
            line(`- ${resolved}`);
          }
        }
      }
      spacer();

      heading("Plate & Search History");
      if (historyForReport.length === 0) {
        line("No previous snapshots cached.");
      } else {
        for (const h of historyForReport) {
          line(
            `- ${h.customPlate || "No plate"} — searched by ${h.searchedByUsername} on ${formatDateTimeNoSeconds(h.createdAt)}`
          );
        }
      }

      const stampZoneTop = y + 10;
      const stampZoneBottom = Math.max(stampZoneTop, bottomLimit - 6);
      function randomStampPoint() {
        return {
          x: marginX + 60 + Math.random() * Math.max(0, maxWidth - 120),
          y: stampZoneTop + Math.random() * (stampZoneBottom - stampZoneTop),
        };
      }

      const verifiedPoint = randomStampPoint();
      const verifiedAngle = randomStampAngle();

      let nstPoint: { x: number; y: number } | null = null;
      let nstAngle = 0;
      if (hasNstArrest) {
        const minDist = 80;
        let candidate = randomStampPoint();
        for (let attempt = 0; attempt < 20; attempt++) {
          const dx = candidate.x - verifiedPoint.x;
          const dy = candidate.y - verifiedPoint.y;
          if (Math.sqrt(dx * dx + dy * dy) >= minDist) break;
          candidate = randomStampPoint();
        }
        nstPoint = candidate;
        nstAngle = randomStampAngle();
      }

      doc.setGState(doc.GState({ opacity: 0.55 }));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(26);
      doc.setTextColor(160, 30, 30);
      doc.text("[ VERIFIED ]", verifiedPoint.x, verifiedPoint.y, {
        angle: verifiedAngle,
        align: "center",
      });
      if (nstPoint) {
        doc.setTextColor(110, 10, 10);
        doc.text("[ NST ]", nstPoint.x, nstPoint.y, { angle: nstAngle, align: "center" });
      }
      doc.setGState(doc.GState({ opacity: 1 }));

      const totalPages = doc.getNumberOfPages();
      const logoW = 12;
      const logoH = logoW * (903 / 823);
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        const footerY = pageHeight - 28;
        doc.setDrawColor(220, 220, 220);
        doc.line(marginX, footerY - 14, pageWidth - marginX, footerY - 14);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(120, 120, 120);
        const logoGap = logoDataUrl ? logoW + 6 : 0;
        if (logoDataUrl) {
          doc.addImage(logoDataUrl, "PNG", marginX, footerY - logoH + 3, logoW, logoH);
        }
        doc.text("Powered by Blume Corporation", marginX + logoGap, footerY);

        const generatedText = `Generated by ${username || "an unknown user"} on ${formatDateTimeNoSeconds(generatedAt)}`;
        const textWidth = doc.getTextWidth(generatedText);
        doc.text(generatedText, pageWidth - marginX - textWidth, footerY);
      }

      doc.save(`Intel-${personResult.username}-${formatDateForFilename(generatedAt)}.pdf`);
    } finally {
      setGeneratingReport(false);
    }
  }

  async function generateGroupReport() {
    setGeneratingGroupReport(true);
    try {
      const res = await fetch("/api/blume-search?groupCatalog=1&withCounts=1");
      const data = await res.json();
      const allGroups: (PersonGroup & { memberCount?: number | null })[] = data.groups || [];

      const logoDataUrl = await loadInvertedLogoDataUrl("/blume-logo.png");
      const generatedAt = new Date();
      const textureDataUrl = generatePaperTextureDataUrl();

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 48;
      const maxWidth = pageWidth - marginX * 2;
      const bottomLimit = pageHeight - 70;
      let y = 56;

      function paintPageBackground() {
        if (!textureDataUrl) return;
        doc.addImage(textureDataUrl, "JPEG", 0, 0, pageWidth, pageHeight);
      }
      paintPageBackground();

      function ensureSpace(lineHeight: number) {
        if (y + lineHeight > bottomLimit) {
          doc.addPage();
          paintPageBackground();
          y = 56;
        }
      }

      function heading(text: string) {
        ensureSpace(30);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(20, 20, 20);
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
        const wrapped = doc.splitTextToSize(text, maxWidth);
        for (const w of wrapped) {
          ensureSpace(14);
          doc.text(w, marginX, y);
          y += 14;
        }
      }

      function spacer(h = 14) {
        y += h;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(20, 20, 20);
      doc.text("GROUP REGISTRY REPORT", marginX, y);
      y += 30;

      for (const cat of GROUP_CATEGORY_ORDER) {
        const items = allGroups.filter(
          (g) => (g.category || (g.tier === "red" ? "OCG" : "Emergency Services")) === cat
        );
        heading(`${cat} (${items.length})`);
        if (items.length === 0) {
          line("No groups on file.");
        } else {
          for (const g of items) {
            line(
              `- ${g.name} — ${
                typeof g.memberCount === "number" ? g.memberCount.toLocaleString() : "Unknown"
              } members — ID ${g.id}`
            );
          }
        }
        spacer();
      }

      const stampZoneTop = y + 10;
      const stampZoneBottom = Math.max(stampZoneTop, bottomLimit - 6);
      function randomStampPoint() {
        return {
          x: marginX + 60 + Math.random() * Math.max(0, maxWidth - 120),
          y: stampZoneTop + Math.random() * (stampZoneBottom - stampZoneTop),
        };
      }

      const verifiedPoint = randomStampPoint();
      const verifiedAngle = randomStampAngle();

      doc.setGState(doc.GState({ opacity: 0.55 }));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(26);
      doc.setTextColor(160, 30, 30);
      doc.text("[ VERIFIED ]", verifiedPoint.x, verifiedPoint.y, {
        angle: verifiedAngle,
        align: "center",
      });
      doc.setGState(doc.GState({ opacity: 1 }));

      const totalPages = doc.getNumberOfPages();
      const logoW = 12;
      const logoH = logoW * (903 / 823);
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        const footerY = pageHeight - 28;
        doc.setDrawColor(220, 220, 220);
        doc.line(marginX, footerY - 14, pageWidth - marginX, footerY - 14);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(120, 120, 120);
        const logoGap = logoDataUrl ? logoW + 6 : 0;
        if (logoDataUrl) {
          doc.addImage(logoDataUrl, "PNG", marginX, footerY - logoH + 3, logoW, logoH);
        }
        doc.text("Powered by Blume Corporation", marginX + logoGap, footerY);

        const generatedText = `Generated by ${username || "an unknown user"} on ${formatDateTimeNoSeconds(generatedAt)}`;
        const textWidth = doc.getTextWidth(generatedText);
        doc.text(generatedText, pageWidth - marginX - textWidth, footerY);
      }

      doc.save(`Group-Registry-${formatDateForFilename(generatedAt)}.pdf`);
    } finally {
      setGeneratingGroupReport(false);
    }
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

  async function startGroupScan() {
    const groupId = groupQuery.trim();
    if (!groupId || groupScanning) return;
    setGroupScanning(true);
    setGroupScanError(null);
    setGroupScanLog([]);
    setGroupScanProgress({ scanned: 0, total: 0 });
    groupScanStopRef.current = false;
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
    const groupId = (overrideGroupId ?? groupQuery).trim();
    if (!groupId) return;
    if (overrideGroupId) setGroupQuery(overrideGroupId);
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

  async function loadGroupCatalog() {
    try {
      const res = await fetch("/api/blume-search?groupCatalog=1");
      const data = await res.json();
      setGroupCatalog(data.groups || []);
    } catch {
    }
  }

  async function loadMonitoringUsers() {
    setMonitoringLoading(true);
    try {
      const res = await fetch("/api/blume-search?monitoringUsers=1");
      if (!res.ok) return;
      const data = await res.json();
      setMonitoringUsers(data.users || []);
    } catch {
    } finally {
      setMonitoringLoading(false);
    }
  }

  async function loadMonitoringChats(target: string) {
    setMonitoringSelected(target);
    setMonitoringData(null);
    setExpandedMonitoringCards({});
    setMonitoringDetailLoading(true);
    try {
      const res = await fetch(`/api/blume-search?monitoringChats=${encodeURIComponent(target)}`);
      if (!res.ok) return;
      const data = await res.json();
      setMonitoringData(data);
    } catch {
    } finally {
      setMonitoringDetailLoading(false);
    }
  }

  async function handleAddCustomGroup() {
    if (!newGroupId.trim() || !newGroupName.trim()) return;
    setAddingGroup(true);
    setAddGroupError(null);
    try {
      const res = await fetch("/api/blume-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addCustomGroup",
          groupId: newGroupId.trim(),
          groupName: newGroupName.trim(),
          groupCategory: newGroupCategory,
        }),
      });
      if (!res.ok) {
        setAddGroupError(await res.text());
        return;
      }
      setNewGroupId("");
      setNewGroupName("");
      setNewGroupCategory("Emergency Services");
      await loadGroupCatalog();
    } catch {
      setAddGroupError("Couldn't reach Group Settings.");
    } finally {
      setAddingGroup(false);
    }
  }

  async function handleRemoveCustomGroup(id: number) {
    setRemovingGroupId(id);
    setAddGroupError(null);
    try {
      const res = await fetch("/api/blume-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeCustomGroup", groupId: id }),
      });
      if (!res.ok) {
        setAddGroupError(await res.text());
        return;
      }
      await loadGroupCatalog();
    } catch {
      setAddGroupError("Couldn't reach Group Settings.");
    } finally {
      setRemovingGroupId(null);
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
                <img className="blume-brand-mark" src="/blume-logo.png" alt="" />
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
                <img className="blume-footer-mark" src="/blume-logo.png" alt="" />
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
            <div className="blume-active-label-group">
              <img className="blume-active-brand-mark" src="/blume-logo.png" alt="" />
              <span className="blume-active-label">{activeAgents.length} Active</span>
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
                  <div className="blume-report-form-section">
                    <button
                      className="blume-report-form-toggle"
                      onClick={() => togglePanel("reportForm")}
                    >
                      <span>File a report</span>
                      <span className="blume-panel-toggle-icon">
                        {collapsedPanels.reportForm ? "▸" : "▾"}
                      </span>
                    </button>
                    {!collapsedPanels.reportForm && (
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
                        <label className="blume-report-expiry-field">
                          Expires
                          <input
                            type="date"
                            value={reportExpiry}
                            onChange={(e) => setReportExpiry(e.target.value)}
                          />
                        </label>
                        <button
                          className="blume-cta-btn"
                          disabled={!title.trim() || !body.trim() || submitting}
                          onClick={handleAddReport}
                        >
                          {submitting ? "Filing…" : "File report"}
                        </button>
                        {error && <p className={`blume-error${fading ? " fading-out" : ""}`}>{error}</p>}
                      </div>
                    )}
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
                        const inGameLower = new Set(inGameUsers.map((u) => u.username.toLowerCase()));
                        const isLinkedInGame = (r: BlumeReport) =>
                          !!r.linkedUsername && inGameLower.has(r.linkedUsername.toLowerCase());
                        const sorted = [...filtered].sort((a, b) => {
                          const aIn = isLinkedInGame(a);
                          const bIn = isLinkedInGame(b);
                          return aIn === bIn ? 0 : aIn ? -1 : 1;
                        });
                        return sorted.length === 0 ? (
                          <p className="blume-muted">No reports match "{reportSearchQuery}".</p>
                        ) : (
                          sorted.map((r) => (
                            <div
                              className={`blume-report-card${isLinkedInGame(r) ? " blume-report-card-ingame" : ""}`}
                              key={r.id}
                            >
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
                                Filed by {r.authorUsername} · {new Date(r.createdAt).toLocaleDateString()}
                                {r.linkedUsername && (
                                  <>
                                    {" "}
                                    · linked to{" "}
                                    <strong
                                      className="blume-clickable-username"
                                      onClick={() => handleUsernameClick(r.linkedUsername!)}
                                    >
                                      {r.linkedUsername}
                                    </strong>
                                    {isLinkedInGame(r) && (
                                      <span className="blume-report-ingame-tag">IN GAME</span>
                                    )}
                                  </>
                                )}
                                {r.expiresAt && (
                                  <> · expires {new Date(r.expiresAt).toLocaleDateString()}</>
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
                <span>Field Activity</span>
                <span className="blume-panel-toggle-icon">{collapsedPanels.map ? "▸" : "▾"}</span>
              </button>
              {!collapsedPanels.map && (
                <div className="blume-map-body">
                  <div className="blume-ingame-list">
                    <span className="blume-person-label">
                      In game now
                      {!inGameLive && inGameLastUpdatedAt && (
                        <span className="blume-ingame-offline-tag">
                          {" "}
                          (Offline Since {formatClockTime(inGameLastUpdatedAt)})
                        </span>
                      )}
                    </span>
                    <input
                      className="blume-ingame-search"
                      placeholder="Search in-game users…"
                      value={inGameSearchQuery}
                      onChange={(e) => setInGameSearchQuery(e.target.value)}
                    />
                    {(() => {
                      const q = inGameSearchQuery.trim().toLowerCase();
                      const filtered = q
                        ? inGameUsers.filter((u) => u.username.toLowerCase().includes(q))
                        : inGameUsers;
                      if (inGameUsers.length === 0) {
                        return <p className="blume-muted">Nobody currently in-game.</p>;
                      }
                      if (filtered.length === 0) {
                        return <p className="blume-muted">No in-game users match "{inGameSearchQuery}".</p>;
                      }
                      const reportedLower = new Set(
                        reports
                          .filter((r) => r.linkedUsername)
                          .map((r) => r.linkedUsername!.toLowerCase())
                      );
                      return (
                        <div className="blume-ingame-users">
                          {filtered.map((u) => (
                            <div className="blume-ingame-user" key={u.username}>
                              {u.avatarUrl && <img src={u.avatarUrl} alt="" />}
                              <span
                                className="blume-clickable-username"
                                onClick={() => handleUsernameClick(u.username)}
                              >
                                {u.username}
                              </span>
                              {u.redGroupName && (
                                <span className="blume-ingame-red-group">{u.redGroupName}</span>
                              )}
                              {u.role && <span className="blume-ingame-role">{u.role}</span>}
                              {reportedLower.has(u.username.toLowerCase()) && (
                                <span
                                  className="blume-ingame-report-tag"
                                  title="Has an intelligence report"
                                  onClick={() => jumpToPersonReports(u.username)}
                                >
                                  REPORT
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
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
                  onClick={() => handlePersonSearch()}
                >
                  {personLoading ? "Searching…" : "Search"}
                </button>
              </div>
              {personError && (
                <p className={`blume-error${personFading ? " fading-out" : ""}`}>{personError}</p>
              )}
              {personResult && (
                <div className="blume-person-result">
                  <div className="blume-person-head">
                    {personResult.avatarUrl && (
                      <img className="blume-person-photo" src={personResult.avatarUrl} alt="" />
                    )}
                    <div>
                      {(() => {
                        const isPersonActive = inGameUsers.some(
                          (u) => u.username.toLowerCase() === personResult.username.toLowerCase()
                        );
                        return (
                          <>
                            <strong
                              className="blume-person-name blume-clickable-username"
                              title="Click to copy username"
                              onClick={() => handleCopyUsername(personResult.username)}
                            >
                              {personResult.username}
                              {isPersonActive && <span className="blume-person-active-tag">ACTIVE</span>}
                              {usernameCopied && <span className="blume-copied-tag">Copied</span>}
                            </strong>
                            <span className="blume-person-id">ID {personResult.userId}</span>
                            {!isPersonActive && personResult.lastSeenOnlineAt && (
                              <span className="blume-person-last-online">
                                Last online {formatLastOnline(personResult.lastSeenOnlineAt)}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {personResult.apiError && (
                    <p className="blume-error">{personResult.apiError}</p>
                  )}

                  {personResult.groupScanChange && (
                    <div className="blume-scan-change-banner">
                      Changed since the last group scan (
                      {new Date(personResult.groupScanChange.at).toLocaleString()}):{" "}
                      {[
                        personResult.groupScanChange.username && "username",
                        personResult.groupScanChange.groups && "group memberships",
                        personResult.groupScanChange.friends && "known friends",
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
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
                    <button
                      className="blume-view-previous-btn"
                      onClick={() => setConfirmingReport(true)}
                      disabled={generatingReport}
                    >
                      {generatingReport ? "Generating…" : "Generate Report"}
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

                  {personResult.knownFriends.length > 0 && (
                    <div className="blume-person-section">
                      <span className="blume-person-label">Known friends</span>
                      <div className="blume-friend-list">
                        {personResult.knownFriends.map((f) => (
                          <button
                            key={f.userId}
                            className={`blume-friend-chip${f.redGroupNames.length > 0 ? " blume-friend-chip-red" : ""}`}
                            onClick={() => handlePersonSearch(f.username)}
                            title={
                              f.redGroupNames.length > 0
                                ? `${f.username} — in ${f.redGroupNames.join(", ")}`
                                : `Search ${f.username}`
                            }
                          >
                            {f.avatarUrl && <img src={f.avatarUrl} alt="" />}
                            <span>{f.username}</span>
                            {f.redGroupNames.length > 0 && (
                              <span className="blume-ingame-red-group">{f.redGroupNames[0]}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

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
                              Filed by {r.authorUsername} · {new Date(r.createdAt).toLocaleDateString()}
                              {r.expiresAt && <> · expires {new Date(r.expiresAt).toLocaleDateString()}</>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="blume-person-section">
                    <span className="blume-person-label">Arrest history</span>
                    <ArrestRecord data={personResult.arrestHistory} />
                  </div>
                </div>
              )}
              </>
              )}
            </div>

            <div className={`blume-panel blume-group-search-panel${collapsedPanels.groups ? " blume-panel-collapsed" : ""}`}>
              <button
                className="blume-panel-header blume-panel-header-toggle"
                onClick={() => togglePanel("groups")}
              >
                <span>Group Search</span>
                <span className="blume-panel-toggle-icon">{collapsedPanels.groups ? "▸" : "▾"}</span>
              </button>
              {!collapsedPanels.groups && (
                <>
                  <div className="blume-groups-tabs">
                    <button
                      className={`blume-groups-tab-btn${groupsTab === "search" ? " blume-groups-tab-active" : ""}`}
                      onClick={() => setGroupsTab("search")}
                    >
                      Search
                    </button>
                    {isSuperUser && (
                      <button
                        className={`blume-groups-tab-btn${groupsTab === "settings" ? " blume-groups-tab-active" : ""}`}
                        onClick={() => setGroupsTab("settings")}
                      >
                        Group Settings
                      </button>
                    )}
                    {isSuperUser && (
                      <button
                        className="blume-groups-tab-btn"
                        onClick={() => setConfirmingGroupReport(true)}
                        disabled={generatingGroupReport}
                      >
                        {generatingGroupReport ? "Generating…" : "Generate Group Report"}
                      </button>
                    )}
                  </div>

                  {groupsTab === "search" && (
                    <>
                      <div className="blume-group-sections">
                        <span className="blume-person-label">Browse a group</span>
                        <div className="blume-group-list">
                          {groupCatalog.map((g) => (
                            <button
                              key={g.id}
                              className={`blume-group-chip blume-group-section-btn ${
                                g.tier === "red" ? "blume-group-red" : ""
                              } ${groupQuery === String(g.id) ? "blume-group-section-active" : ""}`}
                              onClick={() => {
                                setGroupQuery(String(g.id));
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
                          placeholder="Group ID or URL…"
                          value={groupQuery}
                          onChange={(e) => setGroupQuery(e.target.value)}
                          disabled={groupScanning}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !viewerLoading) runGroupViewer();
                          }}
                        />
                        <button
                          className="blume-cta-btn"
                          disabled={!groupQuery.trim() || viewerLoading}
                          onClick={() => runGroupViewer()}
                        >
                          {viewerLoading ? "Searching…" : "Search"}
                        </button>
                        {groupScanning ? (
                          <button className="blume-cta-btn" onClick={stopGroupScan}>
                            Stop
                          </button>
                        ) : (
                          <button
                            className="blume-cta-btn"
                            disabled={!groupQuery.trim()}
                            onClick={startGroupScan}
                          >
                            Scan
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

                      {viewerError && <p className="blume-error">{viewerError}</p>}
                      {!viewerLoading && !viewerError && viewerResults.length === 0 && (
                        <p className="blume-muted">
                          No scanned members found in that group yet — run a scan first.
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

                  {groupsTab === "settings" && isSuperUser && (
                    <>
                      <div className="blume-add-group-form">
                        <input
                          placeholder="Group ID or link…"
                          value={newGroupId}
                          onChange={(e) => setNewGroupId(e.target.value)}
                        />
                        <input
                          placeholder="Group name…"
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                        />
                        <CustomSelect
                          className="blume-group-category-select"
                          value={newGroupCategory}
                          onChange={(v) => setNewGroupCategory(v as GroupCategory)}
                          options={GROUP_CATEGORY_ORDER.map((cat) => ({
                            value: cat,
                            label: cat,
                            tone: cat === "IE" || cat === "OCG" ? "red" : "white",
                          }))}
                        />
                        <button
                          className="blume-cta-btn"
                          disabled={!newGroupId.trim() || !newGroupName.trim() || addingGroup}
                          onClick={handleAddCustomGroup}
                        >
                          {addingGroup ? "Adding…" : "Add group"}
                        </button>
                      </div>
                      {addGroupError && (
                        <p className={`blume-error${addGroupFading ? " fading-out" : ""}`}>{addGroupError}</p>
                      )}
                      <div className="blume-group-settings-list">
                        {GROUP_CATEGORY_ORDER.map((cat) => {
                          const items = groupCatalog.filter(
                            (g) => (g.category || (g.tier === "red" ? "OCG" : "Emergency Services")) === cat
                          );
                          if (items.length === 0) return null;
                          return (
                            <div key={cat} className="blume-group-category-section">
                              <span
                                className={`blume-person-label${
                                  cat === "IE" || cat === "OCG" ? " blume-group-red" : ""
                                }`}
                              >
                                {cat} ({items.length})
                              </span>
                              <div className="blume-group-list">
                                {items.map((g) => (
                                  <span
                                    key={g.id}
                                    className={`blume-group-chip blume-group-chip-removable ${
                                      g.tier === "red" ? "blume-group-red" : ""
                                    }`}
                                  >
                                    {g.name}
                                    <button
                                      className="blume-group-remove-btn"
                                      disabled={removingGroupId === g.id}
                                      onClick={() => handleRemoveCustomGroup(g.id)}
                                    >
                                      {removingGroupId === g.id ? "…" : "×"}
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div
              className={`blume-panel blume-monitoring-panel${
                collapsedPanels.monitoring ? " blume-panel-collapsed" : ""
              }`}
            >
              <button
                className="blume-panel-header blume-panel-header-toggle"
                onClick={() => togglePanel("monitoring")}
              >
                <span>Monitoring</span>
                <span className="blume-panel-toggle-icon">
                  {collapsedPanels.monitoring ? "▸" : "▾"}
                </span>
              </button>
                {!collapsedPanels.monitoring && (
                  <div className="blume-monitoring-body">
                    {!monitoringSelected ? (
                      <>
                        <input
                          className="blume-monitoring-search"
                          placeholder="Search a username…"
                          value={monitoringSearch}
                          onChange={(e) => setMonitoringSearch(e.target.value)}
                        />
                        {monitoringLoading ? (
                          <p className="blume-muted">Loading…</p>
                        ) : (
                          <div className="blume-monitoring-user-list">
                            {monitoringUsers.length === 0 && (
                              <p className="blume-muted">
                                Nobody's sent a message or posted yet.
                              </p>
                            )}
                            {monitoringUsers
                              .filter((u) =>
                                u.username
                                  .toLowerCase()
                                  .includes(monitoringSearch.trim().toLowerCase())
                              )
                              .map((u) => (
                                <button
                                  key={u.username}
                                  className="blume-monitoring-user-row"
                                  onClick={() => loadMonitoringChats(u.username)}
                                >
                                  <span className="blume-monitoring-username">{u.username}</span>
                                  <span className="blume-monitoring-row-right">
                                    {u.redGroupName && (
                                      <span className="blume-ingame-red-group">
                                        {u.redGroupName}
                                      </span>
                                    )}
                                    <span
                                      className="blume-monitoring-activity"
                                      title="Posts + messages sent"
                                    >
                                      {u.activityCount}
                                    </span>
                                  </span>
                                </button>
                              ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          className="blume-monitoring-back"
                          onClick={() => {
                            setMonitoringSelected(null);
                            setMonitoringData(null);
                            loadMonitoringUsers();
                          }}
                        >
                          ← Back to list
                        </button>
                        <strong className="blume-monitoring-target">{monitoringSelected}</strong>
                        {monitoringDetailLoading ? (
                          <p className="blume-muted">Loading…</p>
                        ) : monitoringData ? (
                          <div className="blume-monitoring-cards">
                            {monitoringData.conversations.length === 0 &&
                              monitoringData.posts.length === 0 && (
                                <p className="blume-muted">
                                  No messages or posts found for this user.
                                </p>
                              )}
                            {monitoringData.conversations.map((c) => {
                              const cardKey = `conv:${c.withUsername}`;
                              const expanded = !!expandedMonitoringCards[cardKey];
                              return (
                                <div className="blume-monitoring-card" key={cardKey}>
                                  <button
                                    className="blume-monitoring-card-head"
                                    onClick={() =>
                                      setExpandedMonitoringCards((prev) => ({
                                        ...prev,
                                        [cardKey]: !prev[cardKey],
                                      }))
                                    }
                                  >
                                    <span>Chat with {c.withUsername}</span>
                                    <span className="blume-muted">
                                      {c.messages.length} message{c.messages.length === 1 ? "" : "s"}{" "}
                                      {expanded ? "▾" : "▸"}
                                    </span>
                                  </button>
                                  {expanded && (
                                    <div className="blume-monitoring-card-body">
                                      {c.messages.map((m) => (
                                        <div
                                          className={`blume-monitoring-msg${
                                            m.deleted ? " blume-monitoring-deleted" : ""
                                          }`}
                                          key={m.id}
                                        >
                                          <span className="blume-monitoring-msg-meta">
                                            {m.from} → {m.to} · {new Date(m.createdAt).toLocaleString()}
                                            {m.deleted && " · deleted"}
                                          </span>
                                          <p>{m.text}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {monitoringData.posts.length > 0 && (
                              <div className="blume-monitoring-card">
                                <button
                                  className="blume-monitoring-card-head"
                                  onClick={() =>
                                    setExpandedMonitoringCards((prev) => ({
                                      ...prev,
                                      posts: !prev.posts,
                                    }))
                                  }
                                >
                                  <span>Posts</span>
                                  <span className="blume-muted">
                                    {monitoringData.posts.length} post
                                    {monitoringData.posts.length === 1 ? "" : "s"}{" "}
                                    {expandedMonitoringCards.posts ? "▾" : "▸"}
                                  </span>
                                </button>
                                {expandedMonitoringCards.posts && (
                                  <div className="blume-monitoring-card-body blume-monitoring-post-grid">
                                    {monitoringData.posts.map((p) => (
                                      <div
                                        className={`blume-monitoring-post-mini${
                                          p.deleted ? " blume-monitoring-deleted" : ""
                                        }`}
                                        key={p.id}
                                      >
                                        {p.imageUrl ? (
                                          <div className="blume-monitoring-post-row">
                                            <div className="blume-monitoring-img-frame">
                                              <img
                                                className="blume-monitoring-img"
                                                src={p.imageUrl}
                                                alt=""
                                                onClick={() => setEnlargedImage(p.imageUrl)}
                                              />
                                            </div>
                                            {p.text && (
                                              <p className="blume-monitoring-post-text">{p.text}</p>
                                            )}
                                          </div>
                                        ) : (
                                          p.text && <p className="blume-monitoring-post-text">{p.text}</p>
                                        )}
                                        <span className="blume-monitoring-msg-meta">
                                          {new Date(p.createdAt).toLocaleString()}
                                          {p.deleted && " · deleted"}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
              </div>
          </div>
        </div>
      )}

      {enlargedImage && (
        <div className="blume-image-lightbox" onClick={() => setEnlargedImage(null)}>
          <img src={enlargedImage} alt="" />
        </div>
      )}

      {confirmingReport && (
        <div className="blume-modal-backdrop">
          <div className="blume-modal">
            <p>
              WestbridgeOS will now download a PDF file. Are you sure you'd like to continue?
            </p>
            <div className="blume-modal-actions">
              <button
                className="blume-modal-cancel"
                onClick={() => setConfirmingReport(false)}
              >
                No
              </button>
              <button
                className="blume-modal-confirm"
                onClick={() => {
                  setConfirmingReport(false);
                  generatePersonReport();
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingGroupReport && (
        <div className="blume-modal-backdrop">
          <div className="blume-modal">
            <p>
              WestbridgeOS will now download a PDF file. Are you sure you'd like to continue?
            </p>
            <div className="blume-modal-actions">
              <button
                className="blume-modal-cancel"
                onClick={() => setConfirmingGroupReport(false)}
              >
                No
              </button>
              <button
                className="blume-modal-confirm"
                onClick={() => {
                  setConfirmingGroupReport(false);
                  generateGroupReport();
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
