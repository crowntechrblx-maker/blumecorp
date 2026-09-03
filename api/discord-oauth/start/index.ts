import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kv } from "../../../lib/kv.js";

function b64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const secret = req.query.secret;
  const discordUserId = req.query.discord_user_id;

  if (
    typeof secret !== "string" ||
    typeof discordUserId !== "string"
  ) {
    res.status(400).send("Missing OAuth parameters.");
    return;
  }

  if (secret !== process.env.DISCORD_OAUTH_SECRET) {
    res.status(403).send("Invalid request.");
    return;
  }

  const clientId = process.env.DISCORD_ROBLOX_CLIENT_ID;
  const redirectUri = process.env.DISCORD_ROBLOX_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    res.status(500).send("Discord OAuth is not configured.");
    return;
  }

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(
    crypto.createHash("sha256").update(verifier).digest()
  );

  const state = b64url(crypto.randomBytes(32));

  await kv.set(
    `discord-oauth-state:${state}`,
    {
      discordUserId,
      verifier,
      expiresAt: Date.now() + 10 * 60 * 1000,
    },
    { ex: 600 }
  );

  const authUrl = new URL(
    "https://apis.roblox.com/oauth/v1/authorize"
  );

  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "openid profile");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  res.writeHead(302, {
    Location: authUrl.toString(),
  });

  res.end();
}