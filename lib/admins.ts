import { kv } from "./kv.js";

export const ROOT_ADMIN_USERNAMES = ["bananapoopooo", "pl_aced"];

export function isRootAdmin(username: string): boolean {
  return ROOT_ADMIN_USERNAMES.some((u) => u.toLowerCase() === username.toLowerCase());
}

export interface SpecialAdminEntry {
  userId: string;
  username: string;
  addedByUsername: string;
  createdAt: number;
}

export async function getSpecialAdmins(): Promise<SpecialAdminEntry[]> {
  return (await kv.get<SpecialAdminEntry[]>("specialAdmins")) || [];
}

export async function isSpecialAdmin(userId: string): Promise<boolean> {
  const admins = await getSpecialAdmins();
  return admins.some((a) => a.userId === userId);
}

export async function addSpecialAdmin(entry: SpecialAdminEntry): Promise<void> {
  const admins = await getSpecialAdmins();
  if (admins.some((a) => a.userId === entry.userId)) return;
  admins.push(entry);
  await kv.set("specialAdmins", admins);
}

export async function removeSpecialAdmin(userId: string): Promise<void> {
  const admins = await getSpecialAdmins();
  const next = admins.filter((a) => a.userId !== userId);
  await kv.set("specialAdmins", next);
}

export async function isPlatformAdmin(userId: string, username: string): Promise<boolean> {
  if (isRootAdmin(username)) return true;
  return isSpecialAdmin(userId);
}
