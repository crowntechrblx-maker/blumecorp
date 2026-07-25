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

// Blume clearance: any of these Roblox groups, or either of the two
// explicitly-allowed user IDs, unlocks the Blume dashboard.
export const BLUME_GROUP_IDS = [154853936, 142915989, 685466511, 187507831];
export const BLUME_ALLOWED_USER_IDS = ["181869610", "4963562759"];

export async function isBlumeAuthorized(userId: string): Promise<boolean> {
  if (BLUME_ALLOWED_USER_IDS.includes(userId)) return true;
  const checks = await Promise.all(
    BLUME_GROUP_IDS.map((groupId) => isRobloxGroupMember(userId, groupId))
  );
  return checks.some(Boolean);
}

// Publishing to the public Blume blog is restricted to the two named
// operators, not the wider group-authorized dashboard access.
export function isBlumeSuperUser(userId: string): boolean {
  return BLUME_ALLOWED_USER_IDS.includes(userId);
}
