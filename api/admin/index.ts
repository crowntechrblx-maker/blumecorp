import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import { isPlatformAdmin, getMemberGroupNames } from "../../lib/roblox.js";
import { findKnownUser } from "../../lib/known-users.js";
import { getAuditLog } from "../../lib/audit.js";
import { getBans, addBan, removeBan } from "../../lib/bans.js";
import { kv } from "../../lib/kv.js";

interface MessageEntry {
  id: string;
  conversationKey: string;
  fromUsername: string;
  toUsername: string;
  text: string;
  createdAt: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);

  if (!session) {
    res.status(401).send("You must be signed in.");
    return;
  }
  if (!isPlatformAdmin(session.userId)) {
    res.status(403).send("You do not have admin access.");
    return;
  }

  if (req.method === "GET") {
    const checkTarget = (req.query.checkTarget as string) || "";
    if (checkTarget) {
      const target = await findKnownUser(checkTarget);
      if (!target) {
        res.status(404).json({ found: false });
        return;
      }
      const isProtected = isPlatformAdmin(target.userId);
      const groupNames = isProtected ? [] : await getMemberGroupNames(target.userId);
      res.status(200).json({
        found: true,
        userId: target.userId,
        username: target.username,
        avatarUrl: target.avatarUrl,
        isProtected,
        groupNames,
      });
      return;
    }

    const [auditLog, bans, allMessages] = await Promise.all([
      getAuditLog(300),
      getBans(),
      kv.get<MessageEntry[]>("messages"),
    ]);
    const messages = (allMessages || [])
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 300)
      .map((m) => ({
        id: m.id,
        from: m.fromUsername,
        to: m.toUsername,
        text: m.text,
        createdAt: m.createdAt,
      }));
    res.status(200).json({
      isAdmin: true,
      auditLog,
      bans,
      messages,
    });
    return;
  }

  if (req.method === "POST") {
    try {
      const body = req.body as { action?: string; target?: string };
      const action = body.action || "";

      if (action === "ban" || action === "unban") {
        const targetQuery = (body.target || "").toString().trim();
        if (!targetQuery) {
          res.status(400).send("Missing target username or user ID.");
          return;
        }
        const target = await findKnownUser(targetQuery);
        if (!target) {
          res.status(404).send("No one matching that username or user ID has signed into Westbridge OS.");
          return;
        }
        if (action === "ban") {
          if (isPlatformAdmin(target.userId)) {
            res.status(403).send("Platform admins can't be banned.");
            return;
          }
          await addBan({
            userId: target.userId,
            username: target.username,
            bannedByUsername: session.username,
            createdAt: Date.now(),
          });
        } else {
          await removeBan(target.userId);
        }
        const bans = await getBans();
        res.status(200).json({ bans });
        return;
      }

      res.status(400).send("Unknown action.");
    } catch (err) {
      res.status(500).send("Admin action failed: " + (err as Error).message);
    }
    return;
  }

  res.status(405).send("Method not allowed");
}
