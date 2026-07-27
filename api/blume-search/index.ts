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
  PERSON_SEARCH_GROUPS,
} from "../../lib/roblox.js";
import { containsBlockedLanguage, MODERATION_REJECTION_MESSAGE } from "../../lib/moderation.js";
import { appendAuditLog } from "../../lib/audit.js";

// The user's own read-only Roblox-side API (not ours) — it's what actually
// holds arrest/plate data. See message.txt for the Lua snippet this mirrors.
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

// One row per Roblox user ever swept up by a group search — their full
// group membership list, friends who are ALSO already in this same cache
// (never a friend who's never been scanned/searched), plus whatever the
// records API knows. `changed` records what was different from the last
// time this same person was scanned, so Person Search can flag it.
interface GroupScanEntry {
  userId: string;
  username: string;
  avatarUrl: string | null;
  customPlate: string | null;
  groupIds: number[];
  friends: { userId: string; username: string }[];
  scannedAt: number;
  changed?: { username: boolean; groups: boolean; friends: boolean; at: number } | null;
}

// Groups users have added on top of the built-in PERSON_SEARCH_GROUPS list,
// via the Group Settings tab. Stored separately so the built-in list never
// needs a code change to extend.
interface CustomGroup {
  id: number;
  name: string;
  tier: "red" | "white";
}

const HISTORY_PER_PERSON_CAP = 20;
// Skip re-fetching a member's data if we scanned them within this window,
// unless the caller explicitly asks to force a refresh — makes it cheap to
// stop and re-run a big group scan without redoing all the finished work.
const GROUP_SCAN_FRESH_MS = 6 * 60 * 60 * 1000;

async function getGroupCatalog(): Promise<Record<number, { name: string; tier: "red" | "white" }>> {
  const custom = (await kv.get<CustomGroup[]>("blumeCustomGroups")) || [];
  const merged: Record<number, { name: string; tier: "red" | "white" }> = { ...PERSON_SEARCH_GROUPS };
  for (const c of custom) merged[c.id] = { name: c.name, tier: c.tier };
  return merged;
}

function relevantGroups(
  groupIds: number[],
  catalog: Record<number, { name: string; tier: "red" | "white" }>
) {
  return groupIds
    .filter((id) => id in catalog)
    .map((id) => ({ id, ...catalog[id] }))
    .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "red" ? -1 : 1));
}

// The four agencies "Active Field Agents" watches for. Kept separate from
// PERSON_SEARCH_GROUPS/BLUME_GROUP_IDS since it's its own specific list, not
// tied to Blume-access grants or the red/white tiering.
const AGENT_GROUPS: { id: number; label: string }[] = [
  { id: 187507831, label: "CIA" },
  { id: 154853936, label: "MI5" },
  { id: 685466511, label: "MI6" },
  { id: 315987361, label: "ROCU" },
];

// The game's Place ID isn't stable (the user's said the link changes), so
// it's an editable setting rather than a constant — the 3 super users can
// update it from the dashboard instead of needing a code change each time.
interface BlumeSettings {
  activeGamePlaceId?: string;
}

async function loadBlumeSettings(): Promise<BlumeSettings> {
  return (await kv.get<BlumeSettings>("blumeSettings")) || {};
}

// Live server roster reported directly by an in-game script (HttpService),
// via POST ?action=reportServerPlayers — a real player list rather than a
// guess built from Roblox's presence API against a partial known-user
// cache. Treated as stale (and ignored) if nothing's come in for a while,
// so a stopped script doesn't leave a frozen roster on screen forever.
interface ServerPresenceReport {
  placeId: string | null;
  players: { userId: string; username: string }[];
  updatedAt: number;
}
const SERVER_PRESENCE_STALE_MS = 3 * 60 * 1000; // 3 min — script reports every 120s

// Read-only mirrors of api/messages and api/posts' own KV record shapes,
// used solely by Monitoring below — kept local rather than imported so this
// file doesn't need to reach into another function's module.
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

