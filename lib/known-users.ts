import { kv } from "./kv.js";

export interface KnownUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
  lastSeen: number;
}

export async function getKnownUsers(): Promise<KnownUser[]> {
  return (await kv.get<KnownUser[]>("users")) || [];
}

export async function findKnownUser(query: string): Promise<KnownUser | null> {
  const raw = query.trim();
  if (!raw) return null;
  const users = await getKnownUsers();
  return (
    users.find((u) => u.userId === raw) ||
    users.find((u) => u.username.toLowerCase() === raw.toLowerCase()) ||
    null
  );
}
