import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setCookie } from "../lib/cookies.js";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  setCookie(res, "wb_session", "", { maxAge: 0 });
  res.writeHead(302, { Location: "/" });
  res.end();
}