// Shared by Active Users and the Surveillance Grid's in-game list: batches
// candidates through Roblox's presence API (100 at a time, its own limit)
// and returns whichever ones are actually in a game right now, optionally
// narrowed to one specific game.
async function findInGamePresence(
  candidates: GroupScanEntry[],
  gamePlaceId: number | null
): Promise<GroupScanEntry[]> {
  const inGame: GroupScanEntry[] = [];
  for (let i = 0; i < candidates.length; i += 100) {
    const batch = candidates.slice(i, i + 100);
    const presRes = await fetch("https://presence.roblox.com/v1/presence/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...robloxHeaders() },
      body: JSON.stringify({ userIds: batch.map((m) => Number(m.userId)) }),
    });
    if (!presRes.ok) continue;
    const data = (await presRes.json()) as {
      userPresences?: {
        userId?: number;
        userPresenceType?: number;
        rootPlaceId?: number;
        placeId?: number;
      }[];
    };
    for (const p of data.userPresences || []) {
      if (p.userPresenceType !== 2) continue; // 2 = actually in a game
      if (gamePlaceId && p.rootPlaceId !== gamePlaceId && p.placeId !== gamePlaceId) continue;
      const member = batch.find((m) => Number(m.userId) === p.userId);
      if (member) inGame.push(member);
    }
  }
  return inGame;
}

