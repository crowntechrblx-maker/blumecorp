import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "../../lib/kv.js";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);
  if (!session) {
    res.status(401).send("You must be signed in.");
    return;
  }

  const search = ((req.query.search as string) || "").trim().toLowerCase();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // Track the most recent message exchanged with each person so the sidebar
  // can surface whoever you're actively talking to at the top, like a normal
  // inbox — not just whoever happened to sign in most recently.
  const messages = (await kv.get<MessageEntry[]>("messages")) || [];
  const lastMessageAt = new Map<string, number>();
  const me = session.username.toLowerCase();
  for (const m of messages) {
    const from = m.fromUsername.toLowerCase();
    const to = m.toUsername.toLowerCase();
    if (from !== me && to !== me) continue;
    const other = from === me ? to : from;
    const existing = lastMessageAt.get(other) || 0;
    if (m.createdAt > existing) lastMessageAt.set(other, m.createdAt);
  }

  const users = ((await kv.get<KnownUser[]>("users")) || [])
    .filter((u) => u.username.toLowerCase() !== me)
    .filter((u) => u.lastSeen >= sevenDaysAgo)
    .sort((a, b) => {
      const aRecent = lastMessageAt.get(a.username.toLowerCase()) || 0;
      const bRecent = lastMessageAt.get(b.username.toLowerCase()) || 0;
      if (aRecent !== bRecent) return bRecent - aRecent;
      return b.lastSeen - a.lastSeen;
    });
  const filtered = search ? users.filter((u) => u.username.toLowerCase().includes(search)) : users;

  res
    .status(200)
    .json(
      filtered
        .slice(0, 100)
        .map((u) => ({ username: u.username, avatarUrl: u.avatarUrl, lastSeen: u.lastSeen }))
    );
}
