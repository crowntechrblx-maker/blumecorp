import { kv } from "./kv.js";
import { isBlumeSuperUser } from "./roblox.js";

export interface RedlineWhitelistEntry {
  userId: string;
  username: string;
  addedByUsername: string;
  addedAt: number;
}

export async function getRedlineWhitelist(): Promise<RedlineWhitelistEntry[]> {
  return (await kv.get<RedlineWhitelistEntry[]>("redlineWhitelist")) || [];
}

export async function isRedlineAuthorized(userId: string): Promise<boolean> {
  if (isBlumeSuperUser(userId)) return true;
  const list = await getRedlineWhitelist();
  return list.some((w) => w.userId === userId);
}
