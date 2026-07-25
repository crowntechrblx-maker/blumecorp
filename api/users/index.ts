import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "../lib/kv.js";
import { parseCookies } from "../lib/cookies.js";
import { decodeSession } from "../lib/session.js";

interface KnownUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
  lastSeen: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);
  if (!session) {
    res.status(401).send("You must be signed in.");
    return;
  }

  const search = ((req.query.search as string) || "").trim().toLowerCase();
  const users = ((await kv.get<KnownUser[]>("users")) || []).filter(
    (u) => u.username.toLowerCase() !== session.username.toLowerCase()
  );
  const filtered = search ? users.filter((u) => u.username.toLowerCase().includes(search)) : users;

  res
    .status(200)
    .json(filtered.slice(0, 20).map((u) => ({ username: u.username, avatarUrl: u.avatarUrl })));
}
