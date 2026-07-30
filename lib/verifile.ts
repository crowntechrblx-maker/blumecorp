import { kv } from "./kv.js";
import { isBlumeSuperUser } from "./roblox.js";

export interface VerifileWhitelistEntry {
  userId: string;
  username: string;
  addedByUsername: string;
  addedAt: number;
}

export async function getVerifileWhitelist(): Promise<VerifileWhitelistEntry[]> {
  return (await kv.get<VerifileWhitelistEntry[]>("verifileWhitelist")) || [];
}

export async function isVerifileAuthorized(userId: string): Promise<boolean> {
  if (isBlumeSuperUser(userId)) return true;
  const list = await getVerifileWhitelist();
  return list.some((w) => w.userId === userId);
}
