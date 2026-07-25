import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookies, setCookie } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import { isPlatformAdmin } from "../../lib/roblox.js";
import { isBanned } from "../../lib/bans.js";

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

  res.status(200).json({
    ...session,
    isAdmin: isPlatformAdmin(session.userId),
    adminMode: !!session.adminMode,
  });
}
