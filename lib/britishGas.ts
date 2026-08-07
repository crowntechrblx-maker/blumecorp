import { kv } from "./kv.js";

// zackmendad is a permanent British Gas admin (mirrors ROOT_ADMIN_USERNAMES in lib/admins.ts).
export const BRITISH_GAS_ROOT_USERNAMES = ["zackmendad"];

export function isBritishGasRootAdmin(username: string): boolean {
  return BRITISH_GAS_ROOT_USERNAMES.some((u) => u.toLowerCase() === username.toLowerCase());
}

export interface BritishGasAdminEntry {
  userId: string;
  username: string;
  addedByUsername: string;
  createdAt: number;
}

export async function getBritishGasAdmins(): Promise<BritishGasAdminEntry[]> {
  return (await kv.get<BritishGasAdminEntry[]>("britishGasAdmins")) || [];
}

export async function isBritishGasAdmin(userId: string, username: string): Promise<boolean> {
  if (isBritishGasRootAdmin(username)) return true;
  const admins = await getBritishGasAdmins();
  return admins.some((a) => a.userId === userId);
}

export async function addBritishGasAdmin(entry: BritishGasAdminEntry): Promise<void> {
  const admins = await getBritishGasAdmins();
  if (admins.some((a) => a.userId === entry.userId)) return;
  admins.push(entry);
  await kv.set("britishGasAdmins", admins);
}

export async function removeBritishGasAdmin(userId: string): Promise<void> {
  const admins = await getBritishGasAdmins();
  await kv.set("britishGasAdmins", admins.filter((a) => a.userId !== userId));
}
