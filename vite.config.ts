import { defineConfig, loadEnv, type Plugin, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

interface RobloxSession {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface WallpaperEntry {
  id: string;
  filename: string;
  ownerId: string;
  ownerUsername: string;
  visibility: "public" | "private";
  createdAt: number;
}

interface PostEntry {
  id: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  text: string;
  imageFilename?: string;
  createdAt: number;
  deleted?: boolean;
  deletedAt?: number;
  likedBy?: string[];
}

interface KnownUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
  lastSeen: number;
  loggedOut?: boolean;
}

interface MessageEntry {
  id: string;
  conversationKey: string;
  fromUsername: string;
  toUsername: string;
  text: string;
  createdAt: number;
  deleted?: boolean;
  deletedAt?: number;
  readAt?: number;
  attachments?: { name: string; url: string }[];
}

function conversationKey(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join("::");
}

interface RoyalTweetEntry {
  id: string;
  url: string;
  addedByUsername: string;
  createdAt: number;
}

const ROYAL_FAMILY_GROUP_ID = 35167585;

async function isRobloxGroupMember(userId: string, groupId: number): Promise<boolean> {
  try {
    const res = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { data?: { group?: { id?: number } }[] };
    return (data.data || []).some((entry) => entry.group?.id === groupId);
  } catch {
    return false;
  }
}

function robloxHeaders(): Record<string, string> {
  const cookie = process.env.ROBLOX_SCAN_COOKIE || "";
  return cookie ? { Cookie: `.ROBLOSECURITY=${cookie}` } : {};
}

function extractGroupId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = /(?:communities|groups)\/(\d+)/i.exec(trimmed);
  if (urlMatch) return urlMatch[1];
  return trimmed;
}

async function getUserGroupIds(userId: string): Promise<number[]> {
  try {
    const res = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { group?: { id?: number } }[] };
    return (data.data || [])
      .map((entry) => entry.group?.id)
      .filter((id): id is number => typeof id === "number");
  } catch {
    return [];
  }
}

async function getRobloxFriends(userId: string): Promise<{ userId: string; username: string }[]> {
  try {
    const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { id?: number; name?: string }[] };
    return (data.data || [])
      .filter((f): f is { id: number; name: string } => !!f.id && !!f.name)
      .map((f) => ({ userId: String(f.id), username: f.name }));
  } catch {
    return [];
  }
}

const squareAvatarCache = new Map<string, string | null>();

async function getRobloxSquareAvatarUrl(userId: string): Promise<string | null> {
  if (squareAvatarCache.has(userId)) return squareAvatarCache.get(userId)!;
  try {
    const res = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
      { headers: robloxHeaders() }
    );
    const data = (await res.json()) as { data?: { imageUrl?: string }[] };
    const url = data.data?.[0]?.imageUrl || null;
    squareAvatarCache.set(userId, url);
    return url;
  } catch {
    return null;
  }
}

const friendsCountCache = new Map<string, number | null>();

async function getRobloxFriendsCount(userId: string): Promise<number | null> {
  if (friendsCountCache.has(userId)) return friendsCountCache.get(userId)!;
  try {
    const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) {
      friendsCountCache.set(userId, null);
      return null;
    }
    const data = (await res.json()) as { count?: number };
    const count = typeof data.count === "number" ? data.count : null;
    friendsCountCache.set(userId, count);
    return count;
  } catch {
    friendsCountCache.set(userId, null);
    return null;
  }
}

const followersCountCache = new Map<string, number | null>();

async function getRobloxFollowersCount(userId: string): Promise<number | null> {
  if (followersCountCache.has(userId)) return followersCountCache.get(userId)!;
  try {
    const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) {
      followersCountCache.set(userId, null);
      return null;
    }
    const data = (await res.json()) as { count?: number };
    const count = typeof data.count === "number" ? data.count : null;
    followersCountCache.set(userId, count);
    return count;
  } catch {
    followersCountCache.set(userId, null);
    return null;
  }
}

const accountCreatedCache = new Map<string, string | null>();

async function getRobloxAccountCreatedAt(userId: string): Promise<string | null> {
  if (accountCreatedCache.has(userId)) return accountCreatedCache.get(userId)!;
  try {
    const res = await fetch(`https://users.roblox.com/v1/users/${userId}`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) {
      accountCreatedCache.set(userId, null);
      return null;
    }
    const data = (await res.json()) as { created?: string };
    const created = data.created || null;
    accountCreatedCache.set(userId, created);
    return created;
  } catch {
    accountCreatedCache.set(userId, null);
    return null;
  }
}

async function resolveRobloxUserId(
  query: string
): Promise<{ userId: string; username: string } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    try {
      const res = await fetch(`https://users.roblox.com/v1/users/${trimmed}`, {
        headers: robloxHeaders(),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { id?: number; name?: string };
      if (!data.id) return null;
      return { userId: String(data.id), username: data.name || trimmed };
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...robloxHeaders() },
      body: JSON.stringify({ usernames: [trimmed], excludeBannedUsers: false }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { id?: number; name?: string }[] };
    const match = data.data?.[0];
    if (!match?.id) return null;
    return { userId: String(match.id), username: match.name || trimmed };
  } catch {
    return null;
  }
}

type GroupCategory = "Emergency Services" | "Intelligence" | "IE" | "OCG" | "Other";
const GROUP_CATEGORIES: GroupCategory[] = ["Emergency Services", "Intelligence", "IE", "OCG", "Other"];

function tierForCategory(category: string): "red" | "white" {
  return category === "IE" || category === "OCG" ? "red" : "white";
}

const GROUP_SEED: { id: number; name: string; category: GroupCategory }[] = [
  { id: 10742221, name: "G-Block", category: "OCG" },
  { id: 223035360, name: "Shadow District", category: "OCG" },
  { id: 679403020, name: "Harakat", category: "OCG" },
  { id: 16684944, name: "National Liberation Movement", category: "OCG" },
  { id: 34067916, name: "CHS", category: "OCG" },
  { id: 541807, name: "UK | United Kingdom", category: "OCG" },
  { id: 14641286, name: "TUI Airways | Roblox", category: "OCG" },
  { id: 696897291, name: "Motorway Roleplay", category: "OCG" },
  { id: 11939831, name: "Nottinghamshire, England", category: "OCG" },
  { id: 16339807, name: "Liber Studios", category: "OCG" },
  { id: 34544324, name: "UK | Sandford Studios", category: "OCG" },
  { id: 12982639, name: "NEMG | North East Medical Group", category: "OCG" },
  { id: 8103, name: "UK Explorium Studios", category: "OCG" },
  { id: 1176461, name: "Union Studios", category: "OCG" },
  { id: 2792847, name: "Crown Studios", category: "OCG" },
  { id: 1059884, name: "Imperium Studios", category: "OCG" },
  { id: 979414846, name: "[IP] Interactive Productions", category: "OCG" },
  { id: 32324698, name: "PHOENIX Studios Group", category: "OCG" },
  { id: 33392881, name: "Aris Production", category: "OCG" },
  { id: 34564109, name: "Liber Studios ND", category: "OCG" },
  { id: 35662128, name: "United Establishment", category: "OCG" },
  { id: 5081986, name: "Yaris United Kingdom", category: "OCG" },
  { id: 35273143, name: "Explorium Studios", category: "OCG" },

  { id: 32650605, name: "London Air Ambulance", category: "Emergency Services" },
  { id: 879056831, name: "London Ambulance Service", category: "Emergency Services" },
  { id: 493990898, name: "Metropolitan Police Service", category: "Emergency Services" },
  { id: 360230741, name: "London Fire Brigade", category: "Emergency Services" },
  { id: 820909258, name: "British Transport Police", category: "Emergency Services" },
  { id: 743983922, name: "Greater Manchester Police", category: "Emergency Services" },
  { id: 987422423, name: "Police Service of Northern Ireland", category: "Emergency Services" },
  { id: 278125181, name: "National Police Air Service", category: "Emergency Services" },
  { id: 740750486, name: "Kent Police", category: "Emergency Services" },

  { id: 931656944, name: "British Forces", category: "Intelligence" },
  { id: 567563234, name: "HM Revenue and Customs", category: "Intelligence" },
  { id: 154853936, name: "MI5", category: "Intelligence" },
  { id: 142915989, name: "National Crime Agency", category: "Intelligence" },
  { id: 685466511, name: "SIS (MI6)", category: "Intelligence" },
  { id: 34974741, name: "Immigration Enforcement", category: "Intelligence" },
  { id: 11086948, name: "Hatzola", category: "Intelligence" },
  { id: 35167585, name: "Royal Households", category: "Intelligence" },
  { id: 841518502, name: "Home Office", category: "Intelligence" },
  { id: 187507831, name: "Central Intelligence Agency", category: "Intelligence" },
  { id: 963189576, name: "JTF2", category: "Intelligence" },
  { id: 315987361, name: "Regional Organised Crime Unit", category: "Intelligence" },
  { id: 496716538, name: "U.S Marshals Service", category: "Intelligence" },
  { id: 841282433, name: "London Freemasons", category: "Intelligence" },
  { id: 1033941381, name: "Consulate of the People's Republic of China", category: "Intelligence" },
];

interface BlumeReportEntry {
  id: string;
  title: string;
  body: string;
  authorUsername: string;
  createdAt: number;
  linkedUserId?: string;
  linkedUsername?: string;
  expiresAt?: number;
}

// Kept as a static fallback set only for ALL_KNOWN_GROUPS/getMemberGroupNames labeling below.
// Live Blume access is now driven by the "Intelligence" category in the group catalog (see isBlumeAuthorized).
const BLUME_GROUP_IDS = [154853936, 142915989, 685466511, 187507831, 315987361, 496716538];
const BLUME_ALLOWED_USER_IDS = ["181869610", "4963562759", "2322187718", "11140342881"];

async function isBlumeAuthorized(userId: string): Promise<boolean> {
  if (BLUME_ALLOWED_USER_IDS.includes(userId)) return true;
  const intelGroupIds = getGroupIdsByCategory("Intelligence");
  if (intelGroupIds.length === 0) return false;
  const memberGroupIds = await getUserGroupIds(userId);
  const memberSet = new Set(memberGroupIds);
  return intelGroupIds.some((id) => memberSet.has(id));
}

function isBlumeSuperUser(userId: string): boolean {
  return BLUME_ALLOWED_USER_IDS.includes(userId);
}

const ROOT_ADMIN_USERNAMES = ["bananapoopooo", "pl_aced"];

function isRootAdmin(username: string): boolean {
  return ROOT_ADMIN_USERNAMES.some((u) => u.toLowerCase() === username.toLowerCase());
}

interface SpecialAdminEntry {
  userId: string;
  username: string;
  addedByUsername: string;
  createdAt: number;
}

const SPECIAL_ADMINS_DB = path.resolve(process.cwd(), "special-admins-data.json");

function loadSpecialAdminsDb(): SpecialAdminEntry[] {
  try {
    return JSON.parse(fs.readFileSync(SPECIAL_ADMINS_DB, "utf-8"));
  } catch {
    return [];
  }
}

function saveSpecialAdminsDb(entries: SpecialAdminEntry[]) {
  fs.writeFileSync(SPECIAL_ADMINS_DB, JSON.stringify(entries, null, 2));
}

function isSpecialAdmin(userId: string): boolean {
  return loadSpecialAdminsDb().some((a) => a.userId === userId);
}

function addSpecialAdmin(entry: SpecialAdminEntry) {
  const admins = loadSpecialAdminsDb();
  if (admins.some((a) => a.userId === entry.userId)) return;
  admins.push(entry);
  saveSpecialAdminsDb(admins);
}

function removeSpecialAdmin(userId: string) {
  saveSpecialAdminsDb(loadSpecialAdminsDb().filter((a) => a.userId !== userId));
}

function isPlatformAdmin(userId: string, username: string): boolean {
  if (isRootAdmin(username)) return true;
  return isSpecialAdmin(userId);
}

const ALL_KNOWN_GROUPS: { id: number; label: string }[] = [
  { id: ROYAL_FAMILY_GROUP_ID, label: "PS Royal Households of the United Kingdom" },
  ...BLUME_GROUP_IDS.map((id) => ({ id, label: `Blume-authorized group ${id}` })),
];

const groupNameCache = new Map<number, string | null>();

async function getRobloxGroupName(groupId: number): Promise<string | null> {
  if (groupNameCache.has(groupId)) return groupNameCache.get(groupId)!;
  try {
    const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`);
    if (!res.ok) {
      groupNameCache.set(groupId, null);
      return null;
    }
    const data = (await res.json()) as { name?: string };
    const name = data.name || null;
    groupNameCache.set(groupId, name);
    return name;
  } catch {
    groupNameCache.set(groupId, null);
    return null;
  }
}

const groupMemberCountCache = new Map<number, number | null>();

async function getRobloxGroupMemberCount(groupId: number): Promise<number | null> {
  if (groupMemberCountCache.has(groupId)) return groupMemberCountCache.get(groupId)!;
  try {
    const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`);
    if (!res.ok) {
      groupMemberCountCache.set(groupId, null);
      return null;
    }
    const data = (await res.json()) as { memberCount?: number };
    const count = typeof data.memberCount === "number" ? data.memberCount : null;
    groupMemberCountCache.set(groupId, count);
    return count;
  } catch {
    groupMemberCountCache.set(groupId, null);
    return null;
  }
}

async function getMemberGroupNames(userId: string): Promise<string[]> {
  const memberships = await Promise.all(
    ALL_KNOWN_GROUPS.map(async (g) => ({
      group: g,
      isMember: await isRobloxGroupMember(userId, g.id),
    }))
  );
  const names: string[] = [];
  for (const m of memberships) {
    if (!m.isMember) continue;
    const realName = await getRobloxGroupName(m.group.id);
    names.push(realName || m.group.label);
  }
  return names;
}

const BLOCKED_TERMS = [
  "nigger",
  "nigga",
  "chink",
  "spic",
  "kike",
  "wetback",
  "gook",
  "coon",
  "beaner",
  "paki",
  "raghead",
  "towelhead",
  "tranny",
  "faggot",
  "fag",
  "dyke",
  "retard",
  "retarded",
  "cripple",
  "cunt",
  "whore",
  "slut",
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "piss",
  "cock",
  "pussy",
  "twat",
  "wanker",
  "motherfucker",
];

function normalizeForModeration(input: string): string {
  return input
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/[^a-z]/g, "");
}

function containsBlockedLanguage(text: string): boolean {
  if (!text) return false;
  const normalized = normalizeForModeration(text);
  if (!normalized) return false;
  return BLOCKED_TERMS.some((term) => normalized.includes(term));
}

const MODERATION_REJECTION_MESSAGE =
  "That contains language that isn't allowed here — please rephrase.";

interface BlumeBlogPost {
  id: string;
  title: string;
  excerpt: string;
  readMinutes: number;
  authorUsername: string;
  createdAt: number;
}

const avatarCache = new Map<string, string | null>();

