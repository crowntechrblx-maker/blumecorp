import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookies, setCookie } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import { markKnownUserLoggedOut } from "../../lib/known-users.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);
  if (session) {
    await markKnownUserLoggedOut(session.userId);
  }
  setCookie(res, "wb_session", "", { maxAge: 0 });
  res.writeHead(302, { Location: "/" });
  res.end();
}
