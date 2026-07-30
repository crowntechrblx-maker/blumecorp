import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kv } from "../../lib/kv.js";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import {
  isBlumeAuthorized,
  isBlumeSuperUser,
  isPlatformAdmin,
  getRobloxAvatarUrl,
  getUserGroupIds,
  resolveRobloxUserId,
  getRobloxFriends,
  extractGroupId,
  robloxHeaders,
  getRobloxGroupMemberCount,
  getRobloxFullAvatarUrl,
  getRobloxFriendsCount,
  getRobloxFollowersCount,
  getRobloxAccountCreatedAt,
} from "../../lib/roblox.js";
import { containsBlockedLanguage, MODERATION_REJECTION_MESSAGE } from "../../lib/moderation.js";
import { appendAuditLog } from "../../lib/audit.js";
import { isVerifileAuthorized } from "../../lib/verifile.js";

const READONLY_API = "https://polarisreadonly.up.railway.app";

interface SearchSnapshot {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  customPlate: string | null;
  searchedByUsername: string;
  createdAt: number;
}

interface VehicleTag {
  id: string;
  userId: string;
  vehicleType: string;
  addedByUsername: string;
  createdAt: number;
}

interface GroupScanEntry {
  userId: string;
  username: string;
  avatarUrl: string | null;
  customPlate: string | null;
  groupIds: number[];
  friends: { userId: string; username: string }[];
  scannedAt: number;
  changed?: { username: boolean; groups: boolean; friends: boolean; at: number } | null;
  lastSeenOnlineAt?: number;
  formerGroups?: { groupId: number; lastSeenAt: number }[];
}

const FORMER_GROUP_WINDOW_MS = 1000 * 60 * 60 * 24 * 182;

function diffFormerGroups(
  existing: GroupScanEntry | undefined,
  newGroupIds: number[]
): { groupId: number; lastSeenAt: number }[] {
  let formerGroups = existing?.formerGroups ? existing.formerGroups.map((f) => ({ ...f })) : [];
  if (existing) {
    const newSet = new Set(newGroupIds);
    for (const oldId of existing.groupIds) {
      if (!newSet.has(oldId)) {
        const lastSeenAt = existing.scannedAt;
        const idx = formerGroups.findIndex((f) => f.groupId === oldId);
        if (idx >= 0) formerGroups[idx] = { groupId: oldId, lastSeenAt };
        else formerGroups.push({ groupId: oldId, lastSeenAt });
      }
    }
    formerGroups = formerGroups.filter((f) => !newGroupIds.includes(f.groupId));
  }
  return formerGroups;
}

type GroupCategory = "Emergency Services" | "Intelligence" | "IE" | "OCG" | "Other";
const GROUP_CATEGORIES: GroupCategory[] = ["Emergency Services", "Intelligence", "IE", "OCG", "Other"];

function tierForCategory(category: string): "red" | "white" {
  return category === "IE" || category === "OCG" ? "red" : "white";
}

interface CustomGroup {
  id: number;
  name: string;
  category: GroupCategory;
}

const HISTORY_PER_PERSON_CAP = 20;
const GROUP_SCAN_FRESH_MS = 6 * 60 * 60 * 1000;