async function getRobloxAvatarUrl(userId: string): Promise<string | null> {
  if (avatarCache.has(userId)) return avatarCache.get(userId)!;
  try {
    const res = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`
    );
    const data = (await res.json()) as { data?: { imageUrl?: string }[] };
    const url = data.data?.[0]?.imageUrl || null;
    avatarCache.set(userId, url);
    return url;
  } catch {
    return null;
  }
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseCookies(req: Connect.IncomingMessage): Record<string, string> {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const idx = p.indexOf("=");
        return [p.slice(0, idx), decodeURIComponent(p.slice(idx + 1))];
      })
  );
}

function readJsonBody(req: Connect.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const USERS_DB = path.resolve(process.cwd(), "users-data.json");

function loadUsersDb(): KnownUser[] {
  try {
    return JSON.parse(fs.readFileSync(USERS_DB, "utf-8"));
  } catch {
    return [];
  }
}

function saveUsersDb(entries: KnownUser[]) {
  fs.writeFileSync(USERS_DB, JSON.stringify(entries, null, 2));
}

function upsertKnownUser(user: { userId: string; username: string; avatarUrl: string | null }) {
  const users = loadUsersDb();
  const index = users.findIndex((u) => u.userId === user.userId);
  const entry: KnownUser = { ...user, lastSeen: Date.now(), loggedOut: false };
  if (index === -1) {
    users.push(entry);
  } else {
    users[index] = entry;
  }
  saveUsersDb(users);
}

function findKnownUser(query: string): KnownUser | null {
  const raw = query.trim();
  if (!raw) return null;
  const users = loadUsersDb();
  return (
    users.find((u) => u.userId === raw) ||
    users.find((u) => u.username.toLowerCase() === raw.toLowerCase()) ||
    null
  );
}

function markKnownUserLoggedOut(userId: string) {
  const users = loadUsersDb();
  const index = users.findIndex((u) => u.userId === userId);
  if (index === -1) return;
  users[index] = { ...users[index], loggedOut: true };
  saveUsersDb(users);
}

function getLoggedInUsernames(): string[] {
  return loadUsersDb()
    .filter((u) => !u.loggedOut)
    .map((u) => u.username)
    .sort((a, b) => a.localeCompare(b));
}

interface BanEntry {
  userId: string;
  username: string;
  bannedByUsername: string;
  createdAt: number;
}

const BANS_DB = path.resolve(process.cwd(), "bans-data.json");

function loadBansDb(): BanEntry[] {
  try {
    return JSON.parse(fs.readFileSync(BANS_DB, "utf-8"));
  } catch {
    return [];
  }
}

function saveBansDb(entries: BanEntry[]) {
  fs.writeFileSync(BANS_DB, JSON.stringify(entries, null, 2));
}

function isBanned(userId: string): boolean {
  return loadBansDb().some((b) => b.userId === userId);
}

function addBan(entry: BanEntry) {
  const bans = loadBansDb();
  if (bans.some((b) => b.userId === entry.userId)) return;
  bans.push(entry);
  saveBansDb(bans);
}

function removeBan(userId: string) {
  saveBansDb(loadBansDb().filter((b) => b.userId !== userId));
}

interface AuditEntry {
  id: string;
  type: string;
  username: string;
  detail: string;
  createdAt: number;
}

const AUDIT_DB = path.resolve(process.cwd(), "audit-log-data.json");
const MAX_AUDIT_ENTRIES = 1000;

function loadAuditDb(): AuditEntry[] {
  try {
    return JSON.parse(fs.readFileSync(AUDIT_DB, "utf-8"));
  } catch {
    return [];
  }
}

function saveAuditDb(entries: AuditEntry[]) {
  fs.writeFileSync(AUDIT_DB, JSON.stringify(entries, null, 2));
}

function appendAuditLog(entry: { type: string; username: string; detail: string }) {
  const entries = loadAuditDb();
  entries.push({ id: crypto.randomBytes(8).toString("hex"), createdAt: Date.now(), ...entry });
  if (entries.length > MAX_AUDIT_ENTRIES) {
    entries.splice(0, entries.length - MAX_AUDIT_ENTRIES);
  }
  saveAuditDb(entries);
}

function getAuditLog(limit = 300): AuditEntry[] {
  return loadAuditDb().slice(-limit).reverse();
}

const GATE_COOKIE_NAME = "wb_gate";

function gateToken(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function robloxOAuthPlugin(env: Record<string, string>, sessions: Map<string, RobloxSession>): Plugin {
  const CLIENT_ID = env.ROBLOX_CLIENT_ID;
  const CLIENT_SECRET = env.ROBLOX_CLIENT_SECRET;
  const REDIRECT_URI = env.ROBLOX_REDIRECT_URI || "http://localhost:5173/api/auth/callback";
  const GATE_PASSWORD = env.WB_GATE_PASSWORD || "longliveblumecorp";

  function isGateUnlocked(token: string | undefined): boolean {
    return !!token && token === gateToken(GATE_PASSWORD);
  }

  const pendingLogins = new Map<string, { verifier: string }>();

  return {
    name: "roblox-oauth",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");

        if (url.pathname === "/api/auth/login") {
          const cookies = parseCookies(req);
          if (!isGateUnlocked(cookies[GATE_COOKIE_NAME])) {
            res.statusCode = 403;
            res.end("Locked.");
            return;
          }
          if (!CLIENT_ID) {
            res.statusCode = 500;
            res.end("Missing ROBLOX_CLIENT_ID. Add it to .env.local and restart the dev server.");
            return;
          }
          const verifier = b64url(crypto.randomBytes(32));
          const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
          const state = b64url(crypto.randomBytes(16));
          pendingLogins.set(state, { verifier });

          const authUrl = new URL("https://apis.roblox.com/oauth/v1/authorize");
          authUrl.searchParams.set("client_id", CLIENT_ID);
          authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
          authUrl.searchParams.set("scope", "openid profile");
          authUrl.searchParams.set("response_type", "code");
          authUrl.searchParams.set("state", state);
          authUrl.searchParams.set("code_challenge", challenge);
          authUrl.searchParams.set("code_challenge_method", "S256");

          res.statusCode = 302;
          res.setHeader("Location", authUrl.toString());
          res.end();
          return;
        }

        if (url.pathname === "/api/auth/callback") {
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          const entry = state ? pendingLogins.get(state) : undefined;
          if (state) pendingLogins.delete(state);

          if (!code || !entry) {
            res.statusCode = 400;
            res.end("Invalid or expired OAuth callback. Go back and try signing in again.");
            return;
          }

          try {
            const tokenRes = await fetch("https://apis.roblox.com/oauth/v1/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: CLIENT_ID || "",
                client_secret: CLIENT_SECRET || "",
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI,
                code_verifier: entry.verifier,
              }),
            });
            const tokenData = (await tokenRes.json()) as { access_token?: string };
            if (!tokenRes.ok) throw new Error(JSON.stringify(tokenData));

            const userRes = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
              headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });
            const profile = (await userRes.json()) as {
              sub: string;
              preferred_username: string;
              nickname?: string;
            };

            const avatarUrl = await getRobloxAvatarUrl(profile.sub);
            const sessionId = b64url(crypto.randomBytes(24));

            if (isBanned(profile.sub)) {
              sessions.set(sessionId, {
                userId: profile.sub,
                username: profile.preferred_username,
                displayName: profile.nickname || profile.preferred_username,
                avatarUrl,
              });
              res.setHeader(
                "Set-Cookie",
                `wb_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`
              );
              res.statusCode = 302;
              res.setHeader("Location", "/");
              res.end();
              return;
            }

            sessions.set(sessionId, {
              userId: profile.sub,
              username: profile.preferred_username,
              displayName: profile.nickname || profile.preferred_username,
              avatarUrl,
            });

            upsertKnownUser({
              userId: profile.sub,
              username: profile.preferred_username,
              avatarUrl,
            });
            appendAuditLog({
              type: "login",
              username: profile.preferred_username,
              detail: "Signed in via Roblox OAuth",
            });

            res.setHeader(
              "Set-Cookie",
              `wb_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`
            );
            res.statusCode = 302;
            res.setHeader("Location", "/");
            res.end();
          } catch (err) {
            res.statusCode = 500;
            res.end("OAuth exchange failed: " + (err as Error).message);
          }
          return;
        }

        if (url.pathname === "/api/auth/me") {
          const cookies = parseCookies(req);

          if (req.method === "POST") {
            const body = await readJsonBody(req);
            const password = (body.password || "").toString();
            if (password !== GATE_PASSWORD) {
              res.statusCode = 401;
              res.end("Incorrect password.");
              return;
            }
            res.setHeader(
              "Set-Cookie",
              `${GATE_COOKIE_NAME}=${gateToken(GATE_PASSWORD)}; Path=/; HttpOnly; Max-Age=${60 * 60 * 24 * 30}`
            );
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
            return;
          }

          res.setHeader("Content-Type", "application/json");
          if (!isGateUnlocked(cookies[GATE_COOKIE_NAME])) {
            res.end(JSON.stringify({ gateRequired: true }));
            return;
          }
          const session = sessions.get(cookies.wb_session);
          if (!session) {
            res.end(JSON.stringify(null));
            return;
          }
          if (isBanned(session.userId)) {
            sessions.delete(cookies.wb_session);
            res.end(JSON.stringify({ banned: true }));
            return;
          }
          const myMessages = loadMessagesDb().filter(
            (m) => m.toUsername.toLowerCase() === session.username.toLowerCase()
          );
          const latest = myMessages.sort((a, b) => b.createdAt - a.createdAt)[0] || null;
          res.end(
            JSON.stringify({
              ...session,
              isAdmin: isPlatformAdmin(session.userId, session.username),
              latestIncomingMessage: latest
                ? {
                    id: latest.id,
                    fromUsername: latest.fromUsername,
                    createdAt: latest.createdAt,
                  }
                : null,
            })
          );
          return;
        }

        if (url.pathname === "/api/auth/logout") {
          const cookies = parseCookies(req);
          const loggingOut = sessions.get(cookies.wb_session);
          if (loggingOut) markKnownUserLoggedOut(loggingOut.userId);
          sessions.delete(cookies.wb_session);
          res.setHeader("Set-Cookie", "wb_session=; Path=/; HttpOnly; Max-Age=0");
          res.statusCode = 302;
          res.setHeader("Location", "/");
          res.end();
          return;
        }

        next();
      });
    },
  };
}

const WALLPAPER_DIR = path.resolve(process.cwd(), "public", "wallpapers", "uploads");
const WALLPAPER_DB = path.resolve(process.cwd(), "wallpapers-data.json");
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function loadWallpaperDb(): WallpaperEntry[] {
  try {
    return JSON.parse(fs.readFileSync(WALLPAPER_DB, "utf-8"));
  } catch {
    return [];
  }
}

function saveWallpaperDb(entries: WallpaperEntry[]) {
  fs.writeFileSync(WALLPAPER_DB, JSON.stringify(entries, null, 2));
}

function wallpapersPlugin(sessions: Map<string, RobloxSession>): Plugin {
  fs.mkdirSync(WALLPAPER_DIR, { recursive: true });

  return {
    name: "wallpapers-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);

        if (url.pathname === "/api/wallpapers" && req.method === "GET") {
          const all = loadWallpaperDb();
          const visible = all.filter(
            (w) => w.visibility === "public" || (session && w.ownerId === session.userId)
          );
          const payload = [
            {
              id: "default",
              url: "/wallpapers/default.webp",
              visibility: "public" as const,
              ownerUsername: "Westbridge OS",
              isDefault: true,
            },
            ...visible.map((w) => ({
              id: w.id,
              url: `/wallpapers/uploads/${w.filename}`,
              visibility: w.visibility,
              ownerUsername: w.ownerUsername,
              isDefault: false,
              isMine: session ? w.ownerId === session.userId : false,
              canDelete: session
                ? w.ownerId === session.userId || isPlatformAdmin(session.userId, session.username)
                : false,
            })),
          ];
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
          return;
        }

        if (url.pathname === "/api/wallpapers" && req.method === "POST") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in to upload a background.");
            return;
          }
          try {
            const body = await readJsonBody(req);
            const dataUrl: string = body.dataUrl || "";
            const visibility: "public" | "private" = body.visibility === "private" ? "private" : "public";
            const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
            if (!match) {
              res.statusCode = 400;
              res.end("Invalid image data.");
              return;
            }
            const mime = match[1];
            const ext = MIME_EXT[mime];
            if (!ext) {
              res.statusCode = 400;
              res.end("Unsupported image type. Use PNG, JPEG, WEBP, or GIF.");
              return;
            }
            const buffer = Buffer.from(match[2], "base64");
            if (buffer.length > 8 * 1024 * 1024) {
              res.statusCode = 400;
              res.end("Image too large (max 8MB).");
              return;
            }
            const id = crypto.randomBytes(12).toString("hex");
            const filename = `${id}.${ext}`;
            fs.writeFileSync(path.join(WALLPAPER_DIR, filename), buffer);

            const entries = loadWallpaperDb();
            const entry: WallpaperEntry = {
              id,
              filename,
              ownerId: session.userId,
              ownerUsername: session.username,
              visibility,
              createdAt: Date.now(),
            };
            entries.push(entry);
            saveWallpaperDb(entries);

            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                id: entry.id,
                url: `/wallpapers/uploads/${entry.filename}`,
                visibility: entry.visibility,
                ownerUsername: entry.ownerUsername,
                isDefault: false,
                isMine: true,
                canDelete: true,
              })
            );
          } catch (err) {
            res.statusCode = 500;
            res.end("Upload failed: " + (err as Error).message);
          }
          return;
        }

        if (url.pathname === "/api/wallpapers" && req.method === "DELETE") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          const id = url.searchParams.get("id") || "";
          const entries = loadWallpaperDb();
          const index = entries.findIndex((w) => w.id === id);
          if (index === -1) {
            res.statusCode = 404;
            res.end("Background not found.");
            return;
          }
          const wallpaper = entries[index];
          const isOwner = wallpaper.ownerId === session.userId;
          const isAdminOverride = isPlatformAdmin(session.userId, session.username);
          if (!isOwner && !isAdminOverride) {
            res.statusCode = 403;
            res.end("You can only delete backgrounds you uploaded.");
            return;
          }
          const filePath = path.join(WALLPAPER_DIR, wallpaper.filename);
          fs.rm(filePath, { force: true }, () => {});
          entries.splice(index, 1);
          saveWallpaperDb(entries);
          appendAuditLog({
            type: "background_deleted",
            username: session.username,
            detail:
              isAdminOverride && !isOwner
                ? `Admin-deleted a background uploaded by ${wallpaper.ownerUsername}`
                : "Deleted their own background",
          });
          res.statusCode = 204;
          res.end();
          return;
        }

        next();
      });
    },
  };
}

const POSTS_DIR = path.resolve(process.cwd(), "public", "posts", "uploads");
const POSTS_DB = path.resolve(process.cwd(), "posts-data.json");

function loadPostsDb(): PostEntry[] {
  try {
    return JSON.parse(fs.readFileSync(POSTS_DB, "utf-8"));
  } catch {
    return [];
  }
}

function savePostsDb(entries: PostEntry[]) {
  fs.writeFileSync(POSTS_DB, JSON.stringify(entries, null, 2));
}

function postsPlugin(sessions: Map<string, RobloxSession>): Plugin {
  fs.mkdirSync(POSTS_DIR, { recursive: true });

  return {
    name: "posts-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);

        if (url.pathname === "/api/posts" && req.method === "GET") {
          const search = (url.searchParams.get("username") || "").trim().toLowerCase();
          let posts = loadPostsDb()
            .filter((p) => !p.deleted)
            .sort((a, b) => b.createdAt - a.createdAt);
          if (search) {
            posts = posts.filter((p) => p.authorUsername.toLowerCase().includes(search));
          }
          const isAdminOverride = !!(session && isPlatformAdmin(session.userId, session.username));
          const payload = posts.map((p) => {
            const likedBy = p.likedBy || [];
            return {
              id: p.id,
              authorUsername: p.authorUsername,
              authorAvatarUrl: p.authorAvatarUrl ?? null,
              text: p.text,
              imageUrl: p.imageFilename ? `/posts/uploads/${p.imageFilename}` : null,
              createdAt: p.createdAt,
              isMine: session ? p.authorId === session.userId : false,
              canDelete: session ? p.authorId === session.userId || isAdminOverride : false,
              likes: likedBy.length,
              liked: session ? likedBy.includes(session.userId) : false,
            };
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
          return;
        }

        if (url.pathname === "/api/posts" && req.method === "PATCH") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in to like a post.");
            return;
          }
          const id = url.searchParams.get("id") || "";
          const entries = loadPostsDb();
          const index = entries.findIndex((p) => p.id === id);
          if (index === -1) {
            res.statusCode = 404;
            res.end("Post not found.");
            return;
          }
          const post = entries[index];
          const uid = session.userId;
          const likedBy = post.likedBy || [];
          const nextLikedBy = likedBy.includes(uid)
            ? likedBy.filter((x) => x !== uid)
            : [...likedBy, uid];
          entries[index] = { ...post, likedBy: nextLikedBy };
          savePostsDb(entries);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ likes: nextLikedBy.length, liked: nextLikedBy.includes(uid) }));
          return;
        }

        if (url.pathname === "/api/posts" && req.method === "POST") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in to post.");
            return;
          }
          try {
            const body = await readJsonBody(req);
            const text: string = (body.text || "").toString().trim();
            const imageDataUrl: string | undefined = body.imageDataUrl || undefined;

            if (!text && !imageDataUrl) {
              res.statusCode = 400;
              res.end("A post needs text or an image.");
              return;
            }
            if (text.length > 2000) {
              res.statusCode = 400;
              res.end("Post text is too long (max 2000 characters).");
              return;
            }
            if (containsBlockedLanguage(text)) {
              res.statusCode = 400;
              res.end(MODERATION_REJECTION_MESSAGE);
              return;
            }

            let imageFilename: string | undefined;
            if (imageDataUrl) {
              const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(imageDataUrl);
              if (!match) {
                res.statusCode = 400;
                res.end("Invalid image data.");
                return;
              }
              const ext = MIME_EXT[match[1]];
              if (!ext) {
                res.statusCode = 400;
                res.end("Unsupported image type. Use PNG, JPEG, WEBP, or GIF.");
                return;
              }
              const buffer = Buffer.from(match[2], "base64");
              if (buffer.length > 8 * 1024 * 1024) {
                res.statusCode = 400;
                res.end("Image too large (max 8MB).");
                return;
              }
              const id = crypto.randomBytes(12).toString("hex");
              imageFilename = `${id}.${ext}`;
              fs.writeFileSync(path.join(POSTS_DIR, imageFilename), buffer);
            }

            const entries = loadPostsDb();
            const entry: PostEntry = {
              id: crypto.randomBytes(12).toString("hex"),
              authorId: session.userId,
              authorUsername: session.username,
              authorAvatarUrl: session.avatarUrl,
              text,
              imageFilename,
              createdAt: Date.now(),
            };
            entries.push(entry);
            savePostsDb(entries);
            appendAuditLog({
              type: "instagram_post",
              username: session.username,
              detail: text ? `Posted: "${text.slice(0, 140)}"` : "Posted an image",
            });

            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                id: entry.id,
                authorUsername: entry.authorUsername,
                authorAvatarUrl: entry.authorAvatarUrl,
                text: entry.text,
                imageUrl: entry.imageFilename ? `/posts/uploads/${entry.imageFilename}` : null,
                createdAt: entry.createdAt,
                isMine: true,
                canDelete: true,
              })
            );
          } catch (err) {
            res.statusCode = 500;
            res.end("Post failed: " + (err as Error).message);
          }
          return;
        }

        if (url.pathname === "/api/posts" && req.method === "DELETE") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in to delete a post.");
            return;
          }
          const postId = url.searchParams.get("id") || "";
          const entries = loadPostsDb();
          const index = entries.findIndex((p) => p.id === postId);
          if (index === -1) {
            res.statusCode = 404;
            res.end("Post not found.");
            return;
          }
          const post = entries[index];
          const isAdminOverride = isPlatformAdmin(session.userId, session.username);
          if (post.authorId !== session.userId && !isAdminOverride) {
            res.statusCode = 403;
            res.end("You can only delete your own posts.");
            return;
          }
          entries[index] = { ...post, deleted: true, deletedAt: Date.now() };
          savePostsDb(entries);
          appendAuditLog({
            type: "instagram_post_deleted",
            username: session.username,
            detail:
              isAdminOverride && post.authorId !== session.userId
                ? `Admin-deleted a post by ${post.authorUsername}`
                : "Deleted their own post",
          });
          res.statusCode = 204;
          res.end();
          return;
        }

        next();
      });
    },
  };
}

const MESSAGES_DB = path.resolve(process.cwd(), "messages-data.json");

function loadMessagesDb(): MessageEntry[] {
  try {
    return JSON.parse(fs.readFileSync(MESSAGES_DB, "utf-8"));
  } catch {
    return [];
  }
}

function saveMessagesDb(entries: MessageEntry[]) {
  fs.writeFileSync(MESSAGES_DB, JSON.stringify(entries, null, 2));
}

const MONITORING_VIEWS_DB = path.resolve(process.cwd(), "monitoring-views-data.json");

function loadMonitoringViewsDb(): Record<string, number> {
  try {
    return JSON.parse(fs.readFileSync(MONITORING_VIEWS_DB, "utf-8"));
  } catch {
    return {};
  }
}

function saveMonitoringViewsDb(views: Record<string, number>) {
  fs.writeFileSync(MONITORING_VIEWS_DB, JSON.stringify(views, null, 2));
}

function messagesPlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "messages-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);

        if (url.pathname === "/api/users" && req.method === "GET") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          const search = (url.searchParams.get("search") || "").trim().toLowerCase();
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const me = session.username.toLowerCase();
          const lastMessageAt = new Map<string, number>();
          for (const m of loadMessagesDb()) {
            const from = m.fromUsername.toLowerCase();
            const to = m.toUsername.toLowerCase();
            if (from !== me && to !== me) continue;
            const other = from === me ? to : from;
            const existing = lastMessageAt.get(other) || 0;
            if (m.createdAt > existing) lastMessageAt.set(other, m.createdAt);
          }
          const users = loadUsersDb()
            .filter((u) => u.username.toLowerCase() !== me)
            .filter((u) => u.lastSeen >= sevenDaysAgo)
            .sort((a, b) => {
              const aRecent = lastMessageAt.get(a.username.toLowerCase()) || 0;
              const bRecent = lastMessageAt.get(b.username.toLowerCase()) || 0;
              if (aRecent !== bRecent) return bRecent - aRecent;
              return b.lastSeen - a.lastSeen;
            });
          const filtered = search
            ? users.filter((u) => u.username.toLowerCase().includes(search))
            : users;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify(
              filtered
                .slice(0, 100)
                .map((u) => ({ username: u.username, avatarUrl: u.avatarUrl, lastSeen: u.lastSeen }))
            )
          );
          return;
        }

        if (url.pathname === "/api/messages" && req.method === "GET") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }

          if (url.searchParams.get("unread") === "1") {
            const me = session.username.toLowerCase();
            const all = loadMessagesDb();
            const counts: Record<string, number> = {};
            for (const m of all) {
              if (m.deleted || m.readAt) continue;
              if (m.toUsername.toLowerCase() !== me) continue;
              const from = m.fromUsername.toLowerCase();
              counts[from] = (counts[from] || 0) + 1;
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(counts));
            return;
          }

          const withUser = (url.searchParams.get("with") || "").trim();
          if (!withUser) {
            res.statusCode = 400;
            res.end("Missing 'with' query parameter.");
            return;
          }
          const key = conversationKey(session.username, withUser);
          const all = loadMessagesDb();

          const me = session.username.toLowerCase();
          const otherLower = withUser.toLowerCase();
          let mutated = false;
          const now = Date.now();
          for (const m of all) {
            if (
              m.conversationKey === key &&
              !m.deleted &&
              !m.readAt &&
              m.toUsername.toLowerCase() === me &&
              m.fromUsername.toLowerCase() === otherLower
            ) {
              m.readAt = now;
              mutated = true;
            }
          }
          if (mutated) saveMessagesDb(all);

          const messages = all
            .filter((m) => m.conversationKey === key && !m.deleted)
            .sort((a, b) => a.createdAt - b.createdAt);
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify(
              messages.map((m) => ({
                id: m.id,
                from: m.fromUsername,
                text: m.text,
                createdAt: m.createdAt,
                isMine: m.fromUsername.toLowerCase() === session.username.toLowerCase(),
                ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
              }))
            )
          );
          return;
        }

        if (url.pathname === "/api/messages" && req.method === "POST") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in to send a message.");
            return;
          }
          try {
            const body = await readJsonBody(req);
            const to = (body.to || "").toString().trim();
            const text = (body.text || "").toString().trim();
            if (!to || !text) {
              res.statusCode = 400;
              res.end("Both 'to' and 'text' are required.");
              return;
            }
            if (text.length > 2000) {
              res.statusCode = 400;
              res.end("Message is too long (max 2000 characters).");
              return;
            }
            if (containsBlockedLanguage(text)) {
              res.statusCode = 400;
              res.end(MODERATION_REJECTION_MESSAGE);
              return;
            }
            const knownUsers = loadUsersDb();
            const recipient = knownUsers.find(
              (u) => u.username.toLowerCase() === to.toLowerCase()
            );
            if (!recipient) {
              res.statusCode = 404;
              res.end("That user hasn't signed in to Westbridge OS.");
              return;
            }

            const entry: MessageEntry = {
              id: crypto.randomBytes(12).toString("hex"),
              conversationKey: conversationKey(session.username, to),
              fromUsername: session.username,
              toUsername: recipient.username,
              text,
              createdAt: Date.now(),
            };
            const entries = loadMessagesDb();
            entries.push(entry);
            saveMessagesDb(entries);
            appendAuditLog({
              type: "message_sent",
              username: session.username,
              detail: `To ${recipient.username}: "${text.slice(0, 140)}"`,
            });

            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                id: entry.id,
                from: entry.fromUsername,
                text: entry.text,
                createdAt: entry.createdAt,
                isMine: true,
              })
            );
          } catch (err) {
            res.statusCode = 500;
            res.end("Send failed: " + (err as Error).message);
          }
          return;
        }

        if (url.pathname === "/api/messages" && req.method === "DELETE") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          const id = url.searchParams.get("id") || "";
          const entries = loadMessagesDb();
          const index = entries.findIndex((m) => m.id === id);
          if (index === -1) {
            res.statusCode = 404;
            res.end("Message not found.");
            return;
          }
          const message = entries[index];
          if (!isPlatformAdmin(session.userId, session.username)) {
            res.statusCode = 403;
            res.end("Only an admin can delete messages.");
            return;
          }
          entries[index] = { ...message, deleted: true, deletedAt: Date.now() };
          saveMessagesDb(entries);
          appendAuditLog({
            type: "message_deleted",
            username: session.username,
            detail: `Admin-deleted a message from ${message.fromUsername} to ${message.toUsername}`,
          });
          res.statusCode = 204;
          res.end();
          return;
        }

        next();
      });
    },
  };
}

const ROYAL_TWEETS_DB = path.resolve(process.cwd(), "royal-tweets-data.json");
const TWEET_URL_PATTERN = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\/[^/]+\/status\/\d+/i;

function loadRoyalTweetsDb(): RoyalTweetEntry[] {
  try {
    return JSON.parse(fs.readFileSync(ROYAL_TWEETS_DB, "utf-8"));
  } catch {
    return [];
  }
}

function saveRoyalTweetsDb(entries: RoyalTweetEntry[]) {
  fs.writeFileSync(ROYAL_TWEETS_DB, JSON.stringify(entries, null, 2));
}

function royalTweetsPlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "royal-tweets-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);

        if (url.pathname === "/api/royal-tweets" && req.method === "GET") {
          const entries = loadRoyalTweetsDb().sort((a, b) => b.createdAt - a.createdAt);
          const canAdd = session
            ? isPlatformAdmin(session.userId, session.username) ||
              (await isRobloxGroupMember(session.userId, ROYAL_FAMILY_GROUP_ID))
            : false;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              tweets: entries.map((e) => ({
                id: e.id,
                url: e.url,
                addedByUsername: e.addedByUsername,
                createdAt: e.createdAt,
              })),
              canAdd,
            })
          );
          return;
        }

        if (url.pathname === "/api/royal-tweets" && req.method === "POST") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          const isMember = await isRobloxGroupMember(session.userId, ROYAL_FAMILY_GROUP_ID);
          if (!isPlatformAdmin(session.userId, session.username) && !isMember) {
            res.statusCode = 403;
            res.end("Only members of the Royal Family group can add posts.");
            return;
          }
          try {
            const body = await readJsonBody(req);
            const tweetUrl = (body.url || "").toString().trim();
            if (!TWEET_URL_PATTERN.test(tweetUrl)) {
              res.statusCode = 400;
              res.end("That doesn't look like a valid X/Twitter post link.");
              return;
            }
            const entry: RoyalTweetEntry = {
              id: crypto.randomBytes(12).toString("hex"),
              url: tweetUrl,
              addedByUsername: session.username,
              createdAt: Date.now(),
            };
            const entries = loadRoyalTweetsDb();
            entries.push(entry);
            saveRoyalTweetsDb(entries);
            appendAuditLog({
              type: "royal_tweet_added",
              username: session.username,
              detail: tweetUrl,
            });
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(entry));
          } catch (err) {
            res.statusCode = 500;
            res.end("Failed to add post: " + (err as Error).message);
          }
          return;
        }

        if (url.pathname === "/api/royal-tweets" && req.method === "DELETE") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          const isMember = await isRobloxGroupMember(session.userId, ROYAL_FAMILY_GROUP_ID);
          if (!isPlatformAdmin(session.userId, session.username) && !isMember) {
            res.statusCode = 403;
            res.end("Only members of the Royal Family group can delete posts.");
            return;
          }
          const id = url.searchParams.get("id");
          if (!id) {
            res.statusCode = 400;
            res.end("Missing post id.");
            return;
          }
          const entries = loadRoyalTweetsDb();
          const next = entries.filter((e) => e.id !== id);
          if (next.length === entries.length) {
            res.statusCode = 404;
            res.end("Post not found.");
            return;
          }
          saveRoyalTweetsDb(next);
          appendAuditLog({
            type: "royal_tweet_deleted",
            username: session.username,
            detail: `Deleted post ${id}`,
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        next();
      });
    },
  };
}

const BLUME_REPORTS_DB = path.resolve(process.cwd(), "blume-reports-data.json");

function loadBlumeReportsDb(): BlumeReportEntry[] {
  try {
    return JSON.parse(fs.readFileSync(BLUME_REPORTS_DB, "utf-8"));
  } catch {
    return [];
  }
}

function saveBlumeReportsDb(entries: BlumeReportEntry[]) {
  fs.writeFileSync(BLUME_REPORTS_DB, JSON.stringify(entries, null, 2));
}

function blumeReportsPlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "blume-reports-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/blume-content" || (url.searchParams.get("type") || "report") !== "report") {
          next();
          return;
        }

        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        const canAccess = session ? await isBlumeAuthorized(session.userId) : false;
        const isSuperUser = session ? isBlumeSuperUser(session.userId) : false;

        if (req.method === "GET") {
          if (!canAccess) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ reports: [], canAccess: false, isSuperUser: false }));
            return;
          }
          let reports = loadBlumeReportsDb()
            .filter((r) => !r.expiresAt || r.expiresAt > Date.now())
            .sort((a, b) => b.createdAt - a.createdAt);
          const personId = url.searchParams.get("personId") || "";
          if (personId) {
            reports = reports.filter((r) => r.linkedUserId === personId);
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ reports, canAccess: true, isSuperUser }));
          return;
        }

        if (req.method === "POST") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          if (!canAccess) {
            res.statusCode = 403;
            res.end("You do not have clearance to file intelligence reports.");
            return;
          }
          try {
            const body = await readJsonBody(req);
            const title = (body.title || "").toString().trim();
            const content = (body.content || "").toString().trim();
            const linkedPersonQuery = (body.linkedPerson || "").toString().trim();
            if (!title || !content) {
              res.statusCode = 400;
              res.end("Title and report body are required.");
              return;
            }
            if (title.length > 200) {
              res.statusCode = 400;
              res.end("Title is too long (max 200 characters).");
              return;
            }
            if (content.length > 5000) {
              res.statusCode = 400;
              res.end("Report is too long (max 5000 characters).");
              return;
            }
            if (containsBlockedLanguage(title) || containsBlockedLanguage(content)) {
              res.statusCode = 400;
              res.end(MODERATION_REJECTION_MESSAGE);
              return;
            }
            let expiresAt: number | undefined;
            const expiresAtRaw = (body.expiresAt || "").toString().trim();
            if (expiresAtRaw) {
              const parsed = new Date(`${expiresAtRaw}T23:59:59`).getTime();
              if (Number.isNaN(parsed)) {
                res.statusCode = 400;
                res.end("Invalid expiry date.");
                return;
              }
              expiresAt = parsed;
            }
            let linkedUserId: string | undefined;
            let linkedUsername: string | undefined;
            if (linkedPersonQuery) {
              const resolved = await resolveRobloxUserId(linkedPersonQuery);
              if (!resolved) {
                res.statusCode = 400;
                res.end(`Couldn't find a Roblox user matching "${linkedPersonQuery}" to link this report to.`);
                return;
              }
              linkedUserId = resolved.userId;
              linkedUsername = resolved.username;
            }
            const entry: BlumeReportEntry = {
              id: crypto.randomBytes(12).toString("hex"),
              title,
              body: content,
              authorUsername: session.username,
              createdAt: Date.now(),
              ...(linkedUserId ? { linkedUserId, linkedUsername } : {}),
              ...(expiresAt ? { expiresAt } : {}),
            };
            const entries = loadBlumeReportsDb();
            entries.push(entry);
            saveBlumeReportsDb(entries);
            appendAuditLog({
              type: "blume_report",
              username: session.username,
              detail: title,
            });
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(entry));
          } catch (err) {
            res.statusCode = 500;
            res.end("Failed to save report: " + (err as Error).message);
          }
          return;
        }

        if (req.method === "DELETE") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          if (!canAccess) {
            res.statusCode = 403;
            res.end("You do not have clearance to remove intelligence reports.");
            return;
          }
          const id = url.searchParams.get("id") || "";
          if (!id) {
            res.statusCode = 400;
            res.end("Missing report id.");
            return;
          }
          const target = loadBlumeReportsDb().find((r) => r.id === id);
          const entries = loadBlumeReportsDb().filter((r) => r.id !== id);
          saveBlumeReportsDb(entries);
          appendAuditLog({
            type: "blume_report_deleted",
            username: session.username,
            detail: target?.title || id,
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        next();
      });
    },
  };
}

