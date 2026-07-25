import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookies, setCookie } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import { isPlatformAdmin } from "../../lib/roblox.js";
import { isBanned } from "../../lib/bans.js";
import { kv } from "../../lib/kv.js";

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
    res.status(200).json(null);
    return;
  }

  // Enforced here (polled periodically by the client) so a ban takes effect
  // for someone already using the site, not just on their next login.
  if (await isBanned(session.userId)) {
    setCookie(res, "wb_session", "", { maxAge: 0 });
    res.status(200).json({ banned: true });
    return;
  }

  // Piggybacks the "did I just get messaged?" check on this already-polled
  // endpoint instead of adding a dedicated one, since Vercel Hobby caps
  // serverless functions at 12.
  const messages = (await kv.get<MessageEntry[]>("messages")) || [];
  const myMessages = messages.filter(
    (m) => m.toUsername.toLowerCase() === session.username.toLowerCase()
  );
  const latest = myMessages.sort((a, b) => b.createdAt - a.createdAt)[0] || null;

  res.status(200).json({
    ...session,
    isAdmin: isPlatformAdmin(session.userId),
    adminMode: !!session.adminMode,
    latestIncomingMessage: latest
      ? { id: latest.id, fromUsername: latest.fromUsername, createdAt: latest.createdAt }
      : null,
  });
}
