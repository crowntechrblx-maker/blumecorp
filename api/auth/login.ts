import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { setCookie } from "../lib/cookies.js";

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const CLIENT_ID = process.env.ROBLOX_CLIENT_ID;
  const REDIRECT_URI =
    process.env.ROBLOX_REDIRECT_URI || `https://${req.headers.host}/api/auth/callback`;

  if (!CLIENT_ID) {
    res.status(500).send("Missing ROBLOX_CLIENT_ID environment variable in your Vercel project.");
    return;
  }

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  // Serverless functions don't share memory between requests, so the PKCE
  // verifier and state are stashed in short-lived cookies instead of a
  // server-side map, and read back in the callback.
  setCookie(res, "wb_oauth_verifier", verifier, { maxAge: 600 });
  setCookie(res, "wb_oauth_state", state, { maxAge: 600 });

  const authUrl = new URL("https://apis.roblox.com/oauth/v1/authorize");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", "openid profile");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  res.writeHead(302, { Location: authUrl.toString() });
  res.end();
}