const BLUME_BLOG_DB = path.resolve(process.cwd(), "blume-blog-data.json");

function loadBlumeBlogDb(): BlumeBlogPost[] {
  try {
    return JSON.parse(fs.readFileSync(BLUME_BLOG_DB, "utf-8"));
  } catch {
    return [];
  }
}

function saveBlumeBlogDb(posts: BlumeBlogPost[]) {
  fs.writeFileSync(BLUME_BLOG_DB, JSON.stringify(posts, null, 2));
}

function blumeBlogPlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "blume-blog-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/blume-content" || url.searchParams.get("type") !== "blog") {
          next();
          return;
        }

        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        const canEdit = session ? isBlumeSuperUser(session.userId) : false;

        if (req.method === "GET") {
          const posts = loadBlumeBlogDb().sort((a, b) => b.createdAt - a.createdAt);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ posts, canEdit }));
          return;
        }

        if (req.method === "POST") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          if (!canEdit) {
            res.statusCode = 403;
            res.end("Only Blume operators can publish to the blog.");
            return;
          }
          try {
            const body = await readJsonBody(req);
            const title = (body.title || "").toString().trim();
            const excerpt = (body.excerpt || "").toString().trim();
            const readMinutes = Math.max(1, Math.min(60, Number(body.readMinutes) || 4));
            if (!title || !excerpt) {
              res.statusCode = 400;
              res.end("Title and excerpt are required.");
              return;
            }
            if (title.length > 160) {
              res.statusCode = 400;
              res.end("Title is too long (max 160 characters).");
              return;
            }
            if (excerpt.length > 600) {
              res.statusCode = 400;
              res.end("Excerpt is too long (max 600 characters).");
              return;
            }
            if (containsBlockedLanguage(title) || containsBlockedLanguage(excerpt)) {
              res.statusCode = 400;
              res.end(MODERATION_REJECTION_MESSAGE);
              return;
            }
            const entry: BlumeBlogPost = {
              id: crypto.randomBytes(12).toString("hex"),
              title,
              excerpt,
              readMinutes,
              authorUsername: session.username,
              createdAt: Date.now(),
            };
            const posts = loadBlumeBlogDb();
            posts.push(entry);
            saveBlumeBlogDb(posts);
            appendAuditLog({
              type: "blume_blog_post",
              username: session.username,
              detail: title,
            });
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(entry));
          } catch (err) {
            res.statusCode = 500;
            res.end("Failed to publish post: " + (err as Error).message);
          }
          return;
        }

        if (req.method === "DELETE") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          if (!canEdit) {
            res.statusCode = 403;
            res.end("Only Blume operators can remove blog posts.");
            return;
          }
          const id = url.searchParams.get("id") || "";
          if (!id) {
            res.statusCode = 400;
            res.end("Missing post id.");
            return;
          }
          const target = loadBlumeBlogDb().find((p) => p.id === id);
          const posts = loadBlumeBlogDb().filter((p) => p.id !== id);
          saveBlumeBlogDb(posts);
          appendAuditLog({
            type: "blume_blog_post_deleted",
            username: session.username,
            detail: target?.title || id,
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        next();
      });
    },
  };
}

interface ThamesWaterJob {
  id: string;
  title: string;
  department: string;
  description: string;
  postedByUsername: string;
  createdAt: number;
}

const THAMES_WATER_JOBS_DB = path.resolve(process.cwd(), "thames-water-jobs-data.json");

function loadThamesWaterJobsDb(): ThamesWaterJob[] {
  try {
    return JSON.parse(fs.readFileSync(THAMES_WATER_JOBS_DB, "utf-8"));
  } catch {
    return [];
  }
}

function saveThamesWaterJobsDb(jobs: ThamesWaterJob[]) {
  fs.writeFileSync(THAMES_WATER_JOBS_DB, JSON.stringify(jobs, null, 2));
}

function thamesWaterPlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "thames-water-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/blume-content" || url.searchParams.get("type") !== "thamesWater") {
          next();
          return;
        }

        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        const canManage = session
          ? isBlumeSuperUser(session.userId) || session.username.toLowerCase() === "camhse"
          : false;

        if (req.method === "GET") {
          const jobs = loadThamesWaterJobsDb().sort((a, b) => b.createdAt - a.createdAt);
          const payloadJobs = canManage
            ? jobs
            : jobs.map(({ postedByUsername, createdAt, ...rest }) => rest);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ jobs: payloadJobs, canManage }));
          return;
        }

        if (req.method === "POST") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          if (!canManage) {
            res.statusCode = 403;
            res.end("You don't have access to manage Thames Water job openings.");
            return;
          }
          try {
            const body = await readJsonBody(req);
            const title = (body.title || "").toString().trim();
            const department = (body.department || "").toString().trim();
            const description = (body.description || "").toString().trim();
            if (!title) {
              res.statusCode = 400;
              res.end("Title is required.");
              return;
            }
            if (title.length > 120) {
              res.statusCode = 400;
              res.end("Title is too long (max 120 characters).");
              return;
            }
            if (department.length > 80) {
              res.statusCode = 400;
              res.end("Department is too long (max 80 characters).");
              return;
            }
            if (description.length > 2000) {
              res.statusCode = 400;
              res.end("Description is too long (max 2000 characters).");
              return;
            }
            if (containsBlockedLanguage(title) || containsBlockedLanguage(description)) {
              res.statusCode = 400;
              res.end(MODERATION_REJECTION_MESSAGE);
              return;
            }
            const entry: ThamesWaterJob = {
              id: crypto.randomBytes(12).toString("hex"),
              title,
              department,
              description,
              postedByUsername: session.username,
              createdAt: Date.now(),
            };
            const jobs = loadThamesWaterJobsDb();
            jobs.push(entry);
            saveThamesWaterJobsDb(jobs);
            appendAuditLog({
              type: "thames_water_job_added",
              username: session.username,
              detail: title,
            });
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(entry));
          } catch (err) {
            res.statusCode = 500;
            res.end("Failed: " + (err as Error).message);
          }
          return;
        }

        if (req.method === "DELETE") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          if (!canManage) {
            res.statusCode = 403;
            res.end("You don't have access to manage Thames Water job openings.");
            return;
          }
          const id = url.searchParams.get("id") || "";
          if (!id) {
            res.statusCode = 400;
            res.end("Missing job id.");
            return;
          }
          const target = loadThamesWaterJobsDb().find((j) => j.id === id);
          const jobs = loadThamesWaterJobsDb().filter((j) => j.id !== id);
          saveThamesWaterJobsDb(jobs);
          if (target) {
            appendAuditLog({
              type: "thames_water_job_removed",
              username: session.username,
              detail: target.title,
            });
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        next();
      });
    },
  };
}

function adminPlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "admin-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/admin") {
          next();
          return;
        }

        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        if (!session) {
          res.statusCode = 401;
          res.end("You must be signed in.");
          return;
        }
        if (!isPlatformAdmin(session.userId, session.username)) {
          res.statusCode = 403;
          res.end("You do not have admin access.");
          return;
        }
        const callerIsRoot = isRootAdmin(session.username);

        if (req.method === "GET") {
          const checkTarget = url.searchParams.get("checkTarget") || "";
          if (checkTarget) {
            const target = findKnownUser(checkTarget);
            if (!target) {
              res.setHeader("Content-Type", "application/json");
              res.statusCode = 404;
              res.end(JSON.stringify({ found: false }));
              return;
            }
            const isProtected = isRootAdmin(target.username);
            const groupNames = isProtected ? [] : await getMemberGroupNames(target.userId);
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                found: true,
                userId: target.userId,
                username: target.username,
                avatarUrl: target.avatarUrl,
                isProtected,
                groupNames,
              })
            );
            return;
          }
          const allMessages = loadMessagesDb()
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 300)
            .map((m) => ({
              id: m.id,
              from: m.fromUsername,
              to: m.toUsername,
              text: m.text,
              createdAt: m.createdAt,
            }));
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              isAdmin: true,
              isRootAdmin: callerIsRoot,
              rootAdmins: ROOT_ADMIN_USERNAMES,
              specialAdmins: loadSpecialAdminsDb(),
              auditLog: getAuditLog(300),
              bans: loadBansDb(),
              messages: allMessages,
              loggedInUsernames: getLoggedInUsernames(),
            })
          );
          return;
        }

        if (req.method === "POST") {
          try {
            const body = await readJsonBody(req);
            const action = (body.action || "").toString();
            if (action === "ban" || action === "unban") {
              const targetQuery = (body.target || "").toString().trim();
              if (!targetQuery) {
                res.statusCode = 400;
                res.end("Missing target username or user ID.");
                return;
              }
              const target = findKnownUser(targetQuery);
              if (!target) {
                res.statusCode = 404;
                res.end("No one matching that username or user ID has signed into Westbridge OS.");
                return;
              }
              if (action === "ban") {
                if (isRootAdmin(target.username)) {
                  res.statusCode = 403;
                  res.end("This user can't be banned.");
                  return;
                }
                addBan({
                  userId: target.userId,
                  username: target.username,
                  bannedByUsername: session.username,
                  createdAt: Date.now(),
                });
                appendAuditLog({
                  type: "user_banned",
                  username: session.username,
                  detail: `Banned ${target.username}`,
                });
              } else {
                removeBan(target.userId);
                appendAuditLog({
                  type: "user_unbanned",
                  username: session.username,
                  detail: `Unbanned ${target.username}`,
                });
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ bans: loadBansDb() }));
              return;
            }

            if (action === "addAdmin" || action === "removeAdmin") {
              if (!callerIsRoot) {
                res.statusCode = 403;
                res.end("Only bananapoopooo and pl_aced can manage admin access.");
                return;
              }
              const targetQuery = (body.target || "").toString().trim();
              if (!targetQuery) {
                res.statusCode = 400;
                res.end("Missing target username or user ID.");
                return;
              }
              const target = findKnownUser(targetQuery);
              if (!target) {
                res.statusCode = 404;
                res.end("No one matching that username or user ID has signed into Westbridge OS.");
                return;
              }
              if (isRootAdmin(target.username)) {
                res.statusCode = 403;
                res.end(`${target.username} is already a permanent admin.`);
                return;
              }
              if (action === "addAdmin") {
                addSpecialAdmin({
                  userId: target.userId,
                  username: target.username,
                  addedByUsername: session.username,
                  createdAt: Date.now(),
                });
                appendAuditLog({
                  type: "admin_added",
                  username: session.username,
                  detail: `Gave admin access to ${target.username}`,
                });
              } else {
                removeSpecialAdmin(target.userId);
                appendAuditLog({
                  type: "admin_removed",
                  username: session.username,
                  detail: `Removed admin access from ${target.username}`,
                });
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ specialAdmins: loadSpecialAdminsDb() }));
              return;
            }

            res.statusCode = 400;
            res.end("Unknown action.");
          } catch (err) {
            res.statusCode = 500;
            res.end("Admin action failed: " + (err as Error).message);
          }
          return;
        }

        res.statusCode = 405;
        res.end("Method not allowed");
      });
    },
  };
}

const READONLY_API = "https://polarisreadonly.up.railway.app";
const BLUME_SEARCH_HISTORY_DB = path.resolve(process.cwd(), "blume-search-history-data.json");
const BLUME_VEHICLE_TAGS_DB = path.resolve(process.cwd(), "blume-vehicle-tags-data.json");
const BLUME_GROUP_SCAN_DB = path.resolve(process.cwd(), "blume-group-scan-data.json");
const BLUME_CUSTOM_GROUPS_DB = path.resolve(process.cwd(), "blume-custom-groups-data.json");
const BLUME_SERVER_PRESENCE_DB = path.resolve(process.cwd(), "blume-server-presence-data.json");

interface ServerPresenceReport {
  placeId: string | null;
  players: { userId: string; username: string }[];
  updatedAt: number;
}
const SERVER_PRESENCE_STALE_MS = 3 * 60 * 1000;
function loadServerPresence(): ServerPresenceReport | null {
  try {
    return JSON.parse(fs.readFileSync(BLUME_SERVER_PRESENCE_DB, "utf-8"));
  } catch {
    return null;
  }
}
function saveServerPresence(report: ServerPresenceReport) {
  fs.writeFileSync(BLUME_SERVER_PRESENCE_DB, JSON.stringify(report, null, 2));
}
const HISTORY_PER_PERSON_CAP = 20;
const GROUP_SCAN_FRESH_MS = 6 * 60 * 60 * 1000;

interface SearchSnapshot {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  customPlate: string | null;
  searchedByUsername: string;
  createdAt: number;
}

interface VehicleTag {
  id: string;
  userId: string;
  vehicleType: string;
  addedByUsername: string;
  createdAt: number;
}

interface GroupScanEntry {
  userId: string;
  username: string;
  avatarUrl: string | null;
  customPlate: string | null;
  groupIds: number[];
  friends: { userId: string; username: string }[];
  scannedAt: number;
  changed?: { username: boolean; groups: boolean; friends: boolean; at: number } | null;
  lastSeenOnlineAt?: number;
  formerGroups?: { groupId: number; lastSeenAt: number }[];
}

const FORMER_GROUP_WINDOW_MS = 1000 * 60 * 60 * 24 * 182;

function diffFormerGroups(
  existing: GroupScanEntry | undefined,
  newGroupIds: number[]
): { groupId: number; lastSeenAt: number }[] {
  let formerGroups = existing?.formerGroups ? existing.formerGroups.map((f) => ({ ...f })) : [];
  if (existing) {
    const newSet = new Set(newGroupIds);
    for (const oldId of existing.groupIds) {
      if (!newSet.has(oldId)) {
        const lastSeenAt = existing.scannedAt;
        const idx = formerGroups.findIndex((f) => f.groupId === oldId);
        if (idx >= 0) formerGroups[idx] = { groupId: oldId, lastSeenAt };
        else formerGroups.push({ groupId: oldId, lastSeenAt });
      }
    }
    formerGroups = formerGroups.filter((f) => !newGroupIds.includes(f.groupId));
  }
  return formerGroups;
}

interface CustomGroup {
  id: number;
  name: string;
  category: GroupCategory;
}

function loadCustomGroupsDb(): CustomGroup[] {
  try {
    return JSON.parse(fs.readFileSync(BLUME_CUSTOM_GROUPS_DB, "utf-8"));
  } catch {
    return [];
  }
}
function saveCustomGroupsDb(entries: CustomGroup[]) {
  fs.writeFileSync(BLUME_CUSTOM_GROUPS_DB, JSON.stringify(entries, null, 2));
}

function getGroupIdsByCategory(category: GroupCategory): number[] {
  let custom = loadCustomGroupsDb();
  if (!fs.existsSync(BLUME_CUSTOM_GROUPS_DB)) {
    custom = GROUP_SEED;
    saveCustomGroupsDb(custom);
  }
  return custom.filter((c) => c.category === category).map((c) => c.id);
}

function getGroupIdsExcludingCategories(excluded: GroupCategory[]): number[] {
  let custom = loadCustomGroupsDb();
  if (!fs.existsSync(BLUME_CUSTOM_GROUPS_DB)) {
    custom = GROUP_SEED;
    saveCustomGroupsDb(custom);
  }
  return custom.filter((c) => !excluded.includes(c.category)).map((c) => c.id);
}

function getGroupIdsByNameMatch(needles: string[]): number[] {
  let custom = loadCustomGroupsDb();
  if (!fs.existsSync(BLUME_CUSTOM_GROUPS_DB)) {
    custom = GROUP_SEED;
    saveCustomGroupsDb(custom);
  }
  const lowerNeedles = needles.map((n) => n.toLowerCase());
  return custom
    .filter((c) => lowerNeedles.some((n) => c.name.toLowerCase().includes(n)))
    .map((c) => c.id);
}

const HMCTS_EDITOR_GROUP_NAMES = ["crown prosecution", "home office", "ministry of justice"];

async function isHmctsRanked(userId: string): Promise<boolean> {
  const rankedGroupIds = getGroupIdsExcludingCategories(["OCG", "IE"]);
  if (rankedGroupIds.length === 0) return false;
  const memberGroupIds = await getUserGroupIds(userId);
  const memberSet = new Set(memberGroupIds);
  return rankedGroupIds.some((id) => memberSet.has(id));
}

async function isHmctsEditor(userId: string): Promise<boolean> {
  const editorGroupIds = getGroupIdsByNameMatch(HMCTS_EDITOR_GROUP_NAMES);
  if (editorGroupIds.length === 0) return false;
  const memberGroupIds = await getUserGroupIds(userId);
  const memberSet = new Set(memberGroupIds);
  return editorGroupIds.some((id) => memberSet.has(id));
}

const HMCTS_DEPARTMENTS: { label: string; needle: string }[] = [
  { label: "Ministry of Justice", needle: "ministry of justice" },
  { label: "Crown Prosecution Service", needle: "crown prosecution" },
  { label: "Home Office", needle: "home office" },
];

async function getHmctsUserDepartments(userId: string): Promise<string[]> {
  const memberGroupIds = await getUserGroupIds(userId);
  const memberSet = new Set(memberGroupIds);
  const departments: string[] = [];
  for (const dept of HMCTS_DEPARTMENTS) {
    const groupIds = getGroupIdsByNameMatch([dept.needle]);
    if (groupIds.some((id) => memberSet.has(id))) departments.push(dept.label);
  }
  return departments;
}

function loadGroupScanDb(): GroupScanEntry[] {
  try {
    return JSON.parse(fs.readFileSync(BLUME_GROUP_SCAN_DB, "utf-8"));
  } catch {
    return [];
  }
}
function saveGroupScanDb(entries: GroupScanEntry[]) {
  fs.writeFileSync(BLUME_GROUP_SCAN_DB, JSON.stringify(entries, null, 2));
}

function loadSearchHistoryDb(): SearchSnapshot[] {
  try {
    return JSON.parse(fs.readFileSync(BLUME_SEARCH_HISTORY_DB, "utf-8"));
  } catch {
    return [];
  }
}
function saveSearchHistoryDb(entries: SearchSnapshot[]) {
  fs.writeFileSync(BLUME_SEARCH_HISTORY_DB, JSON.stringify(entries, null, 2));
}
function loadVehicleTagsDb(): VehicleTag[] {
  try {
    return JSON.parse(fs.readFileSync(BLUME_VEHICLE_TAGS_DB, "utf-8"));
  } catch {
    return [];
  }
}
function saveVehicleTagsDb(entries: VehicleTag[]) {
  fs.writeFileSync(BLUME_VEHICLE_TAGS_DB, JSON.stringify(entries, null, 2));
}

async function getGroupCatalog(): Promise<
  Record<number, { name: string; tier: "red" | "white"; category: GroupCategory }>
> {
  let custom = loadCustomGroupsDb();
  if (!fs.existsSync(BLUME_CUSTOM_GROUPS_DB)) {
    custom = GROUP_SEED;
    saveCustomGroupsDb(custom);
  }
  const merged: Record<number, { name: string; tier: "red" | "white"; category: GroupCategory }> = {};
  for (const c of custom) merged[c.id] = { name: c.name, tier: tierForCategory(c.category), category: c.category };
  return merged;
}

function relevantGroups(
  groupIds: number[],
  catalog: Record<number, { name: string; tier: "red" | "white"; category?: GroupCategory }>
) {
  return groupIds
    .filter((id) => id in catalog)
    .map((id) => ({ id, ...catalog[id] }))
    .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "red" ? -1 : 1));
}

const AGENT_GROUPS: { id: number; label: string }[] = [
  { id: 187507831, label: "CIA" },
  { id: 154853936, label: "MI5" },
  { id: 685466511, label: "MI6" },
  { id: 315987361, label: "ROCU" },
];

async function scanMemberEntry(
  userId: string,
  usernameHint: string | undefined,
  allEntries: GroupScanEntry[]
): Promise<GroupScanEntry> {
  const existing = allEntries.find((m) => m.userId === userId);
  const resolved = await resolveRobloxUserId(userId);
  const username = resolved?.username || existing?.username || usernameHint || userId;
  const [avatarUrl, groupIds, friendsRaw] = await Promise.all([
    getRobloxAvatarUrl(userId),
    getUserGroupIds(userId),
    getRobloxFriends(userId),
  ]);

  const knownScanIds = new Set(allEntries.map((m) => m.userId));
  const friends = friendsRaw
    .filter((f) => f.userId !== userId && knownScanIds.has(f.userId))
    .map((f) => ({ userId: f.userId, username: f.username }));

  let customPlate: string | null = null;
  try {
    const playerRes = await fetch(`${READONLY_API}/player/${encodeURIComponent(userId)}`);
    const playerText = await playerRes.text();
    let playerData: any;
    try {
      playerData = JSON.parse(playerText);
    } catch {
      playerData = null;
    }
    if (playerRes.ok && playerData && !playerData.error) {
      customPlate = playerData.CustomPlate ?? null;
    }
  } catch {
  }

  if (customPlate) {
    const plateTaken = allEntries.some(
      (m) => m.userId !== userId && m.customPlate === customPlate
    );
    if (plateTaken) customPlate = null;
  }

  let changed: GroupScanEntry["changed"] = null;
  if (existing) {
    const usernameChanged = existing.username !== username;
    const oldGroupIds = new Set(existing.groupIds);
    const newGroupIds = new Set(groupIds);
    const groupsChanged =
      oldGroupIds.size !== newGroupIds.size ||
      [...newGroupIds].some((id) => !oldGroupIds.has(id));
    const oldFriendIds = new Set((existing.friends || []).map((f) => f.userId));
    const newFriendIds = new Set(friends.map((f) => f.userId));
    const friendsChanged =
      oldFriendIds.size !== newFriendIds.size ||
      [...newFriendIds].some((id) => !oldFriendIds.has(id));
    if (usernameChanged || groupsChanged || friendsChanged) {
      changed = { username: usernameChanged, groups: groupsChanged, friends: friendsChanged, at: Date.now() };
    }
  }

  const formerGroups = diffFormerGroups(existing, groupIds);

  return {
    userId,
    username,
    avatarUrl,
    customPlate,
    groupIds,
    friends,
    scannedAt: Date.now(),
    changed,
    formerGroups,
  };
}

async function recordGroupMembershipAndGetFormerGroups(
  userId: string,
  username: string,
  groupIds: number[],
  avatarUrl: string | null
): Promise<{ groupId: number; lastSeenAt: number }[]> {
  const all = loadGroupScanDb();
  const existing = all.find((m) => m.userId === userId);
  const formerGroups = diffFormerGroups(existing, groupIds);

  let changed: GroupScanEntry["changed"] = null;
  if (existing) {
    const usernameChanged = existing.username !== username;
    const oldGroupIds = new Set(existing.groupIds);
    const newGroupIds = new Set(groupIds);
    const groupsChanged =
      oldGroupIds.size !== newGroupIds.size || [...newGroupIds].some((id) => !oldGroupIds.has(id));
    if (usernameChanged || groupsChanged) {
      changed = { username: usernameChanged, groups: groupsChanged, friends: false, at: Date.now() };
    }
  }

  const entry: GroupScanEntry = {
    userId,
    username,
    avatarUrl: avatarUrl ?? existing?.avatarUrl ?? null,
    customPlate: existing?.customPlate ?? null,
    groupIds,
    friends: existing?.friends || [],
    scannedAt: Date.now(),
    changed,
    lastSeenOnlineAt: existing?.lastSeenOnlineAt,
    formerGroups,
  };
  const next = [...all.filter((m) => m.userId !== userId), entry];
  saveGroupScanDb(next);
  return formerGroups;
}

