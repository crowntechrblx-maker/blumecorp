// Pure CSV-fetch/parse helpers for the HM Government sheet sync. No KV or
// session dependency here so this file can be safely imported by both the
// prod serverless function and, in spirit, copied into the vite dev mirror.

const SHEET_ID = "1jsxddEoTg7uk-bOEf7mlnUmTXlcz4WyRDFtK62GWnAU";
const GIDS = {
  nst: "1132600417",
  aosKos: "1169949125",
  dismissals: "1014641520",
  blacklist: "0",
} as const;

export type GovSheetSource = "nst" | "aosKos" | "dismissals" | "blacklist";

function csvUrl(gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
}

export async function fetchSheetCsv(source: GovSheetSource): Promise<string> {
  const res = await fetch(csvUrl(GIDS[source]));
  if (!res.ok) {
    throw new Error(`Couldn't fetch ${source} sheet (HTTP ${res.status}).`);
  }
  return res.text();
}

// Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas,
// embedded newlines inside quotes, and doubled "" escaped quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Scans the first several rows for one containing all of the required
// header names (case-insensitive, trimmed), then returns a name -> column
// index map plus the index of the first data row.
function findHeader(
  rows: string[][],
  required: string[]
): { colIndex: Record<string, number>; dataStart: number } | null {
  const scanLimit = Math.min(rows.length, 15);
  for (let r = 0; r < scanLimit; r++) {
    const cells = rows[r].map((c) => c.trim().toUpperCase());
    const colIndex: Record<string, number> = {};
    let matched = 0;
    for (const name of required) {
      const idx = cells.indexOf(name.toUpperCase());
      if (idx !== -1) {
        colIndex[name] = idx;
        matched++;
      }
    }
    if (matched === required.length) {
      return { colIndex, dataStart: r + 1 };
    }
  }
  return null;
}

function cell(row: string[], colIndex: Record<string, number>, name: string): string {
  const idx = colIndex[name];
  if (idx === undefined || idx >= row.length) return "";
  return (row[idx] || "").trim();
}

function isBlankRow(row: string[]): boolean {
  return row.every((c) => !c || !c.trim());
}

// Values in an appeal-status column that mean the entry should NOT be
// synced in — the person was successfully cleared.
function isSuccessfulAppeal(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  return v.includes("granted") || v.includes("exonerated");
}

function looksLikeSampleRow(...fields: string[]): boolean {
  return fields.some((f) => f.trim().toLowerCase() === "example");
}

// UK-style D/M/YYYY (or DD/MM/YY) date parsing. Returns undefined if it
// doesn't look like a date.
export function parseUkDate(raw: string): number | undefined {
  const v = raw.trim();
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const ms = Date.UTC(year, month - 1, day);
  return Number.isNaN(ms) ? undefined : ms;
}