// This endpoint doubles up on both Person Search and its vehicle tagging
// (via ?history= and the POST actions below) to avoid adding yet another
// file under the Vercel Hobby 12-function cap.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Server roster ingest: an in-game script (HttpService), not a logged-in
  // dashboard user, calls this — so it's checked before the session/cookie
  // gate below and authenticated by its own shared secret instead.
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
        .slice(0, 300); // sanity cap — no server realistically has more players than this
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
  if (!(await isBlumeAuthorized(session.userId))) {
    res.status(403).send("You do not have clearance to use Person Search.");
    return;
  }

  if (req.method === "GET") {
    // Active Field Agents: of everyone we've ever scanned into the group
    // cache who belongs to CIA/MI5/MI6/ROCU, which ones does Roblox's
    // presence API say are actually in a game right now. Only covers people
    // who've been swept up by a Group Search scan of one of those groups —
    // it can't see members it's never encountered.
    if (req.query.activeAgents) {
      const settings = await loadBlumeSettings();
      const gamePlaceId = settings.activeGamePlaceId
        ? Number(settings.activeGamePlaceId)
        : null;
      const agentGroupIds = AGENT_GROUPS.map((g) => g.id);
      const all = (await kv.get<GroupScanEntry[]>("blumeGroupScanCache")) || [];
      const candidates = all.filter((m) => m.groupIds.some((id) => agentGroupIds.includes(id)));
      if (candidates.length === 0) {
        res.status(200).json({ agents: [], gamePlaceId: settings.activeGamePlaceId || null });
        return;
      }
      try {
        const inGame = await findInGamePresence(candidates, gamePlaceId);
        const agents = inGame.map((member) => ({
          username: member.username,
          role: AGENT_GROUPS.filter((g) => member.groupIds.includes(g.id))
            .map((g) => g.label)
            .join(" / "),
        }));
        res.status(200).json({ agents, gamePlaceId: settings.activeGamePlaceId || null });
      } catch (err) {
        res.status(500).send("Couldn't reach Roblox's presence API: " + (err as Error).message);
      }
      return;
    }

    // Field Activity's in-game list: everyone we've ever scanned (any
    // group, not just the agent ones) who's actually in a game right now.
    // Anyone in a red-tier group gets that group's name attached (same as
    // Person Search / Group Viewer), and anyone in one of the 4 agent
    // groups gets their role attached too — one merged list rather than a
    // separate "Active agents" section. Red-tier people sort to the top.
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

      // Prefer the live roster an in-game script reports directly — it's
      // the real server player list, not limited to people we've already
      // scanned. Only trust it while it's still fresh.
      const liveReport = await kv.get<ServerPresenceReport>("blumeServerPresence");
      if (liveReport && Date.now() - liveReport.updatedAt < SERVER_PRESENCE_STALE_MS) {
        const users = sortUsers(liveReport.players.map((p) => tagMember(p.userId, p.username, null)));
        res.status(200).json({ users, live: true, updatedAt: liveReport.updatedAt });
        return;
      }

      // Fallback: no live script feed available, so fall back to the old
      // approach — everyone we've ever scanned, cross-referenced against
      // Roblox's presence API.
      const settings = await loadBlumeSettings();
      const gamePlaceId = settings.activeGamePlaceId
        ? Number(settings.activeGamePlaceId)
        : null;
      if (scanCache.length === 0) {
        res.status(200).json({ users: [], live: false });
        return;
      }
      try {
        const inGame = await findInGamePresence(scanCache, gamePlaceId);
        const users = sortUsers(inGame.map((m) => tagMember(m.userId, m.username, m.avatarUrl)));
        res.status(200).json({ users, live: false });
      } catch (err) {
        res.status(500).send("Couldn't reach Roblox's presence API: " + (err as Error).message);
      }
      return;
    }

    // Every known group, built-in + anything added via the Group Settings
    // tab — feeds that tab's list and the "browse a group" quick-picks.
    if (req.query.groupCatalog) {
      const catalog = await getGroupCatalog();
      const groups = Object.entries(catalog)
        .map(([id, g]) => ({ id: Number(id), name: g.name, tier: g.tier }))
        .sort((a, b) => (a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier === "red" ? -1 : 1));
      res.status(200).json({ groups });
      return;
    }

    // Monitoring: every user who's ever sent a message or posted, read
    // straight out of the messages/posts KV stores (including rows flagged
    // deleted — nothing is ever actually erased from those two stores).
    // Restricted to the 3 super users, unlike most of the rest of Blume —
    // this reads private message content, not public Roblox data.
    if (req.query.monitoringUsers) {
      if (!isBlumeSuperUser(session.userId)) {
        res.status(403).send("Only Blume operators can use Monitoring.");
        return;
      }
      const catalog = await getGroupCatalog();
      const scanCache = (await kv.get<GroupScanEntry[]>("blumeGroupScanCache")) || [];
      const scanByLowerUsername = new Map(scanCache.map((s) => [s.username.toLowerCase(), s]));
      const [messages, posts] = await Promise.all([
        kv.get<MonitoringMessageEntry[]>("messages"),
        kv.get<MonitoringPostEntry[]>("posts"),
      ]);
      const names = new Set<string>();
      for (const m of messages || []) {
        names.add(m.fromUsername);
        names.add(m.toUsername);
      }
      for (const p of posts || []) names.add(p.authorUsername);
      const users = Array.from(names)
        .map((username) => {
          const scan = scanByLowerUsername.get(username.toLowerCase());
          const redGroup = scan ? relevantGroups(scan.groupIds, catalog).find((g) => g.tier === "red") : undefined;
          return { username, redGroupName: redGroup?.name || null };
        })
        .sort((a, b) => {
          if (!!a.redGroupName !== !!b.redGroupName) return a.redGroupName ? -1 : 1;
          return a.username.localeCompare(b.username);
        });
      res.status(200).json({ users });
      return;
    }

    // Monitoring: everything a given username has ever sent — every DM
    // conversation they're part of (grouped by the other person), and
    // every post they've made. Includes deleted rows (flagged, not text
    // shown separately so the reviewer can see exactly what was deleted).
    const monitoringChatsOf = (req.query.monitoringChats as string) || "";
    if (monitoringChatsOf) {
      if (!isBlumeSuperUser(session.userId)) {
        res.status(403).send("Only Blume operators can use Monitoring.");
        return;
      }
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

      res.status(200).json({ conversations, posts: myPosts });
      return;
    }

    // Group Search: page through a Roblox group's member list. Open to
    // anyone with Blume clearance (not just the 3 super users) — Group
    // Search and Group Viewer are now one consolidated feature.
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

    // Group Viewer half of the consolidated feature: which already-scanned
    // members belong to a given group. Open to anyone with Blume clearance.
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

    // Friends who are ALREADY in our system — someone else has searched
    // them before, or they've been swept up by a Group Search scan. Never
    // look up or list a friend who isn't already known to us; the point is
    // cross-referencing existing records, not expanding who we track.
    const [allHistoryForFriends, groupScanForFriends, friends] = await Promise.all([
      kv.get<SearchSnapshot[]>("blumeSearchHistory"),
      kv.get<GroupScanEntry[]>("blumeGroupScanCache"),
      getRobloxFriends(userId),
    ]);
    const historyList = allHistoryForFriends || [];
    const scanList = groupScanForFriends || [];
    const knownAvatarByUserId = new Map<string, string | null>();
    for (const h of historyList) knownAvatarByUserId.set(h.userId, h.avatarUrl);
    for (const s of scanList) knownAvatarByUserId.set(s.userId, s.avatarUrl);
    const scanByUserId = new Map<string, GroupScanEntry>();
    for (const s of scanList) scanByUserId.set(s.userId, s);
    const knownIds = new Set<string>([...historyList.map((h) => h.userId), ...scanList.map((s) => s.userId)]);
    // A friend flagged in red if THEY belong to a red-tier group — we only
    // know a friend's groups if they've themselves been through a group
    // scan (search history alone doesn't carry group membership).
    const knownFriends = friends
      .filter((f) => f.userId !== userId && knownIds.has(f.userId))
      .map((f) => {
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

    // If this person has themselves been through a group scan before, carry
    // forward whatever changed the last time they were re-scanned (username,
    // groups, or their known-friends list), so Person Search can flag it.
    const ownScanEntry = scanList.find((s) => s.userId === userId);
    const groupScanChange = ownScanEntry?.changed || null;

    // Cache a snapshot of the photo + plate for "View Previous" — only when
    // we actually got something worth remembering, and only when it's
    // actually different from the last thing we cached for this person (no
    // point logging a new entry every time someone searches and nothing
    // about their photo or plate has changed).
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
      vehicleTags,
      knownFriends,
      groupScanChange,
      apiError,
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
        groupTier?: string;
      };
      const action = body.action || "";

      if (action === "addCustomGroup") {
        const groupId = Number((body.groupId || "").toString().trim());
        const groupName = (body.groupName || "").toString().trim();
        const groupTier = (body.groupTier || "").toString().trim();
        if (!groupId || Number.isNaN(groupId)) {
          res.status(400).send("Group ID must be numeric.");
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
        if (groupTier !== "red" && groupTier !== "white") {
          res.status(400).send('Tier must be "red" or "white".');
          return;
        }
        if (containsBlockedLanguage(groupName)) {
          res.status(400).send(MODERATION_REJECTION_MESSAGE);
          return;
        }
        const custom = (await kv.get<CustomGroup[]>("blumeCustomGroups")) || [];
        const next = [
          ...custom.filter((c) => c.id !== groupId),
          { id: groupId, name: groupName, tier: groupTier as "red" | "white" },
        ];
        await kv.set("blumeCustomGroups", next);
        await appendAuditLog({
          type: "blume_group_added",
          username: session.username,
          detail: `Added ${groupTier} group "${groupName}" (${groupId})`,
        });
        res.status(200).json({ group: { id: groupId, name: groupName, tier: groupTier } });
        return;
      }

      if (action === "setActiveGamePlaceId") {
        if (!isBlumeSuperUser(session.userId)) {
          res.status(403).send("Only Blume operators can change this.");
          return;
        }
        const placeId = (body.placeId || "").toString().trim();
        if (placeId && !/^\d+$/.test(placeId)) {
          res.status(400).send("Place ID must be numeric (or blank to clear it).");
          return;
        }
        const settings = await loadBlumeSettings();
        settings.activeGamePlaceId = placeId || undefined;
        await kv.set("blumeSettings", settings);
        res.status(200).json({ activeGamePlaceId: settings.activeGamePlaceId || null });
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

        const resolved = await resolveRobloxUserId(userId);
        const username = resolved?.username || existing?.username || userId;
        const [avatarUrl, groupIds, friendsRaw] = await Promise.all([
          getRobloxAvatarUrl(userId),
          getUserGroupIds(userId),
          getRobloxFriends(userId),
        ]);

        // Only keep friends who've ALSO already been through a group scan —
        // never a friend we've never otherwise encountered.
        const knownScanIds = new Set(all.map((m) => m.userId));
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
          // Best-effort — a scan that can't reach the records API still logs
          // groups + photo rather than failing the whole member.
        }

        // Compare against whatever we had on file before, so a re-scan can
        // flag exactly what changed (surfaced later on Person Search).
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

        const entry: GroupScanEntry = {
          userId,
          username,
          avatarUrl,
          customPlate,
          groupIds,
          friends,
          scannedAt: Date.now(),
          changed,
        };
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
