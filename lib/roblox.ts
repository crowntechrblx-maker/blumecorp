import {
  getGroupIdsByCategory,
  getGroupIdsExcludingCategories,
  getGroupIdsByNameMatch,
} from "./groupCatalog.js";

const HMCTS_EDITOR_GROUP_NAMES = ["crown prosecution", "home office", "ministry of justice"];

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

const squareAvatarCache = new Map<string, string | null>();

export async function getRobloxSquareAvatarUrl(userId: string): Promise<string | null> {
  if (squareAvatarCache.has(userId)) return squareAvatarCache.get(userId)!;
  try {
    const res = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
      { headers: robloxHeaders() }
    );
    const data = (await res.json()) as { data?: { imageUrl?: string }[] };
    const url = data.data?.[0]?.imageUrl || null;
    squareAvatarCache.set(userId, url);
    return url;
  } catch {
    return null;
  }
}

const friendsCountCache = new Map<string, number | null>();

export async function getRobloxFriendsCount(userId: string): Promise<number | null> {
  if (friendsCountCache.has(userId)) return friendsCountCache.get(userId)!;
  try {
    const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) {
      friendsCountCache.set(userId, null);
      return null;
    }
    const data = (await res.json()) as { count?: number };
    const count = typeof data.count === "number" ? data.count : null;
    friendsCountCache.set(userId, count);
    return count;
  } catch {
    friendsCountCache.set(userId, null);
    return null;
  }
}

const followersCountCache = new Map<string, number | null>();

export async function getRobloxFollowersCount(userId: string): Promise<number | null> {
  if (followersCountCache.has(userId)) return followersCountCache.get(userId)!;
  try {
    const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) {
      followersCountCache.set(userId, null);
      return null;
    }
    const data = (await res.json()) as { count?: number };
    const count = typeof data.count === "number" ? data.count : null;
    followersCountCache.set(userId, count);
    return count;
  } catch {
    followersCountCache.set(userId, null);
    return null;
  }
}

const accountCreatedCache = new Map<string, string | null>();

export async function getRobloxAccountCreatedAt(userId: string): Promise<string | null> {
  if (accountCreatedCache.has(userId)) return accountCreatedCache.get(userId)!;
  try {
    const res = await fetch(`https://users.roblox.com/v1/users/${userId}`, {
      headers: robloxHeaders(),
    });
    if (!res.ok) {
      accountCreatedCache.set(userId, null);
      return null;
    }
    const data = (await res.json()) as { created?: string };
    const created = data.created || null;
    accountCreatedCache.set(userId, created);
    return created;
  } catch {
    accountCreatedCache.set(userId, null);
    return null;
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

// Kept as a static fallback set only for ALL_KNOWN_GROUPS/getMemberGroupNames labeling below.
// Live Blume access is now driven by the "Intelligence" category in the group catalog (see isBlumeAuthorized).
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
  const intelGroupIds = await getGroupIdsByCategory("Intelligence");
  if (intelGroupIds.length === 0) return false;
  const memberGroupIds = await getUserGroupIds(userId);
  const memberSet = new Set(memberGroupIds);
  return intelGroupIds.some((id) => memberSet.has(id));
}

export function isBlumeSuperUser(userId: string): boolean {
  return BLUME_ALLOWED_USER_IDS.includes(userId);
}

// HMCTS "ranked" gate: any group not tagged OCG or IE counts as a legitimate
// rank for the purposes of the judiciary portal.
export async function isHmctsRanked(userId: string): Promise<boolean> {
  const rankedGroupIds = await getGroupIdsExcludingCategories(["OCG", "IE"]);
  if (rankedGroupIds.length === 0) return false;
  const memberGroupIds = await getUserGroupIds(userId);
  const memberSet = new Set(memberGroupIds);
  return rankedGroupIds.some((id) => memberSet.has(id));
}

// Editing access is restricted to Crown Prosecution / Home Office / Ministry of
// Justice, matched by name in the group catalog rather than hardcoded IDs — add
// those groups via Blume's Group Settings and their members get edit access.
export async function isHmctsEditor(userId: string): Promise<boolean> {
  const editorGroupIds = await getGroupIdsByNameMatch(HMCTS_EDITOR_GROUP_NAMES);
  if (editorGroupIds.length === 0) return false;
  const memberGroupIds = await getUserGroupIds(userId);
  const memberSet = new Set(memberGroupIds);
  return editorGroupIds.some((id) => memberSet.has(id));
}

const HMCTS_DEPARTMENTS: { label: string; needle: string }[] = [
  { label: "Ministry of Justice", needle: "ministry of justice" },
  { label: "Crown Prosecution Service", needle: "crown prosecution" },
  { label: "Home Office", needle: "home office" },
];

// Returns every HMCTS department the user is a member of (can be more than one),
// for tagging internal messages by name + department(s).
export async function getHmctsUserDepartments(userId: string): Promise<string[]> {
  const memberGroupIds = await getUserGroupIds(userId);
  const memberSet = new Set(memberGroupIds);
  const departments: string[] = [];
  for (const dept of HMCTS_DEPARTMENTS) {
    const groupIds = await getGroupIdsByNameMatch([dept.needle]);
    if (groupIds.some((id) => memberSet.has(id))) departments.push(dept.label);
  }
  return departments;
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