const GROUP_SEED: CustomGroup[] = [
  { id: 10742221, name: "G-Block", category: "OCG" },
  { id: 223035360, name: "Shadow District", category: "OCG" },
  { id: 679403020, name: "Harakat", category: "OCG" },
  { id: 16684944, name: "National Liberation Movement", category: "OCG" },
  { id: 34067916, name: "CHS", category: "OCG" },
  { id: 541807, name: "UK | United Kingdom", category: "OCG" },
  { id: 14641286, name: "TUI Airways | Roblox", category: "OCG" },
  { id: 696897291, name: "Motorway Roleplay", category: "OCG" },
  { id: 11939831, name: "Nottinghamshire, England", category: "OCG" },
  { id: 16339807, name: "Liber Studios", category: "OCG" },
  { id: 34544324, name: "UK | Sandford Studios", category: "OCG" },
  { id: 12982639, name: "NEMG | North East Medical Group", category: "OCG" },
  { id: 8103, name: "UK Explorium Studios", category: "OCG" },
  { id: 1176461, name: "Union Studios", category: "OCG" },
  { id: 2792847, name: "Crown Studios", category: "OCG" },
  { id: 1059884, name: "Imperium Studios", category: "OCG" },
  { id: 979414846, name: "[IP] Interactive Productions", category: "OCG" },
  { id: 32324698, name: "PHOENIX Studios Group", category: "OCG" },
  { id: 33392881, name: "Aris Production", category: "OCG" },
  { id: 34564109, name: "Liber Studios ND", category: "OCG" },
  { id: 35662128, name: "United Establishment", category: "OCG" },
  { id: 5081986, name: "Yaris United Kingdom", category: "OCG" },
  { id: 35273143, name: "Explorium Studios", category: "OCG" },

  { id: 32650605, name: "London Air Ambulance", category: "Emergency Services" },
  { id: 879056831, name: "London Ambulance Service", category: "Emergency Services" },
  { id: 493990898, name: "Metropolitan Police Service", category: "Emergency Services" },
  { id: 360230741, name: "London Fire Brigade", category: "Emergency Services" },
  { id: 820909258, name: "British Transport Police", category: "Emergency Services" },
  { id: 743983922, name: "Greater Manchester Police", category: "Emergency Services" },
  { id: 987422423, name: "Police Service of Northern Ireland", category: "Emergency Services" },
  { id: 278125181, name: "National Police Air Service", category: "Emergency Services" },
  { id: 740750486, name: "Kent Police", category: "Emergency Services" },

  { id: 931656944, name: "British Forces", category: "Intelligence" },
  { id: 567563234, name: "HM Revenue and Customs", category: "Intelligence" },
  { id: 154853936, name: "MI5", category: "Intelligence" },
  { id: 142915989, name: "National Crime Agency", category: "Intelligence" },
  { id: 685466511, name: "SIS (MI6)", category: "Intelligence" },
  { id: 34974741, name: "Immigration Enforcement", category: "Intelligence" },
  { id: 11086948, name: "Hatzola", category: "Intelligence" },
  { id: 35167585, name: "Royal Households", category: "Intelligence" },
  { id: 841518502, name: "Home Office", category: "Intelligence" },
  { id: 187507831, name: "Central Intelligence Agency", category: "Intelligence" },
  { id: 963189576, name: "JTF2", category: "Intelligence" },
  { id: 315987361, name: "Regional Organised Crime Unit", category: "Intelligence" },
  { id: 496716538, name: "U.S Marshals Service", category: "Intelligence" },
  { id: 841282433, name: "London Freemasons", category: "Intelligence" },
  { id: 1033941381, name: "Consulate of the People's Republic of China", category: "Intelligence" },
];

async function getGroupCatalog(): Promise<
  Record<number, { name: string; tier: "red" | "white"; category: GroupCategory }>
> {
  let custom = await kv.get<CustomGroup[]>("blumeCustomGroups");
  if (custom === null || custom === undefined) {
    custom = GROUP_SEED;
    await kv.set("blumeCustomGroups", custom);
  }
  const merged: Record<number, { name: string; tier: "red" | "white"; category: GroupCategory }> = {};
  for (const c of custom) merged[c.id] = { name: c.name, tier: tierForCategory(c.category), category: c.category };
  return merged;
}

function relevantGroups(
  groupIds: number[],
  catalog: Record<number, { name: string; tier: "red" | "white"; category?: GroupCategory }>
) {
  return groupIds
    .filter((id) => id in catalog)
    .map((id) => ({ id, ...catalog[id] }))
    .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "red" ? -1 : 1));
}

const AGENT_GROUPS: { id: number; label: string }[] = [
  { id: 187507831, label: "CIA" },
  { id: 154853936, label: "MI5" },
  { id: 685466511, label: "MI6" },
  { id: 315987361, label: "ROCU" },
];

interface ServerPresenceReport {
  placeId: string | null;
  players: { userId: string; username: string }[];
  updatedAt: number;
}
const SERVER_PRESENCE_STALE_MS = 3 * 60 * 1000; // 3 min

interface MonitoringMessageEntry {
  id: string;
  fromUsername: string;
  toUsername: string;
  text: string;
  createdAt: number;
  deleted?: boolean;
}
interface MonitoringPostEntry {
  id: string;
  authorUsername: string;
  text: string;
  imageUrl: string | null;
  createdAt: number;
  deleted?: boolean;
}

