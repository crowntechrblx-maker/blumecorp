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
  extractGroupId,
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

// One row per Roblox user ever swept up by a Group Search scan — their full
// group membership list plus whatever the records API knows, so Group
// Viewer can answer "who in this subgroup have we already seen" without
// re-scanning anything.
interface GroupScanEntry {
  userId: string;
  username: string;
  avatarUrl: string | null;
  customPlate: string | null;
  groupIds: number[];
  scannedAt: number;
}

const HISTORY_PER_PERSON_CAP = 20;
// Skip re-fetching a member's data if we scanned them within this window,
// unless the caller explicitly asks to force a refresh — makes it cheap to
// stop and re-run a big group scan without redoing all the finished work.
const GROUP_SCAN_FRESH_MS = 6 * 60 * 60 * 1000;

function relevantGroups(groupIds: number[]) {
  return groupIds
    .filter((id) => id in PERSON_SEARCH_GROUPS)
    .map((id) => ({ id, ...PERSON_SEARCH_GROUPS[id] }));
}

// This endpoint doubles up on both Person Search and its vehicle tagging
// (via ?history= and the POST actions below) to avoid adding yet another
// file under the Vercel Hobby 12-function cap.
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    // Group Search: page through a Roblox group's member list. Restricted to
    // the 3 super users since this is the on-ramp for bulk-scanning real
    // people's data, not a general Person Search capability.
    const groupMembersOf = (req.query.groupMembers as string) || "";
    if (groupMembersOf) {
      if (!isBlumeSuperUser(session.userId)) {
        res.status(403).send("Group Search is restricted to Blume operators.");
        return;
      }
      const cursor = (req.query.cursor as string) || "";
      const groupId = extractGroupId(groupMembersOf);
      try {
        const url = `https://groups.roblox.com/v1/groups/${encodeURIComponent(groupId)}/users?limit=100${
          cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
        }`;
        const groupRes = await fetch(url);
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

    // Group Viewer: which already-scanned members belong to a given group.
    const groupScanOf = (req.query.groupScan as string) || "";
    if (groupScanOf) {
      if (!isBlumeSuperUser(session.userId)) {
        res.status(403).send("Group Viewer is restricted to Blume operators.");
        return;
      }
      const groupId = Number(extractGroupId(groupScanOf));
      const all = (await kv.get<GroupScanEntry[]>("blumeGroupScanCache")) || [];
      const members = all
        .filter((m) => m.groupIds.includes(groupId))
        .sort((a, b) => b.scannedAt - a.scannedAt)
        .map((m) => ({ ...m, relevantGroups: relevantGroups(m.groupIds) }));
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

    const [avatarUrl, groupIds] = await Promise.all([
      getRobloxAvatarUrl(userId),
      getUserGroupIds(userId),
    ]);
    const groups = relevantGroups(groupIds);

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
      };
      const action = body.action || "";

      if (action === "scanMember") {
        if (!isBlumeSuperUser(session.userId)) {
          res.status(403).send("Group Search is restricted to Blume operators.");
          return;
        }
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
        const [avatarUrl, groupIds] = await Promise.all([
          getRobloxAvatarUrl(userId),
          getUserGroupIds(userId),
        ]);

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

        const entry: GroupScanEntry = {
          userId,
          username,
          avatarUrl,
          customPlate,
          groupIds,
          scannedAt: Date.now(),
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
