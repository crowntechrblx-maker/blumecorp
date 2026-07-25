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
          res.end(JSON.stringify(session || null));
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
          const payload = posts.map((p) => ({
            id: p.id,
            authorUsername: p.authorUsername,
            authorAvatarUrl: p.authorAvatarUrl ?? null,
            text: p.text,
            imageUrl: p.imageFilename ? `/posts/uploads/${p.imageFilename}` : null,
            createdAt: p.createdAt,
            isMine: session ? p.authorId === session.userId : false,
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
              })
            );
          } catch (err) {
            res.statusCode = 500;
            res.end("Post failed: " + (err as Error).message);
          }
          return;
        }

        const deleteMatch = /^\/api\/posts\/([a-zA-Z0-9]+)$/.exec(url.pathname);
        if (deleteMatch && req.method === "DELETE") {
          if (!session) {
            res.statusCode = 401;
            res.end("You must be signed in to delete a post.");
            return;
          }
          const postId = deleteMatch[1];
          const entries = loadPostsDb();
          const index = entries.findIndex((p) => p.id === postId);
          if (index === -1) {
            res.statusCode = 404;
            res.end("Post not found.");
            return;
          }
          const post = entries[index];
          if (post.authorId !== session.userId) {
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
          const users = loadUsersDb().filter(
            (u) => u.username.toLowerCase() !== session.username.toLowerCase()
          );
          const filtered = search
            ? users.filter((u) => u.username.toLowerCase().includes(search))
            : users;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify(
              filtered.slice(0, 20).map((u) => ({ username: u.username, avatarUrl: u.avatarUrl }))
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
            ? await isRobloxGroupMember(session.userId, ROYAL_FAMILY_GROUP_ID)
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
          if (!isMember) {
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
    ],
  };
});
