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
export const BLUME_ALLOWED_USER_IDS = ["181869610", "4963562759", "2322187718"];

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

export const PERSON_SEARCH_GROUPS: Record<number, { name: string; tier: "red" | "white" }> = {
  10742221: { name: "G-Block", tier: "red" },
  223035360: { name: "Shadow District", tier: "red" },
  679403020: { name: "Harakat", tier: "red" },
  16684944: { name: "Kinshahan", tier: "red" },
  34067916: { name: "CHS", tier: "red" },
  541807: { name: "UK | United Kingdom", tier: "red" },
  14641286: { name: "TUI Airways | Roblox", tier: "red" },
  696897291: { name: "Motorway Roleplay", tier: "red" },
  11939831: { name: "Nottinghamshire, England", tier: "red" },
  16339807: { name: "Liber Studios", tier: "red" },
  34544324: { name: "UK | Sandford Studios", tier: "red" },
  12982639: { name: "NEMG | North East Medical Group", tier: "red" },
  8103: { name: "UK Explorium Studios", tier: "red" },

  32650605: { name: "London Air Ambulance", tier: "white" },
  879056831: { name: "London Ambulance Service", tier: "white" },
  493990898: { name: "Metropolitan Police Service", tier: "white" },
  360230741: { name: "London Fire Brigade", tier: "white" },
  931656944: { name: "British Forces", tier: "white" },
  820909258: { name: "British Transport Police", tier: "white" },
  743983922: { name: "Greater Manchester Police", tier: "white" },
  987422423: { name: "Police Service of Northern Ireland", tier: "white" },
  154853936: { name: "MI5", tier: "white" },
  142915989: { name: "National Crime Agency", tier: "white" },
  685466511: { name: "SIS (MI6)", tier: "white" },
  34974741: { name: "Immigration Enforcement", tier: "white" },
  11086948: { name: "Hatzola", tier: "white" },
  35167585: { name: "Royal Households", tier: "white" },
  841518502: { name: "Home Office", tier: "white" },
  278125181: { name: "National Police Air Service", tier: "white" },
  740750486: { name: "Kent Police", tier: "white" },
  567563234: { name: "HM Revenue and Customs", tier: "white" },
  187507831: { name: "Central Intelligence Agency", tier: "white" },
  963189576: { name: "JTF2", tier: "white" },
  315987361: { name: "Regional Organised Crime Unit", tier: "white" },
  496716538: { name: "U.S Marshals Service", tier: "white" },
  841282433: { name: "London Freemasons", tier: "white" },
  1033941381: { name: "Consulate of the People's Republic of China", tier: "white" },

  1176461: { name: "Union Studios", tier: "red" },
  2792847: { name: "Crown Studios", tier: "red" },
  1059884: { name: "Imperium Studios", tier: "red" },
  979414846: { name: "[IP] Interactive Productions", tier: "red" },
  32324698: { name: "PHOENIX Studios Group", tier: "red" },
  33392881: { name: "Aris Production", tier: "red" },
  34564109: { name: "Liber Studios ND", tier: "red" },
  35662128: { name: "United Establishment", tier: "red" },
  5081986: { name: "Yaris United Kingdom", tier: "red" },
  35273143: { name: "Explorium Studios", tier: "red" },
};

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
