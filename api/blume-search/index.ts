import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kv } from "../../lib/kv.js";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import {
  isBlumeAuthorized,
  isPlatformAdmin,
  getRobloxAvatarUrl,
  getUserGroupIds,
  resolveRobloxUserId,
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

const HISTORY_PER_PERSON_CAP = 20;

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
    let arrests: unknown = null;
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
        arrests = playerData.Arrests ?? null;
        arrestHistory = playerData.ArrestHistory ?? null;
      }
    } catch (err) {
      apiError = "Couldn't reach the records API: " + (err as Error).message;
    }

    const vehicleTags = ((await kv.get<VehicleTag[]>("blumeVehicleTags")) || []).filter(
      (v) => v.userId === userId
    );

    // Cache a snapshot of the photo + plate for "View Previous" — only when
    // we actually got something worth remembering.
    if (avatarUrl || customPlate) {
      const allHistory = (await kv.get<SearchSnapshot[]>("blumeSearchHistory")) || [];
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
      const mine = [entry, ...allHistory.filter((h) => h.userId === userId)]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, HISTORY_PER_PERSON_CAP);
      await kv.set("blumeSearchHistory", [...others, ...mine]);
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
      arrests,
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
      };
      const action = body.action || "";

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
