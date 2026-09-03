import { kv } from "./kv.js";

export interface DiscordLink {
  discordUserId: string;
  robloxUserId: string;
  robloxUsername: string;
  robloxDisplayName: string;
  linkedAt: number;
}

const LINKS_KEY = "discord-roblox-links";

export async function getDiscordLinks(): Promise<DiscordLink[]> {
  return (await kv.get<DiscordLink[]>(LINKS_KEY)) || [];
}

export async function getDiscordLink(
  discordUserId: string
): Promise<DiscordLink | null> {
  const links = await getDiscordLinks();

  return (
    links.find((link) => link.discordUserId === discordUserId) || null
  );
}

export async function saveDiscordLink(
  link: DiscordLink
): Promise<void> {
  const links = await getDiscordLinks();

  const filtered = links.filter(
    (item) =>
      item.discordUserId !== link.discordUserId &&
      item.robloxUserId !== link.robloxUserId
  );

  filtered.push(link);

  await kv.set(LINKS_KEY, filtered);
}

export async function removeDiscordLink(
  discordUserId: string
): Promise<void> {
  const links = await getDiscordLinks();

  await kv.set(
    LINKS_KEY,
    links.filter(
      (link) => link.discordUserId !== discordUserId
    )
  );
}