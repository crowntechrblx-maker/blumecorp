import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookies } from "../lib/cookies";
import { decodeSession } from "../lib/session";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);
  res.status(200).json(session);
}