async function scanMemberEntry(
  userId: string,
  usernameHint: string | undefined,
  allEntries: GroupScanEntry[]
): Promise<GroupScanEntry> {
  const existing = allEntries.find((m) => m.userId === userId);
  const resolved = await resolveRobloxUserId(userId);
  const username = resolved?.username || existing?.username || usernameHint || userId;
  const [avatarUrl, groupIds, friendsRaw] = await Promise.all([
    getRobloxAvatarUrl(userId),
    getUserGroupIds(userId),
    getRobloxFriends(userId),
  ]);

  const knownScanIds = new Set(allEntries.map((m) => m.userId));
  const friends = friendsRaw
    .filter((f) => f.userId !== userId && knownScanIds.has(f.userId))
    .map((f) => ({ userId: f.userId, username: f.username }));

  let customPlate: string | null = null;
  try {
    const playerRes = await fetch(`${READONLY_API}/player/${encodeURIComponent(userId)}`);
    const playerText = await playerRes.text();
    let playerData: any;
    try {
      playerData = JSON.parse(playerText);
    } catch {
      playerData = null;
    }
    if (playerRes.ok && playerData && !playerData.error) {
      customPlate = playerData.CustomPlate ?? null;
    }
  } catch {
  }

  if (customPlate) {
    const plateTaken = allEntries.some(
      (m) => m.userId !== userId && m.customPlate === customPlate
    );
    if (plateTaken) customPlate = null;
  }

  let changed: GroupScanEntry["changed"] = null;
  if (existing) {
    const usernameChanged = existing.username !== username;
    const oldGroupIds = new Set(existing.groupIds);
    const newGroupIds = new Set(groupIds);
    const groupsChanged =
      oldGroupIds.size !== newGroupIds.size ||
      [...newGroupIds].some((id) => !oldGroupIds.has(id));
    const oldFriendIds = new Set((existing.friends || []).map((f) => f.userId));
    const newFriendIds = new Set(friends.map((f) => f.userId));
    const friendsChanged =
      oldFriendIds.size !== newFriendIds.size ||
      [...newFriendIds].some((id) => !oldFriendIds.has(id));
    if (usernameChanged || groupsChanged || friendsChanged) {
      changed = { username: usernameChanged, groups: groupsChanged, friends: friendsChanged, at: Date.now() };
    }
  }

  const formerGroups = diffFormerGroups(existing, groupIds);

  return {
    userId,
    username,
    avatarUrl,
    customPlate,
    groupIds,
    friends,
    scannedAt: Date.now(),
    changed,
    formerGroups,
  };
}