// Shared by both Blume's Person Search and HMCTS's Background Searches — same
// underlying lookup, just gated by different authorization checks per caller.
async function performPersonSearchDev(
  query: string,
  session: { userId: string; username: string }
): Promise<{ status: 404; error: string } | { status: 200; data: any }> {
  const resolved = await resolveRobloxUserId(query);
  if (!resolved) {
    return { status: 404, error: "No Roblox user found matching that name or ID." };
  }
  const { userId, username } = resolved;

  const catalog = await getGroupCatalog();
  const [avatarUrl, groupIds] = await Promise.all([
    getRobloxAvatarUrl(userId),
    getUserGroupIds(userId),
  ]);
  const groups = relevantGroups(groupIds, catalog);

  let customPlate: string | null = null;
  let arrestHistory: unknown = null;
  let apiError: string | null = null;

  try {
    const playerRes = await fetch(`${READONLY_API}/player/${encodeURIComponent(userId)}`);
    const playerText = await playerRes.text();
    let playerData: any;
    try {
      playerData = JSON.parse(playerText);
    } catch {
      playerData = null;
    }
    if (!playerRes.ok || !playerData) {
      apiError = `The records API didn't respond as expected (status ${playerRes.status}).`;
    } else if (playerData.error) {
      apiError = String(playerData.error);
    } else {
      customPlate = playerData.CustomPlate ?? null;
      arrestHistory = playerData.ArrestHistory ?? null;
    }
  } catch (err) {
    apiError = "Couldn't reach the records API: " + (err as Error).message;
  }

  const vehicleTags = loadVehicleTagsDb().filter((v) => v.userId === userId);

  const historyListForFriends = loadSearchHistoryDb();
  const scanListForFriends = loadGroupScanDb();
  const knownAvatarByUserId = new Map<string, string | null>();
  for (const h of historyListForFriends) knownAvatarByUserId.set(h.userId, h.avatarUrl);
  for (const s of scanListForFriends) knownAvatarByUserId.set(s.userId, s.avatarUrl);
  const scanByUserId = new Map<string, GroupScanEntry>();
  for (const s of scanListForFriends) scanByUserId.set(s.userId, s);
  const knownIds = new Set<string>([
    ...historyListForFriends.map((h) => h.userId),
    ...scanListForFriends.map((s) => s.userId),
  ]);
  const friendMap = new Map<string, { userId: string; username: string }>();
  for (const f of scanByUserId.get(userId)?.friends || []) {
    if (f.userId !== userId && knownIds.has(f.userId)) friendMap.set(f.userId, f);
  }
  for (const s of scanListForFriends) {
    if (s.userId === userId) continue;
    if ((s.friends || []).some((f) => f.userId === userId)) {
      friendMap.set(s.userId, { userId: s.userId, username: s.username });
    }
  }
  const knownFriends = Array.from(friendMap.values()).map((f) => {
    const scanEntry = scanByUserId.get(f.userId);
    const redGroupNames = scanEntry
      ? relevantGroups(scanEntry.groupIds, catalog)
          .filter((g) => g.tier === "red")
          .map((g) => g.name)
      : [];
    return {
      userId: f.userId,
      username: f.username,
      avatarUrl: knownAvatarByUserId.get(f.userId) ?? null,
      redGroupNames,
    };
  });

  const ownScanEntry = scanListForFriends.find((s) => s.userId === userId);
  const groupScanChange = ownScanEntry?.changed || null;

  if (avatarUrl || customPlate) {
    const allHistory = loadSearchHistoryDb();
    const existingForPerson = allHistory
      .filter((h) => h.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
    const mostRecent = existingForPerson[0];
    const unchanged =
      mostRecent && mostRecent.avatarUrl === avatarUrl && mostRecent.customPlate === customPlate;
    if (!unchanged) {
      const entry: SearchSnapshot = {
        id: crypto.randomBytes(12).toString("hex"),
        userId,
        username,
        avatarUrl,
        customPlate,
        searchedByUsername: session.username,
        createdAt: Date.now(),
      };
      const others = allHistory.filter((h) => h.userId !== userId);
      const mine = [entry, ...existingForPerson].slice(0, HISTORY_PER_PERSON_CAP);
      saveSearchHistoryDb([...others, ...mine]);
    }
  }

  const rawFormerGroups = await recordGroupMembershipAndGetFormerGroups(userId, username, groupIds, avatarUrl);
  const formerGroups = rawFormerGroups
    .filter((f) => Date.now() - f.lastSeenAt <= FORMER_GROUP_WINDOW_MS)
    .map((f) => {
      const info = catalog[f.groupId];
      return info ? { id: f.groupId, ...info, lastSeenAt: f.lastSeenAt } : null;
    })
    .filter((f): f is NonNullable<typeof f> => !!f && f.tier === "red")
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  // Folds Verifile's disciplinary log into the same result card.
  const punishments = loadVerifilePunishmentsDb()
    .filter((p) => p.targetUserId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);

  return {
    status: 200,
    data: {
      userId,
      username,
      avatarUrl,
      customPlate,
      arrestHistory,
      groups,
      formerGroups,
      vehicleTags,
      knownFriends,
      groupScanChange,
      apiError,
      lastSeenOnlineAt: scanByUserId.get(userId)?.lastSeenOnlineAt || null,
      punishments,
    },
  };
}

function addVehicleTagForDev(
  userId: string,
  vehicleType: string,
  addedByUsername: string
): { status: 200; vehicleTags: VehicleTag[] } | { status: 400; error: string } {
  if (!userId || !vehicleType) return { status: 400, error: "Missing userId or vehicleType." };
  if (vehicleType.length > 80) return { status: 400, error: "Vehicle type is too long (max 80 characters)." };
  if (containsBlockedLanguage(vehicleType)) return { status: 400, error: MODERATION_REJECTION_MESSAGE };
  const entry: VehicleTag = {
    id: crypto.randomBytes(12).toString("hex"),
    userId,
    vehicleType,
    addedByUsername,
    createdAt: Date.now(),
  };
  const tags = loadVehicleTagsDb();
  tags.push(entry);
  saveVehicleTagsDb(tags);
  return { status: 200, vehicleTags: tags.filter((t) => t.userId === userId) };
}

function removeVehicleTagForDev(
  id: string,
  session: { userId: string; username: string }
): { status: 200; vehicleTags: VehicleTag[] } | { status: 400 | 403 | 404; error: string } {
  if (!id) return { status: 400, error: "Missing vehicle tag id." };
  const tags = loadVehicleTagsDb();
  const target = tags.find((t) => t.id === id);
  if (!target) return { status: 404, error: "Vehicle tag not found." };
  if (target.addedByUsername !== session.username && !isPlatformAdmin(session.userId, session.username)) {
    return { status: 403, error: "You can only remove vehicle tags you added." };
  }
  const next = tags.filter((t) => t.id !== id);
  saveVehicleTagsDb(next);
  return { status: 200, vehicleTags: next.filter((t) => t.userId === target.userId) };
}

function blumeSearchPlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "blume-search-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/blume-search") {
          next();
          return;
        }

        if (req.method === "POST") {
          let peekBody: any;
          try {
            peekBody = await readJsonBody(req);
          } catch {
            res.statusCode = 400;
            res.end("Invalid JSON body.");
            return;
          }
          if (peekBody?.action === "reportServerPlayers") {
            const providedKey = req.headers["x-ingest-key"];
            const expectedKey = process.env.BLUME_INGEST_KEY;
            if (!expectedKey || providedKey !== expectedKey) {
              res.statusCode = 401;
              res.end("Invalid or missing ingest key.");
              return;
            }
            const rawPlayers = Array.isArray(peekBody.players) ? peekBody.players : [];
            const players = rawPlayers
              .map((p: any) => {
                if (p == null || p.userId == null || !p.username) return null;
                return { userId: String(p.userId), username: String(p.username) };
              })
              .filter((p: any): p is { userId: string; username: string } => !!p)
              .slice(0, 300);
            saveServerPresence({
              placeId: peekBody.placeId != null ? String(peekBody.placeId) : null,
              players,
              updatedAt: Date.now(),
            });
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, count: players.length }));
            return;
          }
          (req as any)._parsedBody = peekBody;
        }

        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        if (!session) {
          res.statusCode = 401;
          res.end("You must be signed in.");
          return;
        }

        // HMCTS "Background Searches" — the same Person Search lookup as Blume, gated
        // to HMCTS's own ranked tier (all groups except OCG/IE) instead of Blume clearance.
        if (
          req.method === "GET" &&
          (url.searchParams.get("hmctsBackgroundSearch") || url.searchParams.get("hmctsBackgroundHistory"))
        ) {
          if (!(await isHmctsRanked(session.userId))) {
            res.statusCode = 403;
            res.end("You do not have the ranked clearance required for Background Searches.");
            return;
          }
          const hmctsQuery = url.searchParams.get("hmctsBackgroundSearch");
          if (hmctsQuery) {
            const q = hmctsQuery.trim();
            if (!q) {
              res.statusCode = 400;
              res.end("Missing search query.");
              return;
            }
            const result = await performPersonSearchDev(q, session);
            if (result.status === 404) {
              res.statusCode = 404;
              res.end(result.error);
              return;
            }
            appendAuditLog({
              type: "hmcts_background_search",
              username: session.username,
              detail: `Searched ${result.data.username} (${result.data.userId})`,
            });
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result.data));
            return;
          }
          const hmctsHistoryUserId = url.searchParams.get("hmctsBackgroundHistory");
          if (hmctsHistoryUserId) {
            const history = loadSearchHistoryDb()
              .filter((h) => h.userId === hmctsHistoryUserId)
              .sort((a, b) => b.createdAt - a.createdAt);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ history }));
            return;
          }
        }

        if (req.method === "POST") {
          const hmctsPeekBody = (req as any)._parsedBody;
          if (hmctsPeekBody?.action === "hmctsAddVehicle" || hmctsPeekBody?.action === "hmctsRemoveVehicle") {
            if (!(await isHmctsRanked(session.userId))) {
              res.statusCode = 403;
              res.end("You do not have the ranked clearance required for Background Searches.");
              return;
            }
            if (hmctsPeekBody.action === "hmctsAddVehicle") {
              const result = addVehicleTagForDev(
                (hmctsPeekBody.userId || "").toString().trim(),
                (hmctsPeekBody.vehicleType || "").toString().trim(),
                session.username
              );
              res.statusCode = result.status;
              if (result.status !== 200) {
                res.end(result.error);
                return;
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ vehicleTags: result.vehicleTags }));
              return;
            }
            if (hmctsPeekBody.action === "hmctsRemoveVehicle") {
              const result = removeVehicleTagForDev((hmctsPeekBody.id || "").toString().trim(), session);
              res.statusCode = result.status;
              if (result.status !== 200) {
                res.end(result.error);
                return;
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ vehicleTags: result.vehicleTags }));
              return;
            }
          }
        }

        if (req.method === "GET" && (url.searchParams.get("verifileSearch") || url.searchParams.get("verifileMyServices"))) {
          if (!(await isVerifileAuthorized(session.userId))) {
            res.statusCode = 403;
            res.end("You do not have clearance to use Verifile.");
            return;
          }
          const verifileSearchQuery = url.searchParams.get("verifileSearch");
          if (verifileSearchQuery) {
            const q = verifileSearchQuery.trim();
            if (!q) {
              res.statusCode = 400;
              res.end("Missing search query.");
              return;
            }
            const resolved = await resolveRobloxUserId(q);
            if (!resolved) {
              res.statusCode = 404;
              res.end(`Couldn't find a Roblox user matching "${q}".`);
              return;
            }
            const [avatarUrl, avatarSquareUrl, groupIds, catalog, friendsCount, followersCount, createdAt] =
              await Promise.all([
                getRobloxAvatarUrl(resolved.userId),
                getRobloxSquareAvatarUrl(resolved.userId),
                getUserGroupIds(resolved.userId),
                getGroupCatalog(),
                getRobloxFriendsCount(resolved.userId),
                getRobloxFollowersCount(resolved.userId),
                getRobloxAccountCreatedAt(resolved.userId),
              ]);
            const rawFormerGroups = await recordGroupMembershipAndGetFormerGroups(
              resolved.userId,
              resolved.username,
              groupIds,
              avatarUrl
            );
            const formerGroups = rawFormerGroups
              .filter((f) => Date.now() - f.lastSeenAt <= FORMER_GROUP_WINDOW_MS)
              .map((f) => {
                const info = catalog[f.groupId];
                return info ? { id: f.groupId, ...info, lastSeenAt: f.lastSeenAt } : null;
              })
              .filter((f): f is NonNullable<typeof f> => !!f && f.tier === "red")
              .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                userId: resolved.userId,
                username: resolved.username,
                avatarUrl,
                avatarSquareUrl,
                groups: relevantGroups(groupIds, catalog),
                formerGroups,
                friendsCount,
                followersCount,
                createdAt,
              })
            );
            return;
          }
          if (url.searchParams.get("verifileMyServices")) {
            const [groupIds, catalog] = await Promise.all([
              getUserGroupIds(session.userId),
              getGroupCatalog(),
            ]);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ services: relevantGroups(groupIds, catalog) }));
            return;
          }
        }

        if (!(await isBlumeAuthorized(session.userId))) {
          res.statusCode = 403;
          res.end("You do not have clearance to use Person Search.");
          return;
        }

        if (req.method === "GET") {
          if (url.searchParams.get("activeAgents")) {
            const AGENT_SCAN_FRESH_MS = 10 * 60 * 1000;
            const AGENT_SCAN_BATCH_CAP = 8;
            const ONLINE_TOUCH_MIN_GAP_MS = 5 * 60 * 1000;

            const liveReport = loadServerPresence();
            const livePlayers =
              liveReport && Date.now() - liveReport.updatedAt < SERVER_PRESENCE_STALE_MS
                ? liveReport.players
                : [];

            if (livePlayers.length === 0) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ agents: [] }));
              return;
            }

            let all = loadGroupScanDb();
            const byId = new Map(all.map((m) => [m.userId, m]));

            const stale = livePlayers
              .filter((p) => {
                const entry = byId.get(p.userId);
                return !entry || Date.now() - entry.scannedAt >= AGENT_SCAN_FRESH_MS;
              })
              .sort((a, b) => (byId.get(a.userId)?.scannedAt || 0) - (byId.get(b.userId)?.scannedAt || 0))
              .slice(0, AGENT_SCAN_BATCH_CAP);

            let changed = false;
            for (const p of stale) {
              try {
                const entry = await scanMemberEntry(p.userId, p.username, all);
                all = [...all.filter((m) => m.userId !== p.userId), entry];
                byId.set(p.userId, entry);
                changed = true;
              } catch {
              }
            }

            const now = Date.now();
            for (const p of livePlayers) {
              const entry = byId.get(p.userId);
              if (entry && (!entry.lastSeenOnlineAt || now - entry.lastSeenOnlineAt >= ONLINE_TOUCH_MIN_GAP_MS)) {
                entry.lastSeenOnlineAt = now;
                changed = true;
              }
            }

            if (changed) {
              saveGroupScanDb(all);
            }

            const agentGroupIds = AGENT_GROUPS.map((g) => g.id);
            const agents = livePlayers
              .map((p) => byId.get(p.userId))
              .filter((entry): entry is GroupScanEntry => !!entry)
              .filter((entry) => entry.groupIds.some((id) => agentGroupIds.includes(id)))
              .map((entry) => ({
                username: entry.username,
                role: AGENT_GROUPS.filter((g) => entry.groupIds.includes(g.id))
                  .map((g) => g.label)
                  .join(" / "),
              }));

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ agents }));
            return;
          }

          if (url.searchParams.get("activeInGame")) {
            const catalog = await getGroupCatalog();
            const scanCache = loadGroupScanDb();
            const scanByUserId = new Map(scanCache.map((s) => [s.userId, s]));
            const tagMember = (userId: string, username: string, fallbackAvatarUrl: string | null) => {
              const scan = scanByUserId.get(userId);
              const redGroup = scan ? relevantGroups(scan.groupIds, catalog).find((g) => g.tier === "red") : undefined;
              const role = scan
                ? AGENT_GROUPS.filter((g) => scan.groupIds.includes(g.id))
                    .map((g) => g.label)
                    .join(" / ") || null
                : null;
              return {
                username,
                avatarUrl: scan?.avatarUrl ?? fallbackAvatarUrl,
                redGroupName: redGroup?.name || null,
                role,
              };
            };
            const sortUsers = (list: any[]) =>
              list.sort((a, b) => {
                if (!!a.redGroupName !== !!b.redGroupName) return a.redGroupName ? -1 : 1;
                return a.username.localeCompare(b.username);
              });

            const liveReport = loadServerPresence();
            if (liveReport && Date.now() - liveReport.updatedAt < SERVER_PRESENCE_STALE_MS) {
              const users = sortUsers(liveReport.players.map((p) => tagMember(p.userId, p.username, null)));
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ users, live: true, updatedAt: liveReport.updatedAt }));
              return;
            }

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ users: [], live: false, updatedAt: liveReport?.updatedAt || null }));
            return;
          }

          if (url.searchParams.get("groupCatalog")) {
            const catalog = await getGroupCatalog();
            const withCounts = url.searchParams.get("withCounts") === "1";
            const groups = await Promise.all(
              Object.entries(catalog).map(async ([id, g]) => ({
                id: Number(id),
                name: g.name,
                tier: g.tier,
                category: g.category,
                memberCount: withCounts ? await getRobloxGroupMemberCount(Number(id)) : undefined,
              }))
            );
            groups.sort((a, b) => (a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier === "red" ? -1 : 1));
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ groups, canManage: isBlumeSuperUser(session.userId) }));
            return;
          }

          if (url.searchParams.get("monitoringUsers")) {
            const catalog = await getGroupCatalog();
            const scanCache = loadGroupScanDb();
            const scanByLowerUsername = new Map(scanCache.map((s) => [s.username.toLowerCase(), s]));
            const messages = loadMessagesDb();
            const posts = loadPostsDb();
            const viewMap = loadMonitoringViewsDb();
            const names = new Set<string>();
            const activityCount = new Map<string, number>();
            const bumpActivity = (username: string, createdAt: number) => {
              const lastViewed = viewMap[`${session.userId}:${username.toLowerCase()}`] || 0;
              if (createdAt <= lastViewed) return;
              activityCount.set(username, (activityCount.get(username) || 0) + 1);
            };
            for (const m of messages) {
              names.add(m.fromUsername);
              names.add(m.toUsername);
              bumpActivity(m.fromUsername, m.createdAt);
            }
            for (const p of posts) {
              names.add(p.authorUsername);
              bumpActivity(p.authorUsername, p.createdAt);
            }
            const users = Array.from(names)
              .map((username) => {
                const scan = scanByLowerUsername.get(username.toLowerCase());
                const redGroup = scan ? relevantGroups(scan.groupIds, catalog).find((g) => g.tier === "red") : undefined;
                return {
                  username,
                  redGroupName: redGroup?.name || null,
                  activityCount: activityCount.get(username) || 0,
                };
              })
              .sort((a, b) => {
                if (!!a.redGroupName !== !!b.redGroupName) return a.redGroupName ? -1 : 1;
                return a.username.localeCompare(b.username);
              });
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ users }));
            return;
          }

          const monitoringChatsOf = url.searchParams.get("monitoringChats") || "";
          if (monitoringChatsOf) {
            const target = monitoringChatsOf.toLowerCase();
            const messages = loadMessagesDb();
            const posts = loadPostsDb();
            const myMessages = messages.filter(
              (m) => m.fromUsername.toLowerCase() === target || m.toUsername.toLowerCase() === target
            );
            const byPartner = new Map<string, MessageEntry[]>();
            for (const m of myMessages) {
              const partner = m.fromUsername.toLowerCase() === target ? m.toUsername : m.fromUsername;
              if (!byPartner.has(partner)) byPartner.set(partner, []);
              byPartner.get(partner)!.push(m);
            }
            const conversations = Array.from(byPartner.entries())
              .map(([withUsername, msgs]) => ({
                withUsername,
                messages: msgs
                  .sort((a, b) => a.createdAt - b.createdAt)
                  .map((m) => ({
                    id: m.id,
                    from: m.fromUsername,
                    to: m.toUsername,
                    text: m.text,
                    createdAt: m.createdAt,
                    deleted: !!m.deleted,
                  })),
              }))
              .sort((a, b) => {
                const aLast = a.messages[a.messages.length - 1]?.createdAt || 0;
                const bLast = b.messages[b.messages.length - 1]?.createdAt || 0;
                return bLast - aLast;
              });
            const myPosts = posts
              .filter((p) => p.authorUsername.toLowerCase() === target)
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((p) => ({
                id: p.id,
                text: p.text,
                imageUrl: p.imageFilename ? `/posts/uploads/${p.imageFilename}` : null,
                createdAt: p.createdAt,
                deleted: !!p.deleted,
              }));
            const views = loadMonitoringViewsDb();
            views[`${session.userId}:${target}`] = Date.now();
            saveMonitoringViewsDb(views);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ conversations, posts: myPosts }));
            return;
          }

          const groupMembersOf = url.searchParams.get("groupMembers") || "";
          if (groupMembersOf) {
            const cursor = url.searchParams.get("cursor") || "";
            const groupId = extractGroupId(groupMembersOf);
            try {
              const gUrl = `https://groups.roblox.com/v1/groups/${encodeURIComponent(groupId)}/users?limit=100${
                cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
              }`;
              const groupRes = await fetch(gUrl, { headers: robloxHeaders() });
              if (!groupRes.ok) {
                res.statusCode = 400;
                res.end(`Couldn't load group members (status ${groupRes.status}). Check the group ID.`);
                return;
              }
              const data = (await groupRes.json()) as {
                nextPageCursor?: string | null;
                data?: { user?: { userId?: number; username?: string } }[];
              };
              const members = (data.data || [])
                .map((entry) => entry.user)
                .filter((u): u is { userId: number; username: string } => !!u?.userId && !!u?.username)
                .map((u) => ({ userId: String(u.userId), username: u.username }));
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ members, nextCursor: data.nextPageCursor || null }));
            } catch (err) {
              res.statusCode = 500;
              res.end("Couldn't reach Roblox's group API: " + (err as Error).message);
            }
            return;
          }

          const groupScanOf = url.searchParams.get("groupScan") || "";
          if (groupScanOf) {
            const catalog = await getGroupCatalog();
            const groupId = Number(extractGroupId(groupScanOf));
            const members = loadGroupScanDb()
              .filter((m) => m.groupIds.includes(groupId))
              .sort((a, b) => b.scannedAt - a.scannedAt)
              .map((m) => ({ ...m, relevantGroups: relevantGroups(m.groupIds, catalog) }));
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ members }));
            return;
          }

          const historyForUserId = url.searchParams.get("history") || "";
          if (historyForUserId) {
            const history = loadSearchHistoryDb()
              .filter((h) => h.userId === historyForUserId)
              .sort((a, b) => b.createdAt - a.createdAt);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ history }));
            return;
          }

          const query = (url.searchParams.get("query") || "").trim();
          if (!query) {
            res.statusCode = 400;
            res.end("Missing search query.");
            return;
          }

          const result = await performPersonSearchDev(query, session);
          if (result.status === 404) {
            res.statusCode = 404;
            res.end(result.error);
            return;
          }
          appendAuditLog({
            type: "blume_person_search",
            username: session.username,
            detail: `Searched ${result.data.username} (${result.data.userId})`,
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result.data));
          return;
        }

        if (req.method === "POST") {
          try {
            const body = (req as any)._parsedBody ?? (await readJsonBody(req));
            const action = (body.action || "").toString();

            if (action === "addCustomGroup" || action === "removeCustomGroup") {
              if (!isBlumeSuperUser(session.userId)) {
                res.statusCode = 403;
                res.end("Only Blume administrators can manage the group catalog.");
                return;
              }
            }

            if (action === "addCustomGroup") {
              const rawGroupId = (body.groupId || "").toString().trim();
              const groupId = Number(extractGroupId(rawGroupId) || rawGroupId);
              const groupName = (body.groupName || "").toString().trim();
              const groupCategory = (body.groupCategory || "").toString().trim() as GroupCategory;
              if (!groupId || Number.isNaN(groupId)) {
                res.statusCode = 400;
                res.end("Group ID must be numeric, or a valid Roblox group link.");
                return;
              }
              if (!groupName) {
                res.statusCode = 400;
                res.end("Missing group name.");
                return;
              }
              if (groupName.length > 80) {
                res.statusCode = 400;
                res.end("Group name is too long (max 80 characters).");
                return;
              }
              if (!GROUP_CATEGORIES.includes(groupCategory)) {
                res.statusCode = 400;
                res.end(`Category must be one of: ${GROUP_CATEGORIES.join(", ")}.`);
                return;
              }
              if (containsBlockedLanguage(groupName)) {
                res.statusCode = 400;
                res.end(MODERATION_REJECTION_MESSAGE);
                return;
              }
              const custom = loadCustomGroupsDb();
              const next = [
                ...custom.filter((c) => c.id !== groupId),
                { id: groupId, name: groupName, category: groupCategory },
              ];
              saveCustomGroupsDb(next);
              appendAuditLog({
                type: "blume_group_added",
                username: session.username,
                detail: `Added ${groupCategory} group "${groupName}" (${groupId})`,
              });
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  group: { id: groupId, name: groupName, tier: tierForCategory(groupCategory), category: groupCategory },
                })
              );
              return;
            }

            if (action === "removeCustomGroup") {
              const groupId = Number((body.groupId || "").toString().trim());
              if (!groupId || Number.isNaN(groupId)) {
                res.statusCode = 400;
                res.end("Group ID must be numeric.");
                return;
              }
              const custom = loadCustomGroupsDb();
              const removed = custom.find((c) => c.id === groupId);
              const next = custom.filter((c) => c.id !== groupId);
              saveCustomGroupsDb(next);
              if (removed) {
                appendAuditLog({
                  type: "blume_group_removed",
                  username: session.username,
                  detail: `Removed group "${removed.name}" (${groupId})`,
                });
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            if (action === "scanMember") {
              const userId = (body.userId || "").toString().trim();
              if (!userId) {
                res.statusCode = 400;
                res.end("Missing userId.");
                return;
              }
              const all = loadGroupScanDb();
              const existing = all.find((m) => m.userId === userId);
              if (existing && !body.force && Date.now() - existing.scannedAt < GROUP_SCAN_FRESH_MS) {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ entry: existing, skipped: true }));
                return;
              }

              const entry = await scanMemberEntry(userId, undefined, all);
              const next = [...all.filter((m) => m.userId !== userId), entry];
              saveGroupScanDb(next);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ entry, skipped: false }));
              return;
            }

            if (action === "addVehicle") {
              const result = addVehicleTagForDev(
                (body.userId || "").toString().trim(),
                (body.vehicleType || "").toString().trim(),
                session.username
              );
              res.statusCode = result.status;
              if (result.status !== 200) {
                res.end(result.error);
                return;
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ vehicleTags: result.vehicleTags }));
              return;
            }

            if (action === "removeVehicle") {
              const result = removeVehicleTagForDev((body.id || "").toString().trim(), session);
              res.statusCode = result.status;
              if (result.status !== 200) {
                res.end(result.error);
                return;
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ vehicleTags: result.vehicleTags }));
              return;
            }

            res.statusCode = 400;
            res.end("Unknown action.");
          } catch (err) {
            res.statusCode = 500;
            res.end("Action failed: " + (err as Error).message);
          }
          return;
        }

        res.statusCode = 405;
        res.end("Method not allowed");
      });
    },
  };
}

