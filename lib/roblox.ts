const ROBLOX_SCAN_COOKIE = process.env.ROBLOX_SCAN_COOKIE || "";

export function robloxHeaders(): Record<string, string> {
  return ROBLOX_SCAN_COOKIE ? { Cookie: `.ROBLOSECURITY=${ROBLOX_SCAN_COOKIE}` } : {};
}

const avatarCache = new Map<string, string | null>();

export async function getRobloxAvatarUrl(userId: string): Promise<string | null> {
  if (avatarCache.has(userId)) return avatarCache.get(userId)!;
  try {
    const res = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`,
      { headers: robloxHeaders() }
    );
    const data = (await res.json()) as { data?: { imageUrl?: string }[] };
    const url = data.data?.[0]?.imageUrl || null;
    avatarCache.set(userId, url);
    return url;
  } catch {
    return null;
  }
}

export const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

export const ROYAL_FAMILY_GROUP_ID = 35167585;

export async function isRobloxGroupMember(userId: string, groupId: number): Promise<boolean> {
  try {
    const res = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { data?: { group?: { id?: number } }[] };
    return (data.data || []).some((entry) => entry.group?.id === groupId);
  } catch {
    return false;
  }
}

export function extractGroupId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = /(?:communities|groups)\/(\d+)/i.exec(trimmed);
  if (urlMatch) return urlMatch[1];
  const digitsOnly = /^\d+$/.exec(trimmed);
  if (digitsOnly) return trimmed;
  return trimmed;
}

export async function getUserGroupIds(userId: string): Promise<number[]> {
  try {
    const res = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { group?: { id?: number } }[] };
    return (data.data || [])
      .map((entry) => entry.group?.id)
      .filter((id): id is number => typeof id === "number");
  } catch {
    return [];
  }
}

export async function resolveRobloxUserId(
  query: string
): Promise<{ userId: string; username: string } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    try {
      const res = await fetch(`https://users.roblox.com/v1/users/${trimmed}`, {
        headers: robloxHeaders(),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { id?: number; name?: string };
      if (!data.id) return null;
      return { userId: String(data.id), username: data.name || trimmed };
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...robloxHeaders() },
      body: JSON.stringify({ usernames: [trimmed], excludeBannedUsers: false }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { id?: number; name?: string }[] };
    const match = data.data?.[0];
    if (!match?.id) return null;
    return { userId: String(match.id), username: match.name || trimmed };
  } catch {
    return null;
  }
}

export async function getRobloxFriends(
  userId: string
): Promise<{ userId: string; username: string }[]> {
  try {
    const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { id?: number; name?: string }[] };
    return (data.data || [])
      .filter((f): f is { id: number; name: string } => !!f.id && !!f.name)
      .map((f) => ({ userId: String(f.id), username: f.name }));
  } catch {
    return [];
  }
}

export const BLUME_GROUP_IDS = [
  154853936, // MI5
  142915989, // National Crime Agency
  685466511, // MI6
  187507831, // CIA
  315987361, // ROCU
  496716538, // U.S. Marshals Service
];
export const BLUME_ALLOWED_USER_IDS = ["181869610", "4963562759", "2322187718", "11140342881"];

export async function isBlumeAuthorized(userId: string): Promise<boolean> {
  if (BLUME_ALLOWED_USER_IDS.includes(userId)) return true;
  const checks = await Promise.all(
    BLUME_GROUP_IDS.map((groupId) => isRobloxGroupMember(userId, groupId))
  );
  return checks.some(Boolean);
}

export function isBlumeSuperUser(userId: string): boolean {
  return BLUME_ALLOWED_USER_IDS.includes(userId);
}

export const PLATFORM_ADMIN_USER_IDS = ["181869610", "4963562759", "2322187718"];

export function isPlatformAdmin(userId: string): boolean {
  return PLATFORM_ADMIN_USER_IDS.includes(userId);
}

export const ALL_KNOWN_GROUPS: { id: number; label: string }[] = [
  { id: ROYAL_FAMILY_GROUP_ID, label: "PS Royal Households of the United Kingdom" },
  ...BLUME_GROUP_IDS.map((id) => ({ id, label: `Blume-authorized group ${id}` })),
];

const groupNameCache = new Map<number, string | null>();

export async function getRobloxGroupName(groupId: number): Promise<string | null> {
  if (groupNameCache.has(groupId)) return groupNameCache.get(groupId)!;
  try {
    const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) {
      groupNameCache.set(groupId, null);
      return null;
    }
    const data = (await res.json()) as { name?: string };
    const name = data.name || null;
    groupNameCache.set(groupId, name);
    return name;
  } catch {
    groupNameCache.set(groupId, null);
    return null;
  }
}

const groupMemberCountCache = new Map<number, number | null>();

export async function getRobloxGroupMemberCount(groupId: number): Promise<number | null> {
  if (groupMemberCountCache.has(groupId)) return groupMemberCountCache.get(groupId)!;
  try {
    const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) {
      groupMemberCountCache.set(groupId, null);
      return null;
    }
    const data = (await res.json()) as { memberCount?: number };
    const count = typeof data.memberCount === "number" ? data.memberCount : null;
    groupMemberCountCache.set(groupId, count);
    return count;
  } catch {
    groupMemberCountCache.set(groupId, null);
    return null;
  }
}

export async function getMemberGroupNames(userId: string): Promise<string[]> {
  const memberships = await Promise.all(
    ALL_KNOWN_GROUPS.map(async (g) => ({
      group: g,
      isMember: await isRobloxGroupMember(userId, g.id),
    }))
  );
  const names: string[] = [];
  for (const m of memberships) {
    if (!m.isMember) continue;
    const realName = await getRobloxGroupName(m.group.id);
    names.push(realName || m.group.label);
  }
  return names;
}