function slugKey(...parts: string[]): string {
  return parts
    .map((p) => p.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

export interface NstRow {
  rowKey: string;
  username: string;
  isGroupEntry: boolean;
  profileLink: string;
  designationDateRaw: string;
  designationDateMs?: number;
  notes: string;
}

export function parseNstRows(csv: string): NstRow[] {
  const rows = parseCsv(csv);
  const header = findHeader(rows, ["USERNAME", "PROFILE LINK", "DESIGNATION DATE", "NOTES", "APPEAL STATUS"]);
  if (!header) return [];
  const out: NstRow[] = [];
  for (let r = header.dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (isBlankRow(row)) continue;
    const username = cell(row, header.colIndex, "USERNAME");
    if (!username) continue;
    const appeal = cell(row, header.colIndex, "APPEAL STATUS");
    if (isSuccessfulAppeal(appeal)) continue;
    const profileLink = cell(row, header.colIndex, "PROFILE LINK");
    const designationDateRaw = cell(row, header.colIndex, "DESIGNATION DATE");
    out.push({
      rowKey: slugKey("nst", username),
      username,
      isGroupEntry: /\/communities\//i.test(profileLink) || /^all members/i.test(username),
      profileLink,
      designationDateRaw,
      designationDateMs: parseUkDate(designationDateRaw),
      notes: cell(row, header.colIndex, "NOTES"),
    });
  }
  return out;
}

export interface AosKosRow {
  rowKey: string;
  username: string;
  issuer: string;
  designation: string; // e.g. "Kill on Sight", "Arrest on Sight", "Both"
  reason: string;
  duration: string;
  notes: string;
}

export function parseAosKosRows(csv: string): AosKosRow[] {
  const rows = parseCsv(csv);
  const header = findHeader(rows, [
    "ROBLOX USERNAME",
    "ISSUER",
    "KILL/ARREST ON SIGHT",
    "REASON",
    "DURATION",
    "APPEAL",
    "NOTES",
  ]);
  if (!header) return [];
  const out: AosKosRow[] = [];
  for (let r = header.dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (isBlankRow(row)) continue;
    const username = cell(row, header.colIndex, "ROBLOX USERNAME");
    if (!username) continue;
    const appeal = cell(row, header.colIndex, "APPEAL");
    if (isSuccessfulAppeal(appeal)) continue;
    const reason = cell(row, header.colIndex, "REASON");
    const issuer = cell(row, header.colIndex, "ISSUER");
    out.push({
      rowKey: slugKey("aosKos", username, issuer, reason),
      username,
      issuer,
      designation: cell(row, header.colIndex, "KILL/ARREST ON SIGHT"),
      reason,
      duration: cell(row, header.colIndex, "DURATION"),
      notes: cell(row, header.colIndex, "NOTES"),
    });
  }
  return out;
}

export interface DismissalRow {
  rowKey: string;
  username: string;
  discord: string;
  service: string;
  reason: string;
  dateRaw: string;
  dateMs?: number;
  notes: string;
}

export function parseDismissalRows(csv: string): DismissalRow[] {
  const rows = parseCsv(csv);
  const header = findHeader(rows, ["USERNAME", "DISCORD", "SERVICE", "REASON", "DISMISSAL DATE", "APPEAL", "NOTES"]);
  if (!header) return [];
  const out: DismissalRow[] = [];
  for (let r = header.dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (isBlankRow(row)) continue;
    const username = cell(row, header.colIndex, "USERNAME");
    if (!username) continue;
    const appeal = cell(row, header.colIndex, "APPEAL");
    if (isSuccessfulAppeal(appeal)) continue;
    const reason = cell(row, header.colIndex, "REASON");
    const service = cell(row, header.colIndex, "SERVICE");
    const dateRaw = cell(row, header.colIndex, "DISMISSAL DATE");
    if (!reason && !service) continue; // incomplete placeholder row
    out.push({
      rowKey: slugKey("dismissals", username, service, dateRaw),
      username,
      discord: cell(row, header.colIndex, "DISCORD"),
      service,
      reason,
      dateRaw,
      dateMs: parseUkDate(dateRaw),
      notes: cell(row, header.colIndex, "NOTES"),
    });
  }
  return out;
}

export interface BlacklistRow {
  rowKey: string;
  username: string;
  profileLink: string;
  reason: string;
  authoriserName: string;
  authoriserPosition: string;
  dateRaw: string;
  dateMs?: number;
  notes: string;
}

export function parseBlacklistRows(csv: string): BlacklistRow[] {
  const rows = parseCsv(csv);
  const header = findHeader(rows, [
    "USERNAME",
    "PROFILE",
    "REASON",
    "NAME OF AUTHORISER",
    "POSITION OF AUTHORISER",
    "DATE (DD/MM/YY)",
    "APPEAL STATUS",
    "ADDITIONAL NOTES",
  ]);
  if (!header) return [];
  const out: BlacklistRow[] = [];
  for (let r = header.dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (isBlankRow(row)) continue;
    const username = cell(row, header.colIndex, "USERNAME");
    if (!username) continue;
    const reason = cell(row, header.colIndex, "REASON");
    const notes = cell(row, header.colIndex, "ADDITIONAL NOTES");
    if (looksLikeSampleRow(reason, notes)) continue;
    const appeal = cell(row, header.colIndex, "APPEAL STATUS");
    if (isSuccessfulAppeal(appeal)) continue;
    if (!reason) continue; // e.g. bare usernames with no other data
    const dateRaw = cell(row, header.colIndex, "DATE (DD/MM/YY)");
    out.push({
      rowKey: slugKey("blacklist", username, dateRaw),
      username,
      profileLink: cell(row, header.colIndex, "PROFILE"),
      reason,
      authoriserName: cell(row, header.colIndex, "NAME OF AUTHORISER"),
      authoriserPosition: cell(row, header.colIndex, "POSITION OF AUTHORISER"),
      dateRaw,
      dateMs: parseUkDate(dateRaw),
      notes,
    });
  }
  return out;
}