interface VerifileWhitelistEntry {
  userId: string;
  username: string;
  addedByUsername: string;
  addedAt: number;
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
}

const VERIFILE_WHITELIST_DB = path.resolve(process.cwd(), "verifile-whitelist-data.json");
const VERIFILE_PUNISHMENTS_DB = path.resolve(process.cwd(), "verifile-punishments-data.json");

function loadVerifileWhitelistDb(): VerifileWhitelistEntry[] {
  try {
    return JSON.parse(fs.readFileSync(VERIFILE_WHITELIST_DB, "utf-8"));
  } catch {
    return [];
  }
}
function saveVerifileWhitelistDb(entries: VerifileWhitelistEntry[]) {
  fs.writeFileSync(VERIFILE_WHITELIST_DB, JSON.stringify(entries, null, 2));
}
function loadVerifilePunishmentsDb(): VerifilePunishment[] {
  try {
    return JSON.parse(fs.readFileSync(VERIFILE_PUNISHMENTS_DB, "utf-8"));
  } catch {
    return [];
  }
}
function saveVerifilePunishmentsDb(entries: VerifilePunishment[]) {
  fs.writeFileSync(VERIFILE_PUNISHMENTS_DB, JSON.stringify(entries, null, 2));
}

async function isVerifileAuthorized(userId: string): Promise<boolean> {
  if (isBlumeSuperUser(userId)) return true;
  return loadVerifileWhitelistDb().some((w) => w.userId === userId);
}

function verifilePlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "verifile-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/blume-content" || url.searchParams.get("type") !== "verifile") {
          next();
          return;
        }

        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        const canAccess = session ? await isVerifileAuthorized(session.userId) : false;
        const isSuperUser = session ? isBlumeSuperUser(session.userId) : false;

        if (req.method === "GET") {
          if (!canAccess) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ canAccess: false, isSuperUser: false, whitelist: [] }));
            return;
          }
          const target = url.searchParams.get("target") || "";
          if (target) {
            const punishments = loadVerifilePunishmentsDb()
              .filter((p) => p.targetUserId === target)
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((p) => ({
                ...p,
                canDelete: isSuperUser || (!!session && p.addedByUserId === session.userId),
              }));
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ punishments }));
            return;
          }
          const whitelist = isSuperUser ? loadVerifileWhitelistDb() : [];
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ canAccess: true, isSuperUser, whitelist }));
          return;
        }

        if (req.method === "POST") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          try {
            const body = await readJsonBody(req);
            const action = body.action || "";

            if (action === "addWhitelist" || action === "removeWhitelist") {
              if (!isSuperUser) {
                res.statusCode = 403;
                res.end("Only Verifile administrators can manage access.");
                return;
              }
            }

            if (action === "addWhitelist") {
              const rawUsername = (body.username || "").toString().trim();
              if (!rawUsername) {
                res.statusCode = 400;
                res.end("Missing username.");
                return;
              }
              const resolved = await resolveRobloxUserId(rawUsername);
              if (!resolved) {
                res.statusCode = 400;
                res.end(`Couldn't find a Roblox user matching "${rawUsername}".`);
                return;
              }
              const list = loadVerifileWhitelistDb();
              if (list.some((w) => w.userId === resolved.userId)) {
                res.statusCode = 400;
                res.end(`${resolved.username} already has access.`);
                return;
              }
              const next = [
                ...list,
                {
                  userId: resolved.userId,
                  username: resolved.username,
                  addedByUsername: session.username,
                  addedAt: Date.now(),
                },
              ];
              saveVerifileWhitelistDb(next);
              appendAuditLog({
                type: "verifile_whitelist_added",
                username: session.username,
                detail: `Added ${resolved.username} to Verifile access`,
              });
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ whitelist: next }));
              return;
            }

            if (action === "removeWhitelist") {
              const targetUserId = (body.userId || "").toString().trim();
              if (!targetUserId) {
                res.statusCode = 400;
                res.end("Missing userId.");
                return;
              }
              const list = loadVerifileWhitelistDb();
              const removed = list.find((w) => w.userId === targetUserId);
              const next = list.filter((w) => w.userId !== targetUserId);
              saveVerifileWhitelistDb(next);
              if (removed) {
                appendAuditLog({
                  type: "verifile_whitelist_removed",
                  username: session.username,
                  detail: `Removed ${removed.username} from Verifile access`,
                });
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ whitelist: next }));
              return;
            }

            if (action === "addPunishment") {
              if (!canAccess) {
                res.statusCode = 403;
                res.end("You do not have clearance to use Verifile.");
                return;
              }
              const targetUserId = (body.targetUserId || "").toString().trim();
              const targetUsername = (body.targetUsername || "").toString().trim();
              const punishmentType = (body.type || "").toString().trim();
              const details = (body.details || "").toString().trim();
              const serviceGroupId = Number(body.serviceGroupId);
              if (!targetUserId || !targetUsername) {
                res.statusCode = 400;
                res.end("Missing target user.");
                return;
              }
              if (!punishmentType) {
                res.statusCode = 400;
                res.end("Missing punishment type.");
                return;
              }
              if (punishmentType.length > 60) {
                res.statusCode = 400;
                res.end("Type is too long (max 60 characters).");
                return;
              }
              if (!details) {
                res.statusCode = 400;
                res.end("Missing details.");
                return;
              }
              if (details.length > 2000) {
                res.statusCode = 400;
                res.end("Details are too long (max 2000 characters).");
                return;
              }
              if (containsBlockedLanguage(punishmentType) || containsBlockedLanguage(details)) {
                res.statusCode = 400;
                res.end(MODERATION_REJECTION_MESSAGE);
                return;
              }
              if (!serviceGroupId || Number.isNaN(serviceGroupId)) {
                res.statusCode = 400;
                res.end("Missing service.");
                return;
              }
              const customGroups = loadCustomGroupsDb();
              const service = customGroups.find((g) => g.id === serviceGroupId);
              if (!service) {
                res.statusCode = 400;
                res.end("Unrecognized service.");
                return;
              }
              const isMember = await isRobloxGroupMember(session.userId, serviceGroupId);
              if (!isMember) {
                res.statusCode = 403;
                res.end(`You are not confirmed as a member of ${service.name}.`);
                return;
              }
              const entry: VerifilePunishment = {
                id: crypto.randomBytes(12).toString("hex"),
                targetUserId,
                targetUsername,
                type: punishmentType,
                details,
                serviceGroupId,
                serviceGroupName: service.name,
                addedByUserId: session.userId,
                addedByUsername: session.username,
                createdAt: Date.now(),
              };
              const punishments = loadVerifilePunishmentsDb();
              punishments.push(entry);
              saveVerifilePunishmentsDb(punishments);
              appendAuditLog({
                type: "verifile_punishment_added",
                username: session.username,
                detail: `Logged ${punishmentType} for ${targetUsername} (${service.name})`,
              });
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(entry));
              return;
            }

            res.statusCode = 400;
            res.end("Unknown action.");
          } catch (err) {
            res.statusCode = 500;
            res.end("Failed: " + (err as Error).message);
          }
          return;
        }

        if (req.method === "DELETE") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          if (!canAccess) {
            res.statusCode = 403;
            res.end("You do not have clearance to use Verifile.");
            return;
          }
          const id = url.searchParams.get("id") || "";
          if (!id) {
            res.statusCode = 400;
            res.end("Missing entry id.");
            return;
          }
          const punishments = loadVerifilePunishmentsDb();
          const target = punishments.find((p) => p.id === id);
          if (!target) {
            res.statusCode = 404;
            res.end("Entry not found.");
            return;
          }
          if (!isSuperUser && target.addedByUserId !== session.userId) {
            res.statusCode = 403;
            res.end("You can only remove entries you logged.");
            return;
          }
          const next = punishments.filter((p) => p.id !== id);
          saveVerifilePunishmentsDb(next);
          appendAuditLog({
            type: "verifile_punishment_removed",
            username: session.username,
            detail: `Removed ${target.type} for ${target.targetUsername} (${target.serviceGroupName})`,
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.statusCode = 405;
        res.end("Method not allowed");
      });
    },
  };
}

const HMRC_GROUP_ID = 567563234;
const HMRC_LOG_TYPES = ["Information", "Arrest by HMRC", "Money Laundering", "Tax Evasion", "Fraud"];

interface HmrcCard {
  id: string;
  targetUserId: string;
  targetUsername: string;
  riskLevel: string;
  riskNotes: string;
  createdByUserId: string;
  createdByUsername: string;
  createdAt: number;
}

interface HmrcLogEntry {
  id: string;
  cardId: string;
  targetUserId: string;
  targetUsername: string;
  type: string;
  details: string;
  loggedByUserId: string;
  loggedByUsername: string;
  createdAt: number;
}

const HMRC_CARDS_DB = path.resolve(process.cwd(), "hmrc-cards-data.json");
const HMRC_LOGS_DB = path.resolve(process.cwd(), "hmrc-logs-data.json");

