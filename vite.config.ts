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
}

interface KnownUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
  lastSeen: number;
}

interface MessageEntry {
  id: string;
  conversationKey: string;
  fromUsername: string;
  toUsername: string;
  text: string;
  createdAt: number;
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

// The "PS Royal Households of the United Kingdom" Roblox community.
// https://www.roblox.com/communities/35167585/PS-Royal-Households-of-the-United-Kingdom
const ROYAL_FAMILY_GROUP_ID = 35167585;

async function isRobloxGroupMember(userId: string, groupId: number): Promise<boolean> {
  try {
    const res = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
    if (!res.ok) return false;
    const data = (await res.json()) as { data?: { group?: { id?: number } }[] };
    return (data.data || []).some((entry) => entry.group?.id === groupId);
  } catch {
    return false;
  }
}

interface BlumeReportEntry {
  id: string;
  title: string;
  body: string;
  authorUsername: string;
  createdAt: number;
}

// Blume clearance: any of these Roblox groups, or one of the three
// explicitly-allowed user IDs, unlocks the Blume dashboard.
const BLUME_GROUP_IDS = [154853936, 142915989, 685466511, 187507831];
const BLUME_ALLOWED_USER_IDS = ["181869610", "4963562759", "2322187718"];

async function isBlumeAuthorized(userId: string): Promise<boolean> {
  if (BLUME_ALLOWED_USER_IDS.includes(userId)) return true;
  const checks = await Promise.all(
    BLUME_GROUP_IDS.map((groupId) => isRobloxGroupMember(userId, groupId))
  );
  return checks.some(Boolean);
}

function isBlumeSuperUser(userId: string): boolean {
  return BLUME_ALLOWED_USER_IDS.includes(userId);
}

// Site-wide platform admins: same three people, but this grants access to
// the Settings app, the audit log, banning, and Admin Mode across the whole
// of Westbridge OS (not just Blume).
const PLATFORM_ADMIN_USER_IDS = ["181869610", "4963562759", "2322187718"];

function isPlatformAdmin(userId: string): boolean {
  return PLATFORM_ADMIN_USER_IDS.includes(userId);
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

// Blocks profanity, slurs, and other derogatory language from any
// user-submitted free text. Word-list match with common leetspeak
// substitutions normalized first.
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
  const entry: KnownUser = { ...user, lastSeen: Date.now() };
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

function robloxOAuthPlugin(env: Record<string, string>, sessions: Map<string, RobloxSession>): Plugin {
  const CLIENT_ID = env.ROBLOX_CLIENT_ID;
  const CLIENT_SECRET = env.ROBLOX_CLIENT_SECRET;
  const REDIRECT_URI = env.ROBLOX_REDIRECT_URI || "http://localhost:5173/api/auth/callback";

  // In-memory stores. Fine for local dev; resets whenever the dev server restarts.
  const pendingLogins = new Map<string, { verifier: string }>();

  return {
    name: "roblox-oauth",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");

        if (url.pathname === "/api/auth/login") {
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

            if (isBanned(profile.sub)) {
              res.statusCode = 403;
              res.end("This Roblox account has been banned from Westbridge OS.");
              return;
            }

            const avatarUrl = await getRobloxAvatarUrl(profile.sub);

            const sessionId = b64url(crypto.randomBytes(24));
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
          const session = sessions.get(cookies.wb_session);
          res.setHeader("Content-Type", "application/json");
          if (!session) {
            res.end(JSON.stringify(null));
            return;
          }
          // Enforced here (polled periodically by the client) so a ban takes
          // effect for someone already using the site, not just on next login.
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
              isAdmin: isPlatformAdmin(session.userId),
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
              })
            );
          } catch (err) {
            res.statusCode = 500;
            res.end("Upload failed: " + (err as Error).message);
          }
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
          let posts = loadPostsDb().sort((a, b) => b.createdAt - a.createdAt);
          if (search) {
            posts = posts.filter((p) => p.authorUsername.toLowerCase().includes(search));
          }
          const isAdminOverride = !!(session && isPlatformAdmin(session.userId));
          const payload = posts.map((p) => ({
            id: p.id,
            authorUsername: p.authorUsername,
            authorAvatarUrl: p.authorAvatarUrl ?? null,
            text: p.text,
            imageUrl: p.imageFilename ? `/posts/uploads/${p.imageFilename}` : null,
            createdAt: p.createdAt,
            isMine: session ? p.authorId === session.userId : false,
            canDelete: session ? p.authorId === session.userId || isAdminOverride : false,
          }));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
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
          const isAdminOverride = isPlatformAdmin(session.userId);
          if (post.authorId !== session.userId && !isAdminOverride) {
            res.statusCode = 403;
            res.end("You can only delete your own posts.");
            return;
          }
          if (post.imageFilename) {
            const imagePath = path.join(POSTS_DIR, post.imageFilename);
            fs.rm(imagePath, { force: true }, () => {});
          }
          entries.splice(index, 1);
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
          const withUser = (url.searchParams.get("with") || "").trim();
          if (!withUser) {
            res.statusCode = 400;
            res.end("Missing 'with' query parameter.");
            return;
          }
          const key = conversationKey(session.username, withUser);
          const messages = loadMessagesDb()
            .filter((m) => m.conversationKey === key)
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
          if (!isPlatformAdmin(session.userId)) {
            res.statusCode = 403;
            res.end("Only an admin can delete messages.");
            return;
          }
          entries.splice(index, 1);
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
            ? isPlatformAdmin(session.userId) ||
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
          if (!isPlatformAdmin(session.userId) && !isMember) {
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
        if (url.pathname !== "/api/blume-reports") {
          next();
          return;
        }

        const cookies = parseCookies(req);
        const session = sessions.get(cookies.wb_session);
        const canAccess = session ? await isBlumeAuthorized(session.userId) : false;

        if (req.method === "GET") {
          if (!canAccess) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ reports: [], canAccess: false }));
            return;
          }
          const reports = loadBlumeReportsDb().sort((a, b) => b.createdAt - a.createdAt);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ reports, canAccess: true }));
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
            const entry: BlumeReportEntry = {
              id: crypto.randomBytes(12).toString("hex"),
              title,
              body: content,
              authorUsername: session.username,
              createdAt: Date.now(),
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
        if (url.pathname !== "/api/blume-blog") {
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
        if (!isPlatformAdmin(session.userId)) {
          res.statusCode = 403;
          res.end("You do not have admin access.");
          return;
        }

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
            const isProtected = isPlatformAdmin(target.userId);
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
              auditLog: getAuditLog(300),
              bans: loadBansDb(),
              messages: allMessages,
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
                if (isPlatformAdmin(target.userId)) {
                  res.statusCode = 403;
                  res.end("Platform admins can't be banned.");
                  return;
                }
                addBan({
                  userId: target.userId,
                  username: target.username,
                  bannedByUsername: session.username,
                  createdAt: Date.now(),
                });
              } else {
                removeBan(target.userId);
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ bans: loadBansDb() }));
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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
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
    ],
  };
});
