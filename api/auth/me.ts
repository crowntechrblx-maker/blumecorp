import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookies, setCookie } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import { isBanned } from "../../lib/bans.js";
import { isPlatformAdmin } from "../../lib/admins.js";
import { checkGatePassword, isGateUnlocked, getGateToken, GATE_COOKIE_NAME } from "../../lib/gate.js";
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

  if (req.method === "POST") {
    const body = req.body as { password?: string };
    const password = (body.password || "").toString();
    if (!checkGatePassword(password)) {
      res.status(401).send("Incorrect password.");
      return;
    }
    setCookie(res, GATE_COOKIE_NAME, getGateToken(), { maxAge: 60 * 60 * 24 * 30 });
    res.status(200).json({ ok: true });
    return;
  }

  if (!isGateUnlocked(cookies[GATE_COOKIE_NAME])) {
    res.status(200).json({ gateRequired: true });
    return;
  }

  const session = decodeSession(cookies.wb_session);

  if (!session) {
    res.status(200).json(null);
    return;
  }

  if (await isBanned(session.userId)) {
    setCookie(res, "wb_session", "", { maxAge: 0 });
    res.status(200).json({ banned: true });
    return;
  }

  const messages = (await kv.get<MessageEntry[]>("messages")) || [];
  const myMessages = messages.filter(
    (m) => m.toUsername.toLowerCase() === session.username.toLowerCase()
  );
  const latest = myMessages.sort((a, b) => b.createdAt - a.createdAt)[0] || null;

  res.status(200).json({
    ...session,
    isAdmin: await isPlatformAdmin(session.userId, session.username),
    latestIncomingMessage: latest
      ? { id: latest.id, fromUsername: latest.fromUsername, createdAt: latest.createdAt }
      : null,
  });
}