function loadHmrcCardsDb(): HmrcCard[] {
  try {
    return JSON.parse(fs.readFileSync(HMRC_CARDS_DB, "utf-8"));
  } catch {
    return [];
  }
}
function saveHmrcCardsDb(entries: HmrcCard[]) {
  fs.writeFileSync(HMRC_CARDS_DB, JSON.stringify(entries, null, 2));
}
function loadHmrcLogsDb(): HmrcLogEntry[] {
  try {
    return JSON.parse(fs.readFileSync(HMRC_LOGS_DB, "utf-8"));
  } catch {
    return [];
  }
}
function saveHmrcLogsDb(entries: HmrcLogEntry[]) {
  fs.writeFileSync(HMRC_LOGS_DB, JSON.stringify(entries, null, 2));
}

function hmrcPlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "hmrc-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/blume-content" || url.searchParams.get("type") !== "hmrc") {
          next();
          return;
        }

        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        const canAccess = session
          ? isPlatformAdmin(session.userId, session.username) ||
            (await isRobloxGroupMember(session.userId, HMRC_GROUP_ID))
          : false;
        const isAdmin = session ? isPlatformAdmin(session.userId, session.username) : false;

        if (req.method === "GET") {
          if (!canAccess) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ canAccess: false, isAdmin: false, cards: [] }));
            return;
          }
          const cardId = url.searchParams.get("cardId") || "";
          if (cardId) {
            const logEntries = loadHmrcLogsDb()
              .filter((l) => l.cardId === cardId)
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((l) => ({
                ...l,
                canDelete: isAdmin || (!!session && l.loggedByUserId === session.userId),
              }));
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ logEntries }));
            return;
          }
          const rawCards = loadHmrcCardsDb().sort((a, b) => b.createdAt - a.createdAt);
          const cards = await Promise.all(
            rawCards.map(async (c) => ({
              ...c,
              avatarUrl: await getRobloxAvatarUrl(c.targetUserId),
              canDelete: isAdmin || (!!session && c.createdByUserId === session.userId),
            }))
          );
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ canAccess: true, isAdmin, cards }));
          return;
        }

        if (req.method === "POST") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          if (!canAccess) {
            res.statusCode = 403;
            res.end("You do not have HMRC clearance.");
            return;
          }
          try {
            const body = await readJsonBody(req);
            const action = body.action || "";

            if (action === "addCard") {
              const rawUsername = (body.username || "").toString().trim();
              if (!rawUsername) {
                res.statusCode = 400;
                res.end("Missing username.");
                return;
              }
              const resolved = await resolveRobloxUserId(rawUsername);
              if (!resolved) {
                res.statusCode = 400;
                res.end(`Couldn't find a Roblox user matching "${rawUsername}".`);
                return;
              }
              const cards = loadHmrcCardsDb();
              if (cards.some((c) => c.targetUserId === resolved.userId)) {
                res.statusCode = 400;
                res.end(`${resolved.username} already has a case file.`);
                return;
              }
              const entry: HmrcCard = {
                id: crypto.randomBytes(12).toString("hex"),
                targetUserId: resolved.userId,
                targetUsername: resolved.username,
                riskLevel: "Low",
                riskNotes: "",
                createdByUserId: session.userId,
                createdByUsername: session.username,
                createdAt: Date.now(),
              };
              const next = [...cards, entry];
              saveHmrcCardsDb(next);
              appendAuditLog({
                type: "hmrc_card_added",
                username: session.username,
                detail: `Opened an HMRC case for ${resolved.username}`,
              });
              const withAvatars = await Promise.all(
                next.map(async (c) => ({
                  ...c,
                  avatarUrl: await getRobloxAvatarUrl(c.targetUserId),
                  canDelete: true,
                }))
              );
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ cards: withAvatars }));
              return;
            }

            if (action === "updateRisk") {
              const cardId = (body.cardId || "").toString().trim();
              const riskLevel = (body.riskLevel || "").toString().trim();
              const riskNotes = (body.riskNotes || "").toString().trim();
              if (!cardId) {
                res.statusCode = 400;
                res.end("Missing case id.");
                return;
              }
              if (!["Low", "Medium", "High"].includes(riskLevel)) {
                res.statusCode = 400;
                res.end("Invalid risk level.");
                return;
              }
              if (riskNotes.length > 2000) {
                res.statusCode = 400;
                res.end("Risk notes are too long (max 2000 characters).");
                return;
              }
              if (containsBlockedLanguage(riskNotes)) {
                res.statusCode = 400;
                res.end(MODERATION_REJECTION_MESSAGE);
                return;
              }
              const cards = loadHmrcCardsDb();
              const index = cards.findIndex((c) => c.id === cardId);
              if (index === -1) {
                res.statusCode = 404;
                res.end("Case not found.");
                return;
              }
              cards[index] = { ...cards[index], riskLevel, riskNotes };
              saveHmrcCardsDb(cards);
              appendAuditLog({
                type: "hmrc_risk_updated",
                username: session.username,
                detail: `Set risk level ${riskLevel} for ${cards[index].targetUsername}`,
              });
              const withAvatars = await Promise.all(
                cards.map(async (c) => ({
                  ...c,
                  avatarUrl: await getRobloxAvatarUrl(c.targetUserId),
                  canDelete: isAdmin || c.createdByUserId === session.userId,
                }))
              );
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ cards: withAvatars }));
              return;
            }

            if (action === "addLog") {
              const cardId = (body.cardId || "").toString().trim();
              const targetUserId = (body.targetUserId || "").toString().trim();
              const targetUsername = (body.targetUsername || "").toString().trim();
              const logType = (body.type || "").toString().trim();
              const details = (body.details || "").toString().trim();
              if (!cardId || !targetUserId || !targetUsername) {
                res.statusCode = 400;
                res.end("Missing case.");
                return;
              }
              if (!HMRC_LOG_TYPES.includes(logType)) {
                res.statusCode = 400;
                res.end("Invalid log type.");
                return;
              }
              if (!details) {
                res.statusCode = 400;
                res.end("Missing details.");
                return;
              }
              if (details.length > 2000) {
                res.statusCode = 400;
                res.end("Details are too long (max 2000 characters).");
                return;
              }
              if (containsBlockedLanguage(details)) {
                res.statusCode = 400;
                res.end(MODERATION_REJECTION_MESSAGE);
                return;
              }
              const entry: HmrcLogEntry = {
                id: crypto.randomBytes(12).toString("hex"),
                cardId,
                targetUserId,
                targetUsername,
                type: logType,
                details,
                loggedByUserId: session.userId,
                loggedByUsername: session.username,
                createdAt: Date.now(),
              };
              const logEntries = loadHmrcLogsDb();
              logEntries.push(entry);
              saveHmrcLogsDb(logEntries);
              appendAuditLog({
                type: "hmrc_log_added",
                username: session.username,
                detail: `Logged ${logType} for ${targetUsername}`,
              });
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ...entry, canDelete: true }));
              return;
            }

            res.statusCode = 400;
            res.end("Unknown action.");
          } catch (err) {
            res.statusCode = 500;
            res.end("Failed: " + (err as Error).message);
          }
          return;
        }

        if (req.method === "DELETE") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in.");
            return;
          }
          if (!canAccess) {
            res.statusCode = 403;
            res.end("You do not have HMRC clearance.");
            return;
          }
          const cardId = url.searchParams.get("cardId") || "";
          if (cardId) {
            const cards = loadHmrcCardsDb();
            const target = cards.find((c) => c.id === cardId);
            if (!target) {
              res.statusCode = 404;
              res.end("Case not found.");
              return;
            }
            if (!isAdmin && target.createdByUserId !== session.userId) {
              res.statusCode = 403;
              res.end("You can only remove cases you opened.");
              return;
            }
            saveHmrcCardsDb(cards.filter((c) => c.id !== cardId));
            saveHmrcLogsDb(loadHmrcLogsDb().filter((l) => l.cardId !== cardId));
            appendAuditLog({
              type: "hmrc_card_removed",
              username: session.username,
              detail: `Closed the HMRC case for ${target.targetUsername}`,
            });
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
            return;
          }

          const id = url.searchParams.get("id") || "";
          if (!id) {
            res.statusCode = 400;
            res.end("Missing entry id.");
            return;
          }
          const logEntries = loadHmrcLogsDb();
          const target = logEntries.find((l) => l.id === id);
          if (!target) {
            res.statusCode = 404;
            res.end("Entry not found.");
            return;
          }
          if (!isAdmin && target.loggedByUserId !== session.userId) {
            res.statusCode = 403;
            res.end("You can only remove entries you logged.");
            return;
          }
          saveHmrcLogsDb(logEntries.filter((l) => l.id !== id));
          appendAuditLog({
            type: "hmrc_log_removed",
            username: session.username,
            detail: `Removed ${target.type} for ${target.targetUsername}`,
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.statusCode = 405;
        res.end("Method not allowed");
      });
    },
  };
}

function hmctsPlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "hmcts-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/blume-content" || url.searchParams.get("type") !== "hmcts") {
          next();
          return;
        }
        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        const ranked = session ? await isHmctsRanked(session.userId) : false;
        const canEdit = session ? await isHmctsEditor(session.userId) : false;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ranked, canEdit }));
      });
    },
  };
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
interface HmctsPublicRecordsRequest {
  id: string;
  foiYear: number;
  foiNumber: number;
  subjectUsername: string;
  subjectUserId: string;
  requestedInfo: string;
  requesterUserId: string;
  requesterUsername: string;
  requesterGroups: { id: number; name: string; category: string }[];
  status: "pending" | "replied";
  reply?: string;
  replyAttachments?: { name: string; url: string }[];
  repliedByUsername?: string;
  repliedAt?: number;
  createdAt: number;
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
interface HmctsLrrPost {
  id: string;
  title: string;
  link: string;
  postedByUsername: string;
  createdAt: number;
}

const HMCTS_MESSAGES_DB = path.resolve(process.cwd(), "hmcts-messages-data.json");
const HMCTS_CASES_DB = path.resolve(process.cwd(), "hmcts-cases-data.json");
const HMCTS_LRR_DB = path.resolve(process.cwd(), "hmcts-lrr-data.json");
const HMCTS_PR_REQUESTS_DB = path.resolve(process.cwd(), "hmcts-pr-requests-data.json");
const HMCTS_CASE_DIR = path.resolve(process.cwd(), "public", "hmcts-cases", "uploads");
const HMCTS_FOI_DIR = path.resolve(process.cwd(), "public", "hmcts-foi", "uploads");
const HMCTS_CASE_MAX_PHOTOS = 4;
const HMCTS_CASE_MAX_FILES = 3;
const HMCTS_CASE_MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

function loadHmctsMessagesDb(): HmctsMessage[] {
  try {
    return JSON.parse(fs.readFileSync(HMCTS_MESSAGES_DB, "utf-8"));
  } catch {
    return [];
  }
}
function saveHmctsMessagesDb(entries: HmctsMessage[]) {
  fs.writeFileSync(HMCTS_MESSAGES_DB, JSON.stringify(entries, null, 2));
}
function loadHmctsCasesDb(): HmctsCase[] {
  try {
    return JSON.parse(fs.readFileSync(HMCTS_CASES_DB, "utf-8"));
  } catch {
    return [];
  }
}
function saveHmctsCasesDb(entries: HmctsCase[]) {
  fs.writeFileSync(HMCTS_CASES_DB, JSON.stringify(entries, null, 2));
}
function loadHmctsLrrDb(): HmctsLrrPost[] {
  try {
    return JSON.parse(fs.readFileSync(HMCTS_LRR_DB, "utf-8"));
  } catch {
    return [];
  }
}
function saveHmctsLrrDb(entries: HmctsLrrPost[]) {
  fs.writeFileSync(HMCTS_LRR_DB, JSON.stringify(entries, null, 2));
}
function loadHmctsPrRequestsDb(): HmctsPublicRecordsRequest[] {
  try {
    return JSON.parse(fs.readFileSync(HMCTS_PR_REQUESTS_DB, "utf-8"));
  } catch {
    return [];
  }
}
function saveHmctsPrRequestsDb(entries: HmctsPublicRecordsRequest[]) {
  fs.writeFileSync(HMCTS_PR_REQUESTS_DB, JSON.stringify(entries, null, 2));
}

function parseAnyDataUrlDev(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

const SYSTEM_SENDER_USERNAME = "eJudiciary";
const SYSTEM_SENDER_AVATAR = "/icons/royal-coat-of-arms.png";
const SYSTEM_SENDER_USER_ID = "system-ejudiciary";

// Dev-server mirror of lib/systemMessage.ts's sendSystemMessage — pushes a DM
// into the shared messages file as sender "eJudiciary" and keeps a synthetic
// known-user entry fresh so it shows up in the recipient's Messages sidebar.
function sendSystemMessageDev(
  toUsername: string,
  text: string,
  attachments?: { name: string; url: string }[]
) {
  const entry: MessageEntry = {
    id: crypto.randomBytes(12).toString("hex"),
    conversationKey: conversationKey(SYSTEM_SENDER_USERNAME, toUsername),
    fromUsername: SYSTEM_SENDER_USERNAME,
    toUsername,
    text,
    createdAt: Date.now(),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  };
  const allMessages = loadMessagesDb();
  allMessages.push(entry);
  saveMessagesDb(allMessages);

  const knownUsers = loadUsersDb();
  const idx = knownUsers.findIndex((u) => u.username.toLowerCase() === SYSTEM_SENDER_USERNAME.toLowerCase());
  const record: KnownUser = {
    userId: SYSTEM_SENDER_USER_ID,
    username: SYSTEM_SENDER_USERNAME,
    avatarUrl: SYSTEM_SENDER_AVATAR,
    lastSeen: Date.now(),
  };
  if (idx >= 0) knownUsers[idx] = record;
  else knownUsers.push(record);
  saveUsersDb(knownUsers);
}

function hmctsChatPlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "hmcts-chat-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/blume-content" || url.searchParams.get("type") !== "hmctsChat") {
          next();
          return;
        }
        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        if (!session) {
          res.statusCode = 401;
          res.end("You must be signed in.");
          return;
        }
        if (!(await isHmctsEditor(session.userId))) {
          res.statusCode = 403;
          res.end("Internal Messaging is restricted to Ministry of Justice, Crown Prosecution Service, and Home Office.");
          return;
        }

        if (req.method === "GET") {
          const messages = loadHmctsMessagesDb().slice(-200);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ messages }));
          return;
        }

        if (req.method === "POST") {
          const body = await readJsonBody(req);
          const text = (body.text || "").toString().trim();
          if (!text) {
            res.statusCode = 400;
            res.end("Message can't be empty.");
            return;
          }
          if (text.length > 1000) {
            res.statusCode = 400;
            res.end("Message is too long (max 1000 characters).");
            return;
          }
          if (containsBlockedLanguage(text)) {
            res.statusCode = 400;
            res.end(MODERATION_REJECTION_MESSAGE);
            return;
          }
          const departments = await getHmctsUserDepartments(session.userId);
          const entry: HmctsMessage = {
            id: crypto.randomBytes(12).toString("hex"),
            fromUserId: session.userId,
            fromUsername: session.username,
            departments,
            text,
            createdAt: Date.now(),
          };
          const all = loadHmctsMessagesDb();
          const next2 = [...all, entry].slice(-500);
          saveHmctsMessagesDb(next2);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ message: entry }));
          return;
        }

        res.statusCode = 405;
        res.end("Method not allowed");
      });
    },
  };
}

