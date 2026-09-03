import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "../../../lib/kv.js";
import { saveDiscordLink } from "../../../lib/discord-links.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const url = new URL(
    req.url || "",
    `https://${req.headers.host}`
  );

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    res.status(400).send(`Roblox OAuth error: ${error}`);
    return;
  }

  if (!code || !state) {
    res.status(400).send("Invalid OAuth callback.");
    return;
  }

  const pending = await kv.get<{
    discordUserId: string;
    verifier: string;
    expiresAt: number;
  }>(`discord-oauth-state:${state}`);

  if (!pending) {
    res.status(400).send(
      "This OAuth session is invalid or has expired."
    );
    return;
  }

  await kv.del(`discord-oauth-state:${state}`);

  if (pending.expiresAt < Date.now()) {
    res.status(400).send("This OAuth session has expired.");
    return;
  }

  const clientId = process.env.DISCORD_ROBLOX_CLIENT_ID;
  const clientSecret = process.env.DISCORD_ROBLOX_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_ROBLOX_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    res.status(500).send("Discord OAuth is not configured.");
    return;
  }

  try {
    const tokenRes = await fetch(
      "https://apis.roblox.com/oauth/v1/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: pending.verifier,
        }),
      }
    );

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
    };

    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error("Failed to exchange OAuth code.");
    }

    const userRes = await fetch(
      "https://apis.roblox.com/oauth/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    const profile = (await userRes.json()) as {
      sub?: string;
      preferred_username?: string;
      nickname?: string;
    };

    if (!userRes.ok || !profile.sub || !profile.preferred_username) {
      throw new Error("Could not retrieve Roblox account.");
    }

    await saveDiscordLink({
      discordUserId: pending.discordUserId,
      robloxUserId: profile.sub,
      robloxUsername: profile.preferred_username,
      robloxDisplayName:
        profile.nickname || profile.preferred_username,
      linkedAt: Date.now(),
    });

    res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Roblox Account Linked</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #111;
              color: white;
              font-family: Arial, sans-serif;
            }

            .box {
              text-align: center;
              padding: 40px;
              max-width: 500px;
            }

            h1 {
              margin-bottom: 10px;
            }

            p {
              color: #aaa;
            }
          </style>
        </head>

        <body>
          <div class="box">
            <h1>✓ Roblox Account Linked</h1>
            <p>
              Your Roblox account
              <strong>${profile.preferred_username}</strong>
              has been successfully linked to Discord.
            </p>
            <p>You can now return to Discord.</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send("OAuth exchange failed.");
  }
}