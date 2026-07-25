import { kv } from "./kv.js";

export interface BanEntry {
  userId: string;
  username: string;
  bannedByUsername: string;
  createdAt: number;
}

export async function getBans(): Promise<BanEntry[]> {
  return (await kv.get<BanEntry[]>("bannedUsers")) || [];
}

export async function isBanned(userId: string): Promise<boolean> {
  const bans = await getBans();
  return bans.some((b) => b.userId === userId);
}

export async function addBan(entry: BanEntry): Promise<void> {
  const bans = await getBans();
  if (bans.some((b) => b.userId === entry.userId)) return;
  bans.push(entry);
  await kv.set("bannedUsers", bans);
}

export async function removeBan(userId: string): Promise<void> {
  const bans = await getBans();
  const next = bans.filter((b) => b.userId !== userId);
  await kv.set("bannedUsers", next);
}
