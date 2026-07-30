import { kv } from "./kv.js";

export interface KnownUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
  lastSeen: number;
  loggedOut?: boolean;
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

export async function upsertKnownUser(user: {
  userId: string;
  username: string;
  avatarUrl: string | null;
}): Promise<void> {
  const users = await getKnownUsers();
  const index = users.findIndex((u) => u.userId === user.userId);
  const entry: KnownUser = { ...user, lastSeen: Date.now(), loggedOut: false };
  if (index === -1) {
    users.push(entry);
  } else {
    users[index] = entry;
  }
  await kv.set("users", users);
}

export async function markKnownUserLoggedOut(userId: string): Promise<void> {
  const users = await getKnownUsers();
  const index = users.findIndex((u) => u.userId === userId);
  if (index === -1) return;
  users[index] = { ...users[index], loggedOut: true };
  await kv.set("users", users);
}

export async function getLoggedInUsernames(): Promise<string[]> {
  const users = await getKnownUsers();
  return users
    .filter((u) => !u.loggedOut)
    .map((u) => u.username)
    .sort((a, b) => a.localeCompare(b));
}
