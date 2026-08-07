import { kv } from "./kv.js";
import crypto from "node:crypto";

export const SYSTEM_SENDER_USERNAME = "eJudiciary";
export const SYSTEM_SENDER_AVATAR = "/icons/royal-coat-of-arms.png";
const SYSTEM_SENDER_USER_ID = "system-ejudiciary";

interface SystemKnownUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
  lastSeen: number;
}

interface SystemMessageEntry {
  id: string;
  conversationKey: string;
  fromUsername: string;
  toUsername: string;
  text: string;
  createdAt: number;
}

function conversationKey(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join("::");
}

// Pushes a DM into the shared "messages" KV list as if sent by the platform
// itself, and keeps a synthetic "eJudiciary" entry fresh in the known-users
// roster so the recipient sees it in their Messages sidebar.
export async function sendSystemMessage(toUsername: string, text: string): Promise<void> {
  const entry: SystemMessageEntry = {
    id: crypto.randomBytes(12).toString("hex"),
    conversationKey: conversationKey(SYSTEM_SENDER_USERNAME, toUsername),
    fromUsername: SYSTEM_SENDER_USERNAME,
    toUsername,
    text,
    createdAt: Date.now(),
  };
  const all = (await kv.get<SystemMessageEntry[]>("messages")) || [];
  all.push(entry);
  await kv.set("messages", all);

  const knownUsers = (await kv.get<SystemKnownUser[]>("users")) || [];
  const idx = knownUsers.findIndex((u) => u.username.toLowerCase() === SYSTEM_SENDER_USERNAME.toLowerCase());
  const record: SystemKnownUser = {
    userId: SYSTEM_SENDER_USER_ID,
    username: SYSTEM_SENDER_USERNAME,
    avatarUrl: SYSTEM_SENDER_AVATAR,
    lastSeen: Date.now(),
  };
  if (idx >= 0) knownUsers[idx] = record;
  else knownUsers.push(record);
  await kv.set("users", knownUsers);
}
