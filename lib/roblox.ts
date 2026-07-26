// Simple in-memory cache. Only helps within a single warm serverless
// instance, but avoids redundant lookups during a burst of requests.
const avatarCache = new Map<string, string | null>();

export async function getRobloxAvatarUrl(userId: string): Promise<string | null> {
  if (avatarCache.has(userId)) return avatarCache.get(userId)!;
  try {
    const res = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`
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

// The "PS Royal Households of the United Kingdom" Roblox community.
// https://www.roblox.com/communities/35167585/PS-Royal-Households-of-the-United-Kingdom
export const ROYAL_FAMILY_GROUP_ID = 35167585;

export async function isRobloxGroupMember(userId: string, groupId: number): Promise<boolean> {
  try {
    const res = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
    if (!res.ok) return false;
    const data = (await res.json()) as { data?: { group?: { id?: number } }[] };
    return (data.data || []).some((entry) => entry.group?.id === groupId);
  } catch {
    return false;
  }
}

// Accepts either a bare group ID or a full group URL (any of Roblox's past
// and current URL shapes — /communities/ID-slug, /groups/ID/slug, etc.) and
// returns just the numeric ID. Pasting the page URL is the obvious thing to
// do here, so Group Search shouldn't 400 on it.
export function extractGroupId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = /(?:communities|groups)\/(\d+)/i.exec(trimmed);
  if (urlMatch) return urlMatch[1];
  const digitsOnly = /^\d+$/.exec(trimmed);
  if (digitsOnly) return trimmed;
  return trimmed;
}

// Every group ID this account belongs to, in one call — used by Person
// Search to cross-reference against a known list, instead of making one
// isRobloxGroupMember call per candidate group.
export async function getUserGroupIds(userId: string): Promise<number[]> {
  try {
    const res = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { group?: { id?: number } }[] };
    return (data.data || [])
      .map((entry) => entry.group?.id)
      .filter((id): id is number => typeof id === "number");
  } catch {
    return [];
  }
}

// Resolves a Roblox username to a user ID. If the input already looks like a
// numeric ID, it's returned as-is (no network call needed).
export async function resolveRobloxUserId(
  query: string
): Promise<{ userId: string; username: string } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    try {
      const res = await fetch(`https://users.roblox.com/v1/users/${trimmed}`);
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
      headers: { "Content-Type": "application/json" },
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

// Blume clearance: any of these Roblox groups, or one of the three
// explicitly-allowed user IDs, unlocks the Blume dashboard.
export const BLUME_GROUP_IDS = [154853936, 142915989, 685466511, 187507831];
export const BLUME_ALLOWED_USER_IDS = ["181869610", "4963562759", "2322187718"];

export async function isBlumeAuthorized(userId: string): Promise<boolean> {
  if (BLUME_ALLOWED_USER_IDS.includes(userId)) return true;
  const checks = await Promise.all(
    BLUME_GROUP_IDS.map((groupId) => isRobloxGroupMember(userId, groupId))
  );
  return checks.some(Boolean);
}

// Publishing to the public Blume blog is restricted to the named
// operators, not the wider group-authorized dashboard access.
export function isBlumeSuperUser(userId: string): boolean {
  return BLUME_ALLOWED_USER_IDS.includes(userId);
}

// Site-wide platform admins: same three people, but this grants access to
// the Settings app, the audit log, banning, and Admin Mode across the whole
// of Westbridge OS (not just Blume).
export const PLATFORM_ADMIN_USER_IDS = ["181869610", "4963562759", "2322187718"];

export function isPlatformAdmin(userId: string): boolean {
  return PLATFORM_ADMIN_USER_IDS.includes(userId);
}

// Every Roblox community this app knows about, used to warn an admin before
// they ban someone who belongs to one of them.
export const ALL_KNOWN_GROUPS: { id: number; label: string }[] = [
  { id: ROYAL_FAMILY_GROUP_ID, label: "PS Royal Households of the United Kingdom" },
  ...BLUME_GROUP_IDS.map((id) => ({ id, label: `Blume-authorized group ${id}` })),
];

const groupNameCache = new Map<number, string | null>();

export async function getRobloxGroupName(groupId: number): Promise<string | null> {
  if (groupNameCache.has(groupId)) return groupNameCache.get(groupId)!;
  try {
    const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`);
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

// Groups that matter for Blume's Person Search — everything else the person
// belongs to is ignored. "red" groups render in red (organized-crime /
// unaffiliated-interest groups), "white" groups render in normal text
// (largely law enforcement, government, and emergency services).
export const PERSON_SEARCH_GROUPS: Record<number, { name: string; tier: "red" | "white" }> = {
  10742221: { name: "G-Block", tier: "red" },
  223035360: { name: "Shadow District", tier: "red" },
  679403020: { name: "Harakat", tier: "red" },
  16684944: { name: "Irish", tier: "red" },
  34067916: { name: "CHS", tier: "red" },
  541807: { name: "UK | United Kingdom", tier: "red" },
  14641286: { name: "TUI Airways | Roblox", tier: "red" },
  696897291: { name: "Motorway Roleplay Community", tier: "red" },
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
};

// Returns the display names of every known group the given user belongs to
// (fetching the real Roblox group name rather than relying on a hardcoded
// label), for the ban-confirmation warning.
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
