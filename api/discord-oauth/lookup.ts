import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDiscordLink } from "../../lib/discord-links.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({
      error: "Method not allowed",
    });
    return;
  }

  const secret = req.headers["x-discord-oauth-secret"];

  if (
    typeof secret !== "string" ||
    secret !== process.env.DISCORD_OAUTH_SECRET
  ) {
    res.status(403).json({
      error: "Invalid request.",
    });
    return;
  }

  const discordUserId = req.body?.discordUserId;

  if (
    typeof discordUserId !== "string" ||
    !discordUserId
  ) {
    res.status(400).json({
      error: "Missing discordUserId.",
    });
    return;
  }

  const link = await getDiscordLink(discordUserId);

  res.status(200).json({
    linked: !!link,
    link,
  });
}