function hmctsCasesPlugin(sessions: Map<string, RobloxSession>): Plugin {
  fs.mkdirSync(HMCTS_CASE_DIR, { recursive: true });
  return {
    name: "hmcts-cases-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/blume-content" || url.searchParams.get("type") !== "hmctsCases") {
          next();
          return;
        }
        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        if (!session) {
          res.statusCode = 401;
          res.end("You must be signed in.");
          return;
        }
        if (!(await isHmctsEditor(session.userId))) {
          res.statusCode = 403;
          res.end("Cases & Citations is restricted to Ministry of Justice, Crown Prosecution Service, and Home Office.");
          return;
        }

        if (req.method === "GET") {
          const cases = loadHmctsCasesDb().sort((a, b) => b.createdAt - a.createdAt);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ cases }));
          return;
        }

        if (req.method === "POST") {
          try {
            const body = await readJsonBody(req);
            const title = (body.title || "").toString().trim();
            const info = (body.info || "").toString().trim();
            if (!title) {
              res.statusCode = 400;
              res.end("Missing title.");
              return;
            }
            if (title.length > 140) {
              res.statusCode = 400;
              res.end("Title is too long (max 140 characters).");
              return;
            }
            if (info.length > 4000) {
              res.statusCode = 400;
              res.end("Information is too long (max 4000 characters).");
              return;
            }
            if (containsBlockedLanguage(title) || containsBlockedLanguage(info)) {
              res.statusCode = 400;
              res.end(MODERATION_REJECTION_MESSAGE);
              return;
            }

            let subjectUserId: string | null = null;
            let subjectUsername: string | null = null;
            const subjectQuery = (body.subjectQuery || "").toString().trim();
            if (subjectQuery) {
              const resolved = await resolveRobloxUserId(subjectQuery);
              if (!resolved) {
                res.statusCode = 400;
                res.end(`Couldn't find a Roblox user matching "${subjectQuery}".`);
                return;
              }
              subjectUserId = resolved.userId;
              subjectUsername = resolved.username;
            }

            const rawPhotos: { name?: string; dataUrl?: string }[] = Array.isArray(body.photos)
              ? body.photos.slice(0, HMCTS_CASE_MAX_PHOTOS)
              : [];
            const rawFiles: { name?: string; dataUrl?: string }[] = Array.isArray(body.files)
              ? body.files.slice(0, HMCTS_CASE_MAX_FILES)
              : [];

            const photos: HmctsCaseAttachment[] = [];
            for (const p of rawPhotos) {
              const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(p.dataUrl || "");
              if (!match) continue;
              const ext = MIME_EXT[match[1]];
              if (!ext) continue;
              const buffer = Buffer.from(match[2], "base64");
              if (buffer.length > HMCTS_CASE_MAX_ATTACHMENT_BYTES) {
                res.statusCode = 400;
                res.end("A photo is too large (max 4MB each).");
                return;
              }
              const id = crypto.randomBytes(10).toString("hex");
              const filename = `${id}.${ext}`;
              fs.writeFileSync(path.join(HMCTS_CASE_DIR, filename), buffer);
              photos.push({ name: (p.name || "photo").toString().slice(0, 80), url: `/hmcts-cases/uploads/${filename}` });
            }

            const files: HmctsCaseAttachment[] = [];
            for (const f of rawFiles) {
              const parsed = parseAnyDataUrlDev(f.dataUrl || "");
              if (!parsed) continue;
              if (parsed.buffer.length > HMCTS_CASE_MAX_ATTACHMENT_BYTES) {
                res.statusCode = 400;
                res.end("A file is too large (max 4MB each).");
                return;
              }
              const id = crypto.randomBytes(10).toString("hex");
              const safeName = (f.name || "file").toString().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
              const filename = `${id}-${safeName}`;
              fs.writeFileSync(path.join(HMCTS_CASE_DIR, filename), parsed.buffer);
              files.push({ name: safeName, url: `/hmcts-cases/uploads/${filename}` });
            }

            const entry: HmctsCase = {
              id: crypto.randomBytes(12).toString("hex"),
              title,
              info,
              subjectUserId,
              subjectUsername,
              photos,
              files,
              isPublic: !!body.isPublic,
              createdByUserId: session.userId,
              createdByUsername: session.username,
              createdAt: Date.now(),
            };
            const all = loadHmctsCasesDb();
            all.push(entry);
            saveHmctsCasesDb(all);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(entry));
          } catch (err) {
            res.statusCode = 500;
            res.end("Failed to save case: " + (err as Error).message);
          }
          return;
        }

        if (req.method === "PATCH") {
          try {
            const id = url.searchParams.get("id") || "";
            const all = loadHmctsCasesDb();
            const idx = all.findIndex((c) => c.id === id);
            if (idx === -1) {
              res.statusCode = 404;
              res.end("Case not found.");
              return;
            }
            const target = all[idx];
            if (target.createdByUserId !== session.userId && !isPlatformAdmin(session.userId, session.username)) {
              res.statusCode = 403;
              res.end("You can only edit cases you filed.");
              return;
            }
            const body = await readJsonBody(req);
            const title = body.title !== undefined ? (body.title || "").toString().trim() : target.title;
            const info = body.info !== undefined ? (body.info || "").toString().trim() : target.info;
            if (!title) {
              res.statusCode = 400;
              res.end("Missing title.");
              return;
            }
            if (title.length > 140) {
              res.statusCode = 400;
              res.end("Title is too long (max 140 characters).");
              return;
            }
            if (info.length > 4000) {
              res.statusCode = 400;
              res.end("Information is too long (max 4000 characters).");
              return;
            }
            if (containsBlockedLanguage(title) || containsBlockedLanguage(info)) {
              res.statusCode = 400;
              res.end(MODERATION_REJECTION_MESSAGE);
              return;
            }

            const photos = [...target.photos];
            const files = [...target.files];

            const rawPhotos: { name?: string; dataUrl?: string }[] = Array.isArray(body.addPhotos)
              ? body.addPhotos.slice(0, Math.max(0, HMCTS_CASE_MAX_PHOTOS - photos.length))
              : [];
            for (const p of rawPhotos) {
              const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(p.dataUrl || "");
              if (!match) continue;
              const ext = MIME_EXT[match[1]];
              if (!ext) continue;
              const buffer = Buffer.from(match[2], "base64");
              if (buffer.length > HMCTS_CASE_MAX_ATTACHMENT_BYTES) {
                res.statusCode = 400;
                res.end("A photo is too large (max 4MB each).");
                return;
              }
              const pid = crypto.randomBytes(10).toString("hex");
              const filename = `${pid}.${ext}`;
              fs.writeFileSync(path.join(HMCTS_CASE_DIR, filename), buffer);
              photos.push({ name: (p.name || "photo").toString().slice(0, 80), url: `/hmcts-cases/uploads/${filename}` });
            }

            const rawFiles: { name?: string; dataUrl?: string }[] = Array.isArray(body.addFiles)
              ? body.addFiles.slice(0, Math.max(0, HMCTS_CASE_MAX_FILES - files.length))
              : [];
            for (const f of rawFiles) {
              const parsed = parseAnyDataUrlDev(f.dataUrl || "");
              if (!parsed) continue;
              if (parsed.buffer.length > HMCTS_CASE_MAX_ATTACHMENT_BYTES) {
                res.statusCode = 400;
                res.end("A file is too large (max 4MB each).");
                return;
              }
              const fid = crypto.randomBytes(10).toString("hex");
              const safeName = (f.name || "file").toString().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
              const filename = `${fid}-${safeName}`;
              fs.writeFileSync(path.join(HMCTS_CASE_DIR, filename), parsed.buffer);
              files.push({ name: safeName, url: `/hmcts-cases/uploads/${filename}` });
            }

            const updated: HmctsCase = {
              ...target,
              title,
              info,
              isPublic: body.isPublic !== undefined ? !!body.isPublic : target.isPublic,
              photos,
              files,
            };
            all[idx] = updated;
            saveHmctsCasesDb(all);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(updated));
          } catch (err) {
            res.statusCode = 500;
            res.end("Failed to update case: " + (err as Error).message);
          }
          return;
        }

        if (req.method === "DELETE") {
          const id = url.searchParams.get("id") || "";
          const all = loadHmctsCasesDb();
          const target = all.find((c) => c.id === id);
          if (!target) {
            res.statusCode = 404;
            res.end("Case not found.");
            return;
          }
          if (target.createdByUserId !== session.userId && !isPlatformAdmin(session.userId, session.username)) {
            res.statusCode = 403;
            res.end("You can only remove cases you filed.");
            return;
          }
          for (const attachment of [...target.photos, ...target.files]) {
            const filename = attachment.url.split("/").pop();
            if (filename) {
              try {
                fs.unlinkSync(path.join(HMCTS_CASE_DIR, filename));
              } catch {
              }
            }
          }
          const next2 = all.filter((c) => c.id !== id);
          saveHmctsCasesDb(next2);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.statusCode = 405;
        res.end("Method not allowed");
      });
    },
  };
}

function hmctsLrrPlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "hmcts-lrr-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/blume-content" || url.searchParams.get("type") !== "hmctsLrr") {
          next();
          return;
        }
        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        if (!session) {
          res.statusCode = 401;
          res.end("You must be signed in.");
          return;
        }
        if (!(await isHmctsRanked(session.userId))) {
          res.statusCode = 403;
          res.end("Legal Research Repositories requires a recognised judiciary rank.");
          return;
        }

        if (req.method === "GET") {
          const posts = loadHmctsLrrDb().sort((a, b) => b.createdAt - a.createdAt);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ posts }));
          return;
        }

        if (req.method === "POST") {
          if (!(await isHmctsEditor(session.userId))) {
            res.statusCode = 403;
            res.end("Only Ministry of Justice, Crown Prosecution Service, and Home Office can post updates.");
            return;
          }
          const body = await readJsonBody(req);
          const title = (body.title || "").toString().trim();
          const link = (body.link || "").toString().trim();
          if (!title || !link) {
            res.statusCode = 400;
            res.end("Missing title or link.");
            return;
          }
          if (title.length > 140) {
            res.statusCode = 400;
            res.end("Title is too long (max 140 characters).");
            return;
          }
          if (!/^https?:\/\/.+/i.test(link)) {
            res.statusCode = 400;
            res.end("Link must start with http:// or https://.");
            return;
          }
          if (containsBlockedLanguage(title)) {
            res.statusCode = 400;
            res.end(MODERATION_REJECTION_MESSAGE);
            return;
          }
          const entry: HmctsLrrPost = {
            id: crypto.randomBytes(12).toString("hex"),
            title,
            link,
            postedByUsername: session.username,
            createdAt: Date.now(),
          };
          const all = loadHmctsLrrDb();
          all.push(entry);
          saveHmctsLrrDb(all);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(entry));
          return;
        }

        if (req.method === "DELETE") {
          if (!(await isHmctsEditor(session.userId))) {
            res.statusCode = 403;
            res.end("Only Ministry of Justice, Crown Prosecution Service, and Home Office can remove updates.");
            return;
          }
          const id = url.searchParams.get("id") || "";
          const all = loadHmctsLrrDb();
          const next2 = all.filter((p) => p.id !== id);
          saveHmctsLrrDb(next2);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.statusCode = 405;
        res.end("Method not allowed");
      });
    },
  };
}

function hmctsPublicRecordsPlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "hmcts-public-records-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/blume-content" || url.searchParams.get("type") !== "hmctsPublicRecords") {
          next();
          return;
        }
        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        if (!session) {
          res.statusCode = 401;
          res.end("You must be signed in.");
          return;
        }
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }
        const q = (url.searchParams.get("query") || "").trim();
        if (!q) {
          res.statusCode = 400;
          res.end("Missing search query.");
          return;
        }
        const resolved = await resolveRobloxUserId(q);
        if (!resolved) {
          res.statusCode = 404;
          res.end("No Roblox user found matching that name or ID.");
          return;
        }
        const all = loadHmctsCasesDb();
        const records = all
          .filter((c) => c.isPublic && c.subjectUserId === resolved.userId)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt }));
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ userId: resolved.userId, username: resolved.username, records }));
      });
    },
  };
}

function hmctsPublicRecordsRequestsPlugin(sessions: Map<string, RobloxSession>): Plugin {
  fs.mkdirSync(HMCTS_FOI_DIR, { recursive: true });
  return {
    name: "hmcts-public-records-requests-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/blume-content" || url.searchParams.get("type") !== "hmctsPublicRecordsRequests") {
          next();
          return;
        }
        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        if (!session) {
          res.statusCode = 401;
          res.end("You must be signed in.");
          return;
        }

        if (req.method === "GET") {
          if (!(await isHmctsEditor(session.userId))) {
            res.statusCode = 403;
            res.end("Public Records Requests are restricted to Ministry of Justice, Crown Prosecution Service, and Home Office.");
            return;
          }
          const requests = loadHmctsPrRequestsDb().sort((a, b) => b.createdAt - a.createdAt);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ requests }));
          return;
        }

        if (req.method === "POST") {
          const body = await readJsonBody(req);
          const action = body.action || "create";

          if (action === "reply") {
            if (!(await isHmctsEditor(session.userId))) {
              res.statusCode = 403;
              res.end("Only Ministry of Justice, Crown Prosecution Service, and Home Office can reply.");
              return;
            }
            try {
              const id = (body.id || "").toString().trim();
              const reply = (body.reply || "").toString().trim();
              if (!reply) {
                res.statusCode = 400;
                res.end("Reply can't be empty.");
                return;
              }
              if (reply.length > 6000) {
                res.statusCode = 400;
                res.end("Reply is too long (max 6000 characters).");
                return;
              }
              if (containsBlockedLanguage(reply)) {
                res.statusCode = 400;
                res.end(MODERATION_REJECTION_MESSAGE);
                return;
              }
              const all = loadHmctsPrRequestsDb();
              const idx = all.findIndex((r) => r.id === id);
              if (idx === -1) {
                res.statusCode = 404;
                res.end("Request not found.");
                return;
              }
              const target = all[idx];

              const rawAttachments: { name?: string; dataUrl?: string }[] = Array.isArray(body.attachments)
                ? body.attachments.slice(0, 5)
                : [];
              const replyAttachments: { name: string; url: string }[] = [];
              for (const f of rawAttachments) {
                const parsed = parseAnyDataUrlDev(f.dataUrl || "");
                if (!parsed) continue;
                if (parsed.buffer.length > HMCTS_CASE_MAX_ATTACHMENT_BYTES) {
                  res.statusCode = 400;
                  res.end("An attachment is too large (max 4MB each).");
                  return;
                }
                const fid = crypto.randomBytes(10).toString("hex");
                const safeName = (f.name || "file").toString().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
                const filename = `${fid}-${safeName}`;
                fs.writeFileSync(path.join(HMCTS_FOI_DIR, filename), parsed.buffer);
                replyAttachments.push({ name: safeName, url: `/hmcts-foi/uploads/${filename}` });
              }

              const updated: HmctsPublicRecordsRequest = {
                ...target,
                reply,
                replyAttachments,
                status: "replied",
                repliedByUsername: session.username,
                repliedAt: Date.now(),
              };
              all[idx] = updated;
              saveHmctsPrRequestsDb(all);

              const reference = `FOI${updated.foiYear}/${updated.foiNumber}`;
              sendSystemMessageDev(
                updated.requesterUsername,
                `eJudiciary has replied to your Public Records request regarding ${updated.subjectUsername} (Reference: ${reference}):\n\n${reply}`,
                replyAttachments
              );

              const notifyEntry: HmctsMessage = {
                id: crypto.randomBytes(12).toString("hex"),
                fromUserId: "system",
                fromUsername: "eJudiciary",
                departments: [],
                text: `${session.username} Replied to ${updated.requesterUsername}'s FOIA Request, ${reference}`,
                createdAt: Date.now(),
                kind: "publicRecordsRequest",
                requestId: updated.id,
              };
              const chatAllReply = loadHmctsMessagesDb();
              const chatNextReply = [...chatAllReply, notifyEntry].slice(-500);
              saveHmctsMessagesDb(chatNextReply);

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(updated));
              return;
            } catch (err) {
              res.statusCode = 500;
              res.end("Failed to send reply: " + (err as Error).message);
              return;
            }
          }

          const usernameQuery = (body.username || "").toString().trim();
          const requestedInfo = (body.requestedInfo || "").toString().trim();
          if (!usernameQuery || !requestedInfo) {
            res.statusCode = 400;
            res.end("Both a username and requested information are required.");
            return;
          }
          if (requestedInfo.length > 1000) {
            res.statusCode = 400;
            res.end("Requested information is too long (max 1000 characters).");
            return;
          }
          if (containsBlockedLanguage(requestedInfo)) {
            res.statusCode = 400;
            res.end(MODERATION_REJECTION_MESSAGE);
            return;
          }
          const resolved = await resolveRobloxUserId(usernameQuery);
          if (!resolved) {
            res.statusCode = 404;
            res.end(`Couldn't find a Roblox user matching "${usernameQuery}".`);
            return;
          }
          const requesterGroupIds = await getUserGroupIds(session.userId);
          const catalog = await getGroupCatalog();
          const requesterGroups = requesterGroupIds
            .filter((id) => id in catalog)
            .map((id) => ({ id, name: catalog[id].name, category: catalog[id].category }));

          const all = loadHmctsPrRequestsDb();
          const foiYear = new Date().getFullYear();
          const foiNumber = all.filter((r) => r.foiYear === foiYear).length + 1;

          const entry: HmctsPublicRecordsRequest = {
            id: crypto.randomBytes(12).toString("hex"),
            foiYear,
            foiNumber,
            subjectUsername: resolved.username,
            subjectUserId: resolved.userId,
            requestedInfo,
            requesterUserId: session.userId,
            requesterUsername: session.username,
            requesterGroups,
            status: "pending",
            createdAt: Date.now(),
          };
          all.push(entry);
          saveHmctsPrRequestsDb(all);

          const chatEntry: HmctsMessage = {
            id: crypto.randomBytes(12).toString("hex"),
            fromUserId: "system",
            fromUsername: "eJudiciary",
            departments: [],
            text: `New Public Records Request from ${session.username} regarding ${resolved.username} (FOI${foiYear}/${foiNumber}).`,
            createdAt: Date.now(),
            kind: "publicRecordsRequest",
            requestId: entry.id,
          };
          const chatAll = loadHmctsMessagesDb();
          const chatNext = [...chatAll, chatEntry].slice(-500);
          saveHmctsMessagesDb(chatNext);

          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(entry));
          return;
        }

        res.statusCode = 405;
        res.end("Method not allowed");
      });
    },
  };
}

function hmctsPersonnelPlugin(sessions: Map<string, RobloxSession>): Plugin {
  return {
    name: "hmcts-personnel-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== "/api/blume-content" || url.searchParams.get("type") !== "hmctsPersonnel") {
          next();
          return;
        }
        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        if (!session) {
          res.statusCode = 401;
          res.end("You must be signed in.");
          return;
        }
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }
        const scanCache = loadGroupScanDb();
        const mojGroupIds = getGroupIdsByNameMatch(["ministry of justice"]);
        const cpsGroupIds = getGroupIdsByNameMatch(["crown prosecution"]);
        const hoGroupIds = getGroupIdsByNameMatch(["home office"]);
        const deptSets: { label: string; set: Set<number> }[] = [
          { label: "Ministry of Justice", set: new Set(mojGroupIds) },
          { label: "Crown Prosecution Service", set: new Set(cpsGroupIds) },
          { label: "Home Office", set: new Set(hoGroupIds) },
        ];
        const personnel = scanCache
          .filter((m) => deptSets.some((d) => m.groupIds.some((id) => d.set.has(id))))
          .map((m) => ({
            userId: m.userId,
            username: m.username,
            avatarUrl: m.avatarUrl,
            departments: deptSets.filter((d) => m.groupIds.some((id) => d.set.has(id))).map((d) => d.label),
          }))
          .sort((a, b) => a.username.localeCompare(b.username));
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ personnel }));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (env.ROBLOX_SCAN_COOKIE) process.env.ROBLOX_SCAN_COOKIE = env.ROBLOX_SCAN_COOKIE;
  if (env.BLUME_INGEST_KEY) process.env.BLUME_INGEST_KEY = env.BLUME_INGEST_KEY;
  const sessions = new Map<string, RobloxSession>();
  return {
    plugins: [
      react(),
      robloxOAuthPlugin(env, sessions),
      wallpapersPlugin(sessions),
      postsPlugin(sessions),
      messagesPlugin(sessions),
      royalTweetsPlugin(sessions),
      blumeReportsPlugin(sessions),
      blumeBlogPlugin(sessions),
      adminPlugin(sessions),
      blumeSearchPlugin(sessions),
      verifilePlugin(sessions),
      thamesWaterPlugin(sessions),
      hmrcPlugin(sessions),
      hmctsPlugin(sessions),
      hmctsChatPlugin(sessions),
      hmctsCasesPlugin(sessions),
      hmctsLrrPlugin(sessions),
      hmctsPublicRecordsPlugin(sessions),
      hmctsPublicRecordsRequestsPlugin(sessions),
      hmctsPersonnelPlugin(sessions),
    ],
  };
});