async function recordGroupMembershipAndGetFormerGroups(
  userId: string,
  username: string,
  groupIds: number[],
  avatarUrl: string | null
): Promise<{ groupId: number; lastSeenAt: number }[]> {
  const all = (await kv.get<GroupScanEntry[]>("blumeGroupScanCache")) || [];
  const existing = all.find((m) => m.userId === userId);
  const formerGroups = diffFormerGroups(existing, groupIds);

  let changed: GroupScanEntry["changed"] = null;
  if (existing) {
    const usernameChanged = existing.username !== username;
    const oldGroupIds = new Set(existing.groupIds);
    const newGroupIds = new Set(groupIds);
    const groupsChanged =
      oldGroupIds.size !== newGroupIds.size || [...newGroupIds].some((id) => !oldGroupIds.has(id));
    if (usernameChanged || groupsChanged) {
      changed = { username: usernameChanged, groups: groupsChanged, friends: false, at: Date.now() };
    }
  }

  const entry: GroupScanEntry = {
    userId,
    username,
    avatarUrl: avatarUrl ?? existing?.avatarUrl ?? null,
    customPlate: existing?.customPlate ?? null,
    groupIds,
    friends: existing?.friends || [],
    scannedAt: Date.now(),
    changed,
    lastSeenOnlineAt: existing?.lastSeenOnlineAt,
    formerGroups,
  };
  const next = [...all.filter((m) => m.userId !== userId), entry];
  await kv.set("blumeGroupScanCache", next);
  return formerGroups;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "POST") {
    const rawBody = req.body as { action?: string } | undefined;
    if (rawBody?.action === "reportServerPlayers") {
      const providedKey = req.headers["x-ingest-key"];
      const expectedKey = process.env.BLUME_INGEST_KEY;
      if (!expectedKey || providedKey !== expectedKey) {
        res.status(401).send("Invalid or missing ingest key.");
        return;
      }
      const body = rawBody as { placeId?: string | number; players?: unknown };
      const rawPlayers = Array.isArray(body.players) ? body.players : [];
      const players = rawPlayers
        .map((p) => {
          const rec = p as { userId?: string | number; username?: string };
          if (rec == null || rec.userId == null || !rec.username) return null;
          return { userId: String(rec.userId), username: String(rec.username) };
        })
        .filter((p): p is { userId: string; username: string } => !!p)
        .slice(0, 300); // sanity cap
      const report: ServerPresenceReport = {
        placeId: body.placeId != null ? String(body.placeId) : null,
        players,
        updatedAt: Date.now(),
      };
      await kv.set("blumeServerPresence", report);
      res.status(200).json({ ok: true, count: players.length });
      return;
    }
  }

  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);

  if (!session) {
    res.status(401).send("You must be signed in.");
    return;
  }

  if (req.method === "GET" && (req.query.verifileSearch || req.query.verifileMyServices)) {
    if (!(await isVerifileAuthorized(session.userId))) {
      res.status(403).send("You do not have clearance to use Verifile.");
      return;
    }
    if (req.query.verifileSearch) {
      const q = (req.query.verifileSearch as string).trim();
      if (!q) {
        res.status(400).send("Missing search query.");
        return;
      }
      const resolved = await resolveRobloxUserId(q);
      if (!resolved) {
        res.status(404).send(`Couldn't find a Roblox user matching "${q}".`);
        return;
      }
      const [avatarUrl, fullAvatarUrl, groupIds, catalog, friendsCount, followersCount, createdAt] =
        await Promise.all([
          getRobloxAvatarUrl(resolved.userId),
          getRobloxFullAvatarUrl(resolved.userId),
          getUserGroupIds(resolved.userId),
          getGroupCatalog(),
          getRobloxFriendsCount(resolved.userId),
          getRobloxFollowersCount(resolved.userId),
          getRobloxAccountCreatedAt(resolved.userId),
        ]);
      const rawFormerGroups = await recordGroupMembershipAndGetFormerGroups(
        resolved.userId,
        resolved.username,
        groupIds,
        avatarUrl
      );
      const formerGroups = rawFormerGroups
        .filter((f) => Date.now() - f.lastSeenAt <= FORMER_GROUP_WINDOW_MS)
        .map((f) => {
          const info = catalog[f.groupId];
          return info ? { id: f.groupId, ...info, lastSeenAt: f.lastSeenAt } : null;
        })
        .filter((f): f is NonNullable<typeof f> => !!f && f.tier === "red")
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

      res.status(200).json({
        userId: resolved.userId,
        username: resolved.username,
        avatarUrl,
        fullAvatarUrl,
        groups: relevantGroups(groupIds, catalog),
        formerGroups,
        friendsCount,
        followersCount,
        createdAt,
      });
      return;
    }
    if (req.query.verifileMyServices) {
      const [groupIds, catalog] = await Promise.all([
        getUserGroupIds(session.userId),
        getGroupCatalog(),
      ]);
      res.status(200).json({ services: relevantGroups(groupIds, catalog) });
      return;
    }
  }

  if (!(await isBlumeAuthorized(session.userId))) {
    res.status(403).send("You do not have clearance to use Person Search.");
    return;
  }

  if (req.method === "GET") {
    if (req.query.activeAgents) {
      const AGENT_SCAN_FRESH_MS = 10 * 60 * 1000;
      const AGENT_SCAN_BATCH_CAP = 8;
      const ONLINE_TOUCH_MIN_GAP_MS = 5 * 60 * 1000;

      const liveReport = await kv.get<ServerPresenceReport>("blumeServerPresence");
      const livePlayers =
        liveReport && Date.now() - liveReport.updatedAt < SERVER_PRESENCE_STALE_MS
          ? liveReport.players
          : [];

      if (livePlayers.length === 0) {
        res.status(200).json({ agents: [] });
        return;
      }

      let all = (await kv.get<GroupScanEntry[]>("blumeGroupScanCache")) || [];
      const byId = new Map(all.map((m) => [m.userId, m]));

      const stale = livePlayers
        .filter((p) => {
          const entry = byId.get(p.userId);
          return !entry || Date.now() - entry.scannedAt >= AGENT_SCAN_FRESH_MS;
        })
        .sort((a, b) => (byId.get(a.userId)?.scannedAt || 0) - (byId.get(b.userId)?.scannedAt || 0))
        .slice(0, AGENT_SCAN_BATCH_CAP);

      let changed = false;
      for (const p of stale) {
        try {
          const entry = await scanMemberEntry(p.userId, p.username, all);
          all = [...all.filter((m) => m.userId !== p.userId), entry];
          byId.set(p.userId, entry);
          changed = true;
        } catch {
        }
      }

      const now = Date.now();
      for (const p of livePlayers) {
        const entry = byId.get(p.userId);
        if (entry && (!entry.lastSeenOnlineAt || now - entry.lastSeenOnlineAt >= ONLINE_TOUCH_MIN_GAP_MS)) {
          entry.lastSeenOnlineAt = now;
          changed = true;
        }
      }

      if (changed) {
        await kv.set("blumeGroupScanCache", all);
      }

      const agentGroupIds = AGENT_GROUPS.map((g) => g.id);
      const agents = livePlayers
        .map((p) => byId.get(p.userId))
        .filter((entry): entry is GroupScanEntry => !!entry)
        .filter((entry) => entry.groupIds.some((id) => agentGroupIds.includes(id)))
        .map((entry) => ({
          username: entry.username,
          role: AGENT_GROUPS.filter((g) => entry.groupIds.includes(g.id))
            .map((g) => g.label)
            .join(" / "),
        }));

      res.status(200).json({ agents });
      return;
    }

    if (req.query.activeInGame) {
      const catalog = await getGroupCatalog();
      const scanCache = (await kv.get<GroupScanEntry[]>("blumeGroupScanCache")) || [];
      const scanByUserId = new Map(scanCache.map((s) => [s.userId, s]));

      const tagMember = (userId: string, username: string, fallbackAvatarUrl: string | null) => {
        const scan = scanByUserId.get(userId);
        const redGroup = scan ? relevantGroups(scan.groupIds, catalog).find((g) => g.tier === "red") : undefined;
        const role = scan
          ? AGENT_GROUPS.filter((g) => scan.groupIds.includes(g.id))
              .map((g) => g.label)
              .join(" / ") || null
          : null;
        return {
          username,
          avatarUrl: scan?.avatarUrl ?? fallbackAvatarUrl,
          redGroupName: redGroup?.name || null,
          role,
        };
      };
      const sortUsers = <T extends { redGroupName: string | null; username: string }>(list: T[]) =>
        list.sort((a, b) => {
          if (!!a.redGroupName !== !!b.redGroupName) return a.redGroupName ? -1 : 1;
          return a.username.localeCompare(b.username);
        });

      const liveReport = await kv.get<ServerPresenceReport>("blumeServerPresence");
      if (liveReport && Date.now() - liveReport.updatedAt < SERVER_PRESENCE_STALE_MS) {
        const users = sortUsers(liveReport.players.map((p) => tagMember(p.userId, p.username, null)));
        res.status(200).json({ users, live: true, updatedAt: liveReport.updatedAt });
        return;
      }

      res.status(200).json({ users: [], live: false, updatedAt: liveReport?.updatedAt || null });
      return;
    }

    if (req.query.groupCatalog) {
      const catalog = await getGroupCatalog();
      const withCounts = req.query.withCounts === "1";
      const groups = await Promise.all(
        Object.entries(catalog).map(async ([id, g]) => ({
          id: Number(id),
          name: g.name,
          tier: g.tier,
          category: g.category,
          memberCount: withCounts ? await getRobloxGroupMemberCount(Number(id)) : undefined,
        }))
      );
      groups.sort((a, b) => (a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier === "red" ? -1 : 1));
      res.status(200).json({ groups, canManage: isBlumeSuperUser(session.userId) });
      return;
    }

    if (req.query.monitoringUsers) {
      const catalog = await getGroupCatalog();
      const scanCache = (await kv.get<GroupScanEntry[]>("blumeGroupScanCache")) || [];
      const scanByLowerUsername = new Map(scanCache.map((s) => [s.username.toLowerCase(), s]));
      const [messages, posts, views] = await Promise.all([
        kv.get<MonitoringMessageEntry[]>("messages"),
        kv.get<MonitoringPostEntry[]>("posts"),
        kv.get<Record<string, number>>("blumeMonitoringViews"),
      ]);
      const viewMap = views || {};
      const names = new Set<string>();
      const activityCount = new Map<string, number>();
      const bumpActivity = (username: string, createdAt: number) => {
        const lastViewed = viewMap[`${session.userId}:${username.toLowerCase()}`] || 0;
        if (createdAt <= lastViewed) return;
        activityCount.set(username, (activityCount.get(username) || 0) + 1);
      };
      for (const m of messages || []) {
        names.add(m.fromUsername);
        names.add(m.toUsername);
        bumpActivity(m.fromUsername, m.createdAt);
      }
      for (const p of posts || []) {
        names.add(p.authorUsername);
        bumpActivity(p.authorUsername, p.createdAt);
      }
      const users = Array.from(names)
        .map((username) => {
          const scan = scanByLowerUsername.get(username.toLowerCase());
          const redGroup = scan ? relevantGroups(scan.groupIds, catalog).find((g) => g.tier === "red") : undefined;
          return {
            username,
            redGroupName: redGroup?.name || null,
            activityCount: activityCount.get(username) || 0,
          };
        })
        .sort((a, b) => {
          if (!!a.redGroupName !== !!b.redGroupName) return a.redGroupName ? -1 : 1;
          return a.username.localeCompare(b.username);
        });
      res.status(200).json({ users });
      return;
    }

    const monitoringChatsOf = (req.query.monitoringChats as string) || "";
    if (monitoringChatsOf) {
      const target = monitoringChatsOf.toLowerCase();
      const [messages, posts] = await Promise.all([
        kv.get<MonitoringMessageEntry[]>("messages"),
        kv.get<MonitoringPostEntry[]>("posts"),
      ]);
      const myMessages = (messages || []).filter(
        (m) => m.fromUsername.toLowerCase() === target || m.toUsername.toLowerCase() === target
      );
      const byPartner = new Map<string, MonitoringMessageEntry[]>();
      for (const m of myMessages) {
        const partner =
          m.fromUsername.toLowerCase() === target ? m.toUsername : m.fromUsername;
        if (!byPartner.has(partner)) byPartner.set(partner, []);
        byPartner.get(partner)!.push(m);
      }
      const conversations = Array.from(byPartner.entries())
        .map(([withUsername, msgs]) => ({
          withUsername,
          messages: msgs
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((m) => ({
              id: m.id,
              from: m.fromUsername,
              to: m.toUsername,
              text: m.text,
              createdAt: m.createdAt,
              deleted: !!m.deleted,
            })),
        }))
        .sort((a, b) => {
          const aLast = a.messages[a.messages.length - 1]?.createdAt || 0;
          const bLast = b.messages[b.messages.length - 1]?.createdAt || 0;
          return bLast - aLast;
        });

      const myPosts = (posts || [])
        .filter((p) => p.authorUsername.toLowerCase() === target)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((p) => ({
          id: p.id,
          text: p.text,
          imageUrl: p.imageUrl,
          createdAt: p.createdAt,
          deleted: !!p.deleted,
        }));

      const views = (await kv.get<Record<string, number>>("blumeMonitoringViews")) || {};
      views[`${session.userId}:${target}`] = Date.now();
      await kv.set("blumeMonitoringViews", views);

      res.status(200).json({ conversations, posts: myPosts });
      return;
    }

    const groupMembersOf = (req.query.groupMembers as string) || "";
    if (groupMembersOf) {
      const cursor = (req.query.cursor as string) || "";
      const groupId = extractGroupId(groupMembersOf);
      try {
        const url = `https://groups.roblox.com/v1/groups/${encodeURIComponent(groupId)}/users?limit=100${
          cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
        }`;
        const groupRes = await fetch(url, { headers: robloxHeaders() });
        if (!groupRes.ok) {
          res.status(400).send(`Couldn't load group members (status ${groupRes.status}). Check the group ID.`);
          return;
        }
        const data = (await groupRes.json()) as {
          nextPageCursor?: string | null;
          data?: { user?: { userId?: number; username?: string } }[];
        };
        const members = (data.data || [])
          .map((entry) => entry.user)
          .filter((u): u is { userId: number; username: string } => !!u?.userId && !!u?.username)
          .map((u) => ({ userId: String(u.userId), username: u.username }));
        res.status(200).json({ members, nextCursor: data.nextPageCursor || null });
      } catch (err) {
        res.status(500).send("Couldn't reach Roblox's group API: " + (err as Error).message);
      }
      return;
    }

    const groupScanOf = (req.query.groupScan as string) || "";
    if (groupScanOf) {
      const catalog = await getGroupCatalog();
      const groupId = Number(extractGroupId(groupScanOf));
      const all = (await kv.get<GroupScanEntry[]>("blumeGroupScanCache")) || [];
      const members = all
        .filter((m) => m.groupIds.includes(groupId))
        .sort((a, b) => b.scannedAt - a.scannedAt)
        .map((m) => ({ ...m, relevantGroups: relevantGroups(m.groupIds, catalog) }));
      res.status(200).json({ members });
      return;
    }

    const historyForUserId = (req.query.history as string) || "";
    if (historyForUserId) {
      const all = (await kv.get<SearchSnapshot[]>("blumeSearchHistory")) || [];
      const history = all
        .filter((h) => h.userId === historyForUserId)
        .sort((a, b) => b.createdAt - a.createdAt);
      res.status(200).json({ history });
      return;
    }

    const query = ((req.query.query as string) || "").trim();
    if (!query) {
      res.status(400).send("Missing search query.");
      return;
    }

    const resolved = await resolveRobloxUserId(query);
    if (!resolved) {
      res.status(404).send("No Roblox user found matching that name or ID.");
      return;
    }
    const { userId, username } = resolved;

    const catalog = await getGroupCatalog();
    const [avatarUrl, groupIds] = await Promise.all([
      getRobloxAvatarUrl(userId),
      getUserGroupIds(userId),
    ]);
    const groups = relevantGroups(groupIds, catalog);

    let customPlate: string | null = null;
    let arrestHistory: unknown = null;
    let apiError: string | null = null;

    try {
      const playerRes = await fetch(`${READONLY_API}/player/${encodeURIComponent(userId)}`);
      const playerText = await playerRes.text();
      let playerData: any;
      try {
        playerData = JSON.parse(playerText);
      } catch {
        playerData = null;
      }
      if (!playerRes.ok || !playerData) {
        apiError = `The records API didn't respond as expected (status ${playerRes.status}).`;
      } else if (playerData.error) {
        apiError = String(playerData.error);
      } else {
        customPlate = playerData.CustomPlate ?? null;
        arrestHistory = playerData.ArrestHistory ?? null;
      }
    } catch (err) {
      apiError = "Couldn't reach the records API: " + (err as Error).message;
    }

    const vehicleTags = ((await kv.get<VehicleTag[]>("blumeVehicleTags")) || []).filter(
      (v) => v.userId === userId
    );

    const [allHistoryForFriends, groupScanForFriends] = await Promise.all([
      kv.get<SearchSnapshot[]>("blumeSearchHistory"),
      kv.get<GroupScanEntry[]>("blumeGroupScanCache"),
    ]);
    const historyList = allHistoryForFriends || [];
    const scanList = groupScanForFriends || [];
    const knownAvatarByUserId = new Map<string, string | null>();
    for (const h of historyList) knownAvatarByUserId.set(h.userId, h.avatarUrl);
    for (const s of scanList) knownAvatarByUserId.set(s.userId, s.avatarUrl);
    const scanByUserId = new Map<string, GroupScanEntry>();
    for (const s of scanList) scanByUserId.set(s.userId, s);
    const knownIds = new Set<string>([...historyList.map((h) => h.userId), ...scanList.map((s) => s.userId)]);

    const friendMap = new Map<string, { userId: string; username: string }>();
    for (const f of scanByUserId.get(userId)?.friends || []) {
      if (f.userId !== userId && knownIds.has(f.userId)) friendMap.set(f.userId, f);
    }
    for (const s of scanList) {
      if (s.userId === userId) continue;
      if ((s.friends || []).some((f) => f.userId === userId)) {
        friendMap.set(s.userId, { userId: s.userId, username: s.username });
      }
    }
    const knownFriends = Array.from(friendMap.values()).map((f) => {
      const scanEntry = scanByUserId.get(f.userId);
      const redGroupNames = scanEntry
        ? relevantGroups(scanEntry.groupIds, catalog)
            .filter((g) => g.tier === "red")
            .map((g) => g.name)
        : [];
      return {
        userId: f.userId,
        username: f.username,
        avatarUrl: knownAvatarByUserId.get(f.userId) ?? null,
        redGroupNames,
      };
    });

    const ownScanEntry = scanList.find((s) => s.userId === userId);
    const groupScanChange = ownScanEntry?.changed || null;

    if (avatarUrl || customPlate) {
      const allHistory = (await kv.get<SearchSnapshot[]>("blumeSearchHistory")) || [];
      const existingForPerson = allHistory
        .filter((h) => h.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt);
      const mostRecent = existingForPerson[0];
      const unchanged =
        mostRecent &&
        mostRecent.avatarUrl === avatarUrl &&
        mostRecent.customPlate === customPlate;
      if (!unchanged) {
        const entry: SearchSnapshot = {
          id: crypto.randomBytes(12).toString("hex"),
          userId,
          username,
          avatarUrl,
          customPlate,
          searchedByUsername: session.username,
          createdAt: Date.now(),
        };
        const others = allHistory.filter((h) => h.userId !== userId);
        const mine = [entry, ...existingForPerson].slice(0, HISTORY_PER_PERSON_CAP);
        await kv.set("blumeSearchHistory", [...others, ...mine]);
      }
    }

    const rawFormerGroups = await recordGroupMembershipAndGetFormerGroups(
      userId,
      username,
      groupIds,
      avatarUrl
    );
    const formerGroups = rawFormerGroups
      .filter((f) => Date.now() - f.lastSeenAt <= FORMER_GROUP_WINDOW_MS)
      .map((f) => {
        const info = catalog[f.groupId];
        return info ? { id: f.groupId, ...info, lastSeenAt: f.lastSeenAt } : null;
      })
      .filter((f): f is NonNullable<typeof f> => !!f && f.tier === "red")
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

    await appendAuditLog({
      type: "blume_person_search",
      username: session.username,
      detail: `Searched ${username} (${userId})`,
    });

    res.status(200).json({
      userId,
      username,
      avatarUrl,
      customPlate,
      arrestHistory,
      groups,
      formerGroups,
      vehicleTags,
      knownFriends,
      groupScanChange,
      apiError,
      lastSeenOnlineAt: scanByUserId.get(userId)?.lastSeenOnlineAt || null,
    });
    return;
  }

  if (req.method === "POST") {
    try {
      const body = req.body as {
        action?: string;
        userId?: string;
        vehicleType?: string;
        id?: string;
        force?: boolean;
        placeId?: string;
        groupId?: string;
        groupName?: string;
        groupCategory?: string;
      };
      const action = body.action || "";

      if (action === "addCustomGroup" || action === "removeCustomGroup") {
        if (!isBlumeSuperUser(session.userId)) {
          res.status(403).send("Only Blume administrators can manage the group catalog.");
          return;
        }
      }

      if (action === "addCustomGroup") {
        const rawGroupId = (body.groupId || "").toString().trim();
        const groupId = Number(extractGroupId(rawGroupId) || rawGroupId);
        const groupName = (body.groupName || "").toString().trim();
        const groupCategory = (body.groupCategory || "").toString().trim() as GroupCategory;
        if (!groupId || Number.isNaN(groupId)) {
          res.status(400).send("Group ID must be numeric, or a valid Roblox group link.");
          return;
        }
        if (!groupName) {
          res.status(400).send("Missing group name.");
          return;
        }
        if (groupName.length > 80) {
          res.status(400).send("Group name is too long (max 80 characters).");
          return;
        }
        if (!GROUP_CATEGORIES.includes(groupCategory)) {
          res.status(400).send(`Category must be one of: ${GROUP_CATEGORIES.join(", ")}.`);
          return;
        }
        if (containsBlockedLanguage(groupName)) {
          res.status(400).send(MODERATION_REJECTION_MESSAGE);
          return;
        }
        const custom = (await kv.get<CustomGroup[]>("blumeCustomGroups")) || [];
        const next = [
          ...custom.filter((c) => c.id !== groupId),
          { id: groupId, name: groupName, category: groupCategory },
        ];
        await kv.set("blumeCustomGroups", next);
        await appendAuditLog({
          type: "blume_group_added",
          username: session.username,
          detail: `Added ${groupCategory} group "${groupName}" (${groupId})`,
        });
        res
          .status(200)
          .json({ group: { id: groupId, name: groupName, tier: tierForCategory(groupCategory), category: groupCategory } });
        return;
      }

      if (action === "removeCustomGroup") {
        const groupId = Number((body.groupId || "").toString().trim());
        if (!groupId || Number.isNaN(groupId)) {
          res.status(400).send("Group ID must be numeric.");
          return;
        }
        const custom = (await kv.get<CustomGroup[]>("blumeCustomGroups")) || [];
        const removed = custom.find((c) => c.id === groupId);
        const next = custom.filter((c) => c.id !== groupId);
        await kv.set("blumeCustomGroups", next);
        if (removed) {
          await appendAuditLog({
            type: "blume_group_removed",
            username: session.username,
            detail: `Removed group "${removed.name}" (${groupId})`,
          });
        }
        res.status(200).json({ ok: true });
        return;
      }

      if (action === "scanMember") {
        const userId = (body.userId || "").toString().trim();
        if (!userId) {
          res.status(400).send("Missing userId.");
          return;
        }
        const all = (await kv.get<GroupScanEntry[]>("blumeGroupScanCache")) || [];
        const existing = all.find((m) => m.userId === userId);
        if (existing && !body.force && Date.now() - existing.scannedAt < GROUP_SCAN_FRESH_MS) {
          res.status(200).json({ entry: existing, skipped: true });
          return;
        }

        const entry = await scanMemberEntry(userId, undefined, all);
        const next = [...all.filter((m) => m.userId !== userId), entry];
        await kv.set("blumeGroupScanCache", next);
        res.status(200).json({ entry, skipped: false });
        return;
      }

      if (action === "addVehicle") {
        const userId = (body.userId || "").toString().trim();
        const vehicleType = (body.vehicleType || "").toString().trim();
        if (!userId || !vehicleType) {
          res.status(400).send("Missing userId or vehicleType.");
          return;
        }
        if (vehicleType.length > 80) {
          res.status(400).send("Vehicle type is too long (max 80 characters).");
          return;
        }
        if (containsBlockedLanguage(vehicleType)) {
          res.status(400).send(MODERATION_REJECTION_MESSAGE);
          return;
        }
        const entry: VehicleTag = {
          id: crypto.randomBytes(12).toString("hex"),
          userId,
          vehicleType,
          addedByUsername: session.username,
          createdAt: Date.now(),
        };
        const tags = (await kv.get<VehicleTag[]>("blumeVehicleTags")) || [];
        tags.push(entry);
        await kv.set("blumeVehicleTags", tags);
        res.status(200).json({ vehicleTags: tags.filter((t) => t.userId === userId) });
        return;
      }

      if (action === "removeVehicle") {
        const id = (body.id || "").toString().trim();
        if (!id) {
          res.status(400).send("Missing vehicle tag id.");
          return;
        }
        const tags = (await kv.get<VehicleTag[]>("blumeVehicleTags")) || [];
        const target = tags.find((t) => t.id === id);
        if (!target) {
          res.status(404).send("Vehicle tag not found.");
          return;
        }
        if (target.addedByUsername !== session.username && !isPlatformAdmin(session.userId)) {
          res.status(403).send("You can only remove vehicle tags you added.");
          return;
        }
        const next = tags.filter((t) => t.id !== id);
        await kv.set("blumeVehicleTags", next);
        res.status(200).json({ vehicleTags: next.filter((t) => t.userId === target.userId) });
        return;
      }

      res.status(400).send("Unknown action.");
    } catch (err) {
      res.status(500).send("Action failed: " + (err as Error).message);
    }
    return;
  }

  res.status(405).send("Method not allowed");
}
