import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kv } from "../../lib/kv.js";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import {
  isBlumeAuthorized,
  isBlumeSuperUser,
  resolveRobloxUserId,
  isRobloxGroupMember,
} from "../../lib/roblox.js";
import { containsBlockedLanguage, MODERATION_REJECTION_MESSAGE } from "../../lib/moderation.js";
import { appendAuditLog } from "../../lib/audit.js";
import { isRedlineAuthorized, getRedlineWhitelist } from "../../lib/redline.js";

interface RedlinePunishment {
  id: string;
  targetUserId: string;
  targetUsername: string;
  type: string;
  details: string;
  serviceGroupId: number;
  serviceGroupName: string;
  addedByUserId: string;
  addedByUsername: string;
  createdAt: number;
}

interface BlumeReport {
  id: string;
  title: string;
  body: string;
  authorUsername: string;
  createdAt: number;
  linkedUserId?: string;
  linkedUsername?: string;
  expiresAt?: number;
}

interface BlumeBlogPost {
  id: string;
  title: string;
  excerpt: string;
  readMinutes: number;
  authorUsername: string;
  createdAt: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const type = (req.query.type as string) || "report";
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);

  if (type === "redline") {
    const canAccess = session ? await isRedlineAuthorized(session.userId) : false;
    const isSuperUser = session ? isBlumeSuperUser(session.userId) : false;

    if (req.method === "GET") {
      if (!canAccess) {
        res.status(200).json({ canAccess: false, isSuperUser: false, whitelist: [] });
        return;
      }
      const target = (req.query.target as string) || "";
      if (target) {
        const punishments = ((await kv.get<RedlinePunishment[]>("redlinePunishments")) || [])
          .filter((p) => p.targetUserId === target)
          .sort((a, b) => b.createdAt - a.createdAt);
        res.status(200).json({ punishments });
        return;
      }
      const whitelist = isSuperUser ? await getRedlineWhitelist() : [];
      res.status(200).json({ canAccess: true, isSuperUser, whitelist });
      return;
    }

    if (req.method === "POST") {
      if (!session) {
        res.status(401).send("You must be signed in.");
        return;
      }
      try {
        const body = req.body as {
          action?: string;
          username?: string;
          userId?: string;
          targetUserId?: string;
          targetUsername?: string;
          type?: string;
          details?: string;
          serviceGroupId?: string | number;
        };
        const action = body.action || "";

        if (action === "addWhitelist" || action === "removeWhitelist") {
          if (!isSuperUser) {
            res.status(403).send("Only Redline administrators can manage access.");
            return;
          }
        }

        if (action === "addWhitelist") {
          const rawUsername = (body.username || "").toString().trim();
          if (!rawUsername) {
            res.status(400).send("Missing username.");
            return;
          }
          const resolved = await resolveRobloxUserId(rawUsername);
          if (!resolved) {
            res.status(400).send(`Couldn't find a Roblox user matching "${rawUsername}".`);
            return;
          }
          const list = await getRedlineWhitelist();
          if (list.some((w) => w.userId === resolved.userId)) {
            res.status(400).send(`${resolved.username} already has access.`);
            return;
          }
          const next = [
            ...list,
            {
              userId: resolved.userId,
              username: resolved.username,
              addedByUsername: session.username,
              addedAt: Date.now(),
            },
          ];
          await kv.set("redlineWhitelist", next);
          await appendAuditLog({
            type: "redline_whitelist_added",
            username: session.username,
            detail: `Added ${resolved.username} to Redline access`,
          });
          res.status(200).json({ whitelist: next });
          return;
        }

        if (action === "removeWhitelist") {
          const targetUserId = (body.userId || "").toString().trim();
          if (!targetUserId) {
            res.status(400).send("Missing userId.");
            return;
          }
          const list = await getRedlineWhitelist();
          const removed = list.find((w) => w.userId === targetUserId);
          const next = list.filter((w) => w.userId !== targetUserId);
          await kv.set("redlineWhitelist", next);
          if (removed) {
            await appendAuditLog({
              type: "redline_whitelist_removed",
              username: session.username,
              detail: `Removed ${removed.username} from Redline access`,
            });
          }
          res.status(200).json({ whitelist: next });
          return;
        }

        if (action === "addPunishment") {
          if (!canAccess) {
            res.status(403).send("You do not have clearance to use Redline.");
            return;
          }
          const targetUserId = (body.targetUserId || "").toString().trim();
          const targetUsername = (body.targetUsername || "").toString().trim();
          const punishmentType = (body.type || "").toString().trim();
          const details = (body.details || "").toString().trim();
          const serviceGroupId = Number(body.serviceGroupId);
          if (!targetUserId || !targetUsername) {
            res.status(400).send("Missing target user.");
            return;
          }
          if (!punishmentType) {
            res.status(400).send("Missing punishment type.");
            return;
          }
          if (punishmentType.length > 60) {
            res.status(400).send("Type is too long (max 60 characters).");
            return;
          }
          if (!details) {
            res.status(400).send("Missing details.");
            return;
          }
          if (details.length > 2000) {
            res.status(400).send("Details are too long (max 2000 characters).");
            return;
          }
          if (containsBlockedLanguage(punishmentType) || containsBlockedLanguage(details)) {
            res.status(400).send(MODERATION_REJECTION_MESSAGE);
            return;
          }
          if (!serviceGroupId || Number.isNaN(serviceGroupId)) {
            res.status(400).send("Missing service.");
            return;
          }
          const customGroups =
            (await kv.get<{ id: number; name: string }[]>("blumeCustomGroups")) || [];
          const service = customGroups.find((g) => g.id === serviceGroupId);
          if (!service) {
            res.status(400).send("Unrecognized service.");
            return;
          }
          const isMember = await isRobloxGroupMember(session.userId, serviceGroupId);
          if (!isMember) {
            res.status(403).send(`You are not confirmed as a member of ${service.name}.`);
            return;
          }
          const entry: RedlinePunishment = {
            id: crypto.randomBytes(12).toString("hex"),
            targetUserId,
            targetUsername,
            type: punishmentType,
            details,
            serviceGroupId,
            serviceGroupName: service.name,
            addedByUserId: session.userId,
            addedByUsername: session.username,
            createdAt: Date.now(),
          };
          const punishments = (await kv.get<RedlinePunishment[]>("redlinePunishments")) || [];
          punishments.push(entry);
          await kv.set("redlinePunishments", punishments);
          await appendAuditLog({
            type: "redline_punishment_added",
            username: session.username,
            detail: `Logged ${punishmentType} for ${targetUsername} (${service.name})`,
          });
          res.status(200).json(entry);
          return;
        }

        res.status(400).send("Unknown action.");
      } catch (err) {
        res.status(500).send("Failed: " + (err as Error).message);
      }
      return;
    }

    res.status(405).send("Method not allowed");
    return;
  }

  if (type === "blog") {
    const canEdit = session ? isBlumeSuperUser(session.userId) : false;

    if (req.method === "GET") {
      const posts = ((await kv.get<BlumeBlogPost[]>("blumeBlogPosts")) || []).sort(
        (a, b) => b.createdAt - a.createdAt
      );
      res.status(200).json({ posts, canEdit });
      return;
    }

    if (req.method === "POST") {
      if (!session) {
        res.status(401).send("You must be signed in.");
        return;
      }
      if (!canEdit) {
        res.status(403).send("Only Blume operators can publish to the blog.");
        return;
      }
      try {
        const body = req.body as { title?: string; excerpt?: string; readMinutes?: number };
        const title = (body.title || "").toString().trim();
        const excerpt = (body.excerpt || "").toString().trim();
        const readMinutes = Math.max(1, Math.min(60, Number(body.readMinutes) || 4));
        if (!title || !excerpt) {
          res.status(400).send("Title and excerpt are required.");
          return;
        }
        if (title.length > 160) {
          res.status(400).send("Title is too long (max 160 characters).");
          return;
        }
        if (excerpt.length > 600) {
          res.status(400).send("Excerpt is too long (max 600 characters).");
          return;
        }
        if (containsBlockedLanguage(title) || containsBlockedLanguage(excerpt)) {
          res.status(400).send(MODERATION_REJECTION_MESSAGE);
          return;
        }
        const entry: BlumeBlogPost = {
          id: crypto.randomBytes(12).toString("hex"),
          title,
          excerpt,
          readMinutes,
          authorUsername: session.username,
          createdAt: Date.now(),
        };
        const posts = (await kv.get<BlumeBlogPost[]>("blumeBlogPosts")) || [];
        posts.push(entry);
        await kv.set("blumeBlogPosts", posts);
        await appendAuditLog({
          type: "blume_blog_post",
          username: session.username,
          detail: `Published blog post "${title}"`,
        });
        res.status(200).json(entry);
      } catch (err) {
        res.status(500).send("Failed to publish post: " + (err as Error).message);
      }
      return;
    }

    if (req.method === "DELETE") {
      if (!session) {
        res.status(401).send("You must be signed in.");
        return;
      }
      if (!canEdit) {
        res.status(403).send("Only Blume operators can remove blog posts.");
        return;
      }
      const id = (req.query.id as string) || "";
      if (!id) {
        res.status(400).send("Missing post id.");
        return;
      }
      const posts = (await kv.get<BlumeBlogPost[]>("blumeBlogPosts")) || [];
      const next = posts.filter((p) => p.id !== id);
      await kv.set("blumeBlogPosts", next);
      await appendAuditLog({
        type: "blume_blog_post_deleted",
        username: session.username,
        detail: `Deleted blog post ${id}`,
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).send("Method not allowed");
    return;
  }

  const canAccess = session ? await isBlumeAuthorized(session.userId) : false;
  const isSuperUser = session ? isBlumeSuperUser(session.userId) : false;

  if (req.method === "GET") {
    if (!canAccess) {
      res.status(200).json({ reports: [], canAccess: false, isSuperUser: false });
      return;
    }
    let reports = ((await kv.get<BlumeReport[]>("blumeReports")) || [])
      .filter((r) => !r.expiresAt || r.expiresAt > Date.now())
      .sort((a, b) => b.createdAt - a.createdAt);
    const personId = (req.query.personId as string) || "";
    if (personId) {
      reports = reports.filter((r) => r.linkedUserId === personId);
    }
    res.status(200).json({ reports, canAccess: true, isSuperUser });
    return;
  }

  if (req.method === "POST") {
    if (!session) {
      res.status(401).send("You must be signed in.");
      return;
    }
    if (!canAccess) {
      res.status(403).send("You do not have clearance to file intelligence reports.");
      return;
    }
    try {
      const body = req.body as {
        title?: string;
        content?: string;
        linkedPerson?: string;
        expiresAt?: string;
      };
      const title = (body.title || "").toString().trim();
      const content = (body.content || "").toString().trim();
      const linkedPersonQuery = (body.linkedPerson || "").toString().trim();
      if (!title || !content) {
        res.status(400).send("Title and report body are required.");
        return;
      }
      if (title.length > 200) {
        res.status(400).send("Title is too long (max 200 characters).");
        return;
      }
      if (content.length > 5000) {
        res.status(400).send("Report is too long (max 5000 characters).");
        return;
      }
      if (containsBlockedLanguage(title) || containsBlockedLanguage(content)) {
        res.status(400).send(MODERATION_REJECTION_MESSAGE);
        return;
      }
      let expiresAt: number | undefined;
      const expiresAtRaw = (body.expiresAt || "").toString().trim();
      if (expiresAtRaw) {
        const parsed = new Date(`${expiresAtRaw}T23:59:59`).getTime();
        if (Number.isNaN(parsed)) {
          res.status(400).send("Invalid expiry date.");
          return;
        }
        expiresAt = parsed;
      }
      let linkedUserId: string | undefined;
      let linkedUsername: string | undefined;
      if (linkedPersonQuery) {
        const resolved = await resolveRobloxUserId(linkedPersonQuery);
        if (!resolved) {
          res
            .status(400)
            .send(`Couldn't find a Roblox user matching "${linkedPersonQuery}" to link this report to.`);
          return;
        }
        linkedUserId = resolved.userId;
        linkedUsername = resolved.username;
      }
      const entry: BlumeReport = {
        id: crypto.randomBytes(12).toString("hex"),
        title,
        body: content,
        authorUsername: session.username,
        createdAt: Date.now(),
        ...(linkedUserId ? { linkedUserId, linkedUsername } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      };
      const reports = (await kv.get<BlumeReport[]>("blumeReports")) || [];
      reports.push(entry);
      await kv.set("blumeReports", reports);
      await appendAuditLog({
        type: "blume_report",
        username: session.username,
        detail: `Filed report "${title}"`,
      });
      res.status(200).json(entry);
    } catch (err) {
      res.status(500).send("Failed to save report: " + (err as Error).message);
    }
    return;
  }

  if (req.method === "DELETE") {
    if (!session) {
      res.status(401).send("You must be signed in.");
      return;
    }
    if (!canAccess) {
      res.status(403).send("You do not have clearance to remove intelligence reports.");
      return;
    }
    const id = (req.query.id as string) || "";
    if (!id) {
      res.status(400).send("Missing report id.");
      return;
    }
    const reports = (await kv.get<BlumeReport[]>("blumeReports")) || [];
    const next = reports.filter((r) => r.id !== id);
    await kv.set("blumeReports", next);
    await appendAuditLog({
      type: "blume_report_deleted",
      username: session.username,
      detail: `Deleted report ${id}`,
    });
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).send("Method not allowed");
}
