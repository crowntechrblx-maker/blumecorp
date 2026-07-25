import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookies, setCookie } from "../lib/cookies.js";
import { encodeSession } from "../lib/session.js";
import { getRobloxAvatarUrl } from "../lib/roblox.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const CLIENT_ID = process.env.ROBLOX_CLIENT_ID || "";
  const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET || "";
  const REDIRECT_URI =
    process.env.ROBLOX_REDIRECT_URI || `https://${req.headers.host}/api/auth/callback`;

  const url = new URL(req.url || "", `https://${req.headers.host}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(req);

  if (!code || !state || state !== cookies.wb_oauth_state || !cookies.wb_oauth_verifier) {
    res.status(400).send("Invalid or expired OAuth callback. Go back and try signing in again.");
    return;
  }

  try {
    const tokenRes = await fetch("https://apis.roblox.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: cookies.wb_oauth_verifier,
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

    const session = {
      userId: profile.sub,
      username: profile.preferred_username,
      displayName: profile.nickname || profile.preferred_username,
      avatarUrl,
    };

    setCookie(res, "wb_session", encodeSession(session), { maxAge: 60 * 60 * 24 * 30 });
    setCookie(res, "wb_oauth_verifier", "", { maxAge: 0 });
    setCookie(res, "wb_oauth_state", "", { maxAge: 0 });

    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (err) {
    res.status(500).send("OAuth exchange failed: " + (err as Error).message);
  }
}
