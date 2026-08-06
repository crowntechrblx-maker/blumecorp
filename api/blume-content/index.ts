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
  getRobloxAvatarUrl,
} from "../../lib/roblox.js";
import { containsBlockedLanguage, MODERATION_REJECTION_MESSAGE } from "../../lib/moderation.js";
import { appendAuditLog } from "../../lib/audit.js";
import { isVerifileAuthorized, getVerifileWhitelist } from "../../lib/verifile.js";
import { isPlatformAdmin } from "../../lib/admins.js";

const HMRC_GROUP_ID = 567563234;
const HMRC_LOG_TYPES = ["Information", "Arrest by HMRC", "Money Laundering", "Tax Evasion", "Fraud", "Cleared"];

interface VerifilePunishment {
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

interface ThamesWaterJob {
  id: string;
  title: string;
  department: string;
  description: string;
  postedByUsername: string;
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

interface HmrcCard {
  id: string;
  targetUserId: string;
  targetUsername: string;
  riskLevel: string;
  riskNotes: string;
  createdByUserId: string;
  createdByUsername: string;
  createdAt: number;
}

interface HmrcLogEntry {
  id: string;
  cardId: string;
  targetUserId: string;
  targetUsername: string;
  type: string;
  details: string;
  loggedByUserId: string;
  loggedByUsername: string;
  createdAt: number;
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

  if (type === "verifile") {
    const canAccess = session ? await isVerifileAuthorized(session.userId) : false;
    const isSuperUser = session ? isBlumeSuperUser(session.userId) : false;

    if (req.method === "GET") {
      if (!canAccess) {
        res.status(200).json({ canAccess: false, isSuperUser: false, whitelist: [] });
        return;
      }
      const target = (req.query.target as string) || "";
      if (target) {
        const punishments = ((await kv.get<VerifilePunishment[]>("verifilePunishments")) || [])
          .filter((p) => p.targetUserId === target)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((p) => ({
            ...p,
            canDelete: isSuperUser || p.addedByUserId === session!.userId,
          }));
        res.status(200).json({ punishments });
        return;
      }
      const whitelist = isSuperUser ? await getVerifileWhitelist() : [];
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
            res.status(403).send("Only Verifile administrators can manage access.");
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
          const list = await getVerifileWhitelist();
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
          await kv.set("verifileWhitelist", next);
          await appendAuditLog({
            type: "verifile_whitelist_added",
            username: session.username,
            detail: `Added ${resolved.username} to Verifile access`,
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
          const list = await getVerifileWhitelist();
          const removed = list.find((w) => w.userId === targetUserId);
          const next = list.filter((w) => w.userId !== targetUserId);
          await kv.set("verifileWhitelist", next);
          if (removed) {
            await appendAuditLog({
              type: "verifile_whitelist_removed",
              username: session.username,
              detail: `Removed ${removed.username} from Verifile access`,
            });
          }
          res.status(200).json({ whitelist: next });
          return;
        }

        if (action === "addPunishment") {
          if (!canAccess) {
            res.status(403).send("You do not have clearance to use Verifile.");
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
          const entry: VerifilePunishment = {
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
          const punishments = (await kv.get<VerifilePunishment[]>("verifilePunishments")) || [];
          punishments.push(entry);
          await kv.set("verifilePunishments", punishments);
          await appendAuditLog({
            type: "verifile_punishment_added",
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

    if (req.method === "DELETE") {
      if (!session) {
        res.status(401).send("You must be signed in.");
        return;
      }
      if (!canAccess) {
        res.status(403).send("You do not have clearance to use Verifile.");
        return;
      }
      const id = (req.query.id as string) || "";
      if (!id) {
        res.status(400).send("Missing entry id.");
        return;
      }
      const punishments = (await kv.get<VerifilePunishment[]>("verifilePunishments")) || [];
      const target = punishments.find((p) => p.id === id);
      if (!target) {
        res.status(404).send("Entry not found.");
        return;
      }
      if (!isSuperUser && target.addedByUserId !== session.userId) {
        res.status(403).send("You can only remove entries you logged.");
        return;
      }
      const next = punishments.filter((p) => p.id !== id);
      await kv.set("verifilePunishments", next);
      await appendAuditLog({
        type: "verifile_punishment_removed",
        username: session.username,
        detail: `Removed ${target.type} for ${target.targetUsername} (${target.serviceGroupName})`,
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).send("Method not allowed");
    return;
  }

  if (type === "hmrc") {
    const canAccess = session
      ? (await isPlatformAdmin(session.userId, session.username)) ||
        (await isRobloxGroupMember(session.userId, HMRC_GROUP_ID))
      : false;
    const isAdmin = session ? await isPlatformAdmin(session.userId, session.username) : false;

    if (req.method === "GET") {
      if (!canAccess) {
        res.status(200).json({ canAccess: false, isAdmin: false, cards: [] });
        return;
      }
      const cardId = (req.query.cardId as string) || "";
      if (cardId) {
        const logEntries = ((await kv.get<HmrcLogEntry[]>("hmrcLogEntries")) || [])
          .filter((l) => l.cardId === cardId)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((l) => ({
            ...l,
            canDelete: isAdmin || l.loggedByUserId === session!.userId,
          }));
        res.status(200).json({ logEntries });
        return;
      }
      const rawCards = ((await kv.get<HmrcCard[]>("hmrcCards")) || []).sort(
        (a, b) => b.createdAt - a.createdAt
      );
      const cards = await Promise.all(
        rawCards.map(async (c) => ({
          ...c,
          avatarUrl: await getRobloxAvatarUrl(c.targetUserId),
          canDelete: isAdmin || c.createdByUserId === session!.userId,
        }))
      );
      res.status(200).json({ canAccess: true, isAdmin, cards });
      return;
    }

    if (req.method === "POST") {
      if (!session) {
        res.status(401).send("You must be signed in.");
        return;
      }
      if (!canAccess) {
        res.status(403).send("You do not have HMRC clearance.");
        return;
      }
      try {
        const body = req.body as {
          action?: string;
          username?: string;
          cardId?: string;
          riskLevel?: string;
          riskNotes?: string;
          targetUserId?: string;
          targetUsername?: string;
          type?: string;
          details?: string;
        };
        const action = body.action || "";

        if (action === "addCard") {
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
          const cards = (await kv.get<HmrcCard[]>("hmrcCards")) || [];
          if (cards.some((c) => c.targetUserId === resolved.userId)) {
            res.status(400).send(`${resolved.username} already has a case file.`);
            return;
          }
          const entry: HmrcCard = {
            id: crypto.randomBytes(12).toString("hex"),
            targetUserId: resolved.userId,
            targetUsername: resolved.username,
            riskLevel: "Low",
            riskNotes: "",
            createdByUserId: session.userId,
            createdByUsername: session.username,
            createdAt: Date.now(),
          };
          const next = [...cards, entry];
          await kv.set("hmrcCards", next);
          await appendAuditLog({
            type: "hmrc_card_added",
            username: session.username,
            detail: `Opened an HMRC case for ${resolved.username}`,
          });
          const withAvatars = await Promise.all(
            next.map(async (c) => ({
              ...c,
              avatarUrl: await getRobloxAvatarUrl(c.targetUserId),
              canDelete: true,
            }))
          );
          res.status(200).json({ cards: withAvatars });
          return;
        }

        if (action === "updateRisk") {
          const cardId = (body.cardId || "").toString().trim();
          const riskLevel = (body.riskLevel || "").toString().trim();
          const riskNotes = (body.riskNotes || "").toString().trim();
          if (!cardId) {
            res.status(400).send("Missing case id.");
            return;
          }
          if (!["Low", "Medium", "High", "Critical"].includes(riskLevel)) {
            res.status(400).send("Invalid risk level.");
            return;
          }
          if (riskNotes.length > 2000) {
            res.status(400).send("Risk notes are too long (max 2000 characters).");
            return;
          }
          if (containsBlockedLanguage(riskNotes)) {
            res.status(400).send(MODERATION_REJECTION_MESSAGE);
            return;
          }
          const cards = (await kv.get<HmrcCard[]>("hmrcCards")) || [];
          const index = cards.findIndex((c) => c.id === cardId);
          if (index === -1) {
            res.status(404).send("Case not found.");
            return;
          }
          cards[index] = { ...cards[index], riskLevel, riskNotes };
          await kv.set("hmrcCards", cards);
          await appendAuditLog({
            type: "hmrc_risk_updated",
            username: session.username,
            detail: `Set risk level ${riskLevel} for ${cards[index].targetUsername}`,
          });
          const withAvatars = await Promise.all(
            cards.map(async (c) => ({
              ...c,
              avatarUrl: await getRobloxAvatarUrl(c.targetUserId),
              canDelete: isAdmin || c.createdByUserId === session.userId,
            }))
          );
          res.status(200).json({ cards: withAvatars });
          return;
        }

        if (action === "addLog") {
          const cardId = (body.cardId || "").toString().trim();
          const targetUserId = (body.targetUserId || "").toString().trim();
          const targetUsername = (body.targetUsername || "").toString().trim();
          const logType = (body.type || "").toString().trim();
          const details = (body.details || "").toString().trim();
          if (!cardId || !targetUserId || !targetUsername) {
            res.status(400).send("Missing case.");
            return;
          }
          if (!HMRC_LOG_TYPES.includes(logType)) {
            res.status(400).send("Invalid log type.");
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
          if (containsBlockedLanguage(details)) {
            res.status(400).send(MODERATION_REJECTION_MESSAGE);
            return;
          }
          const entry: HmrcLogEntry = {
            id: crypto.randomBytes(12).toString("hex"),
            cardId,
            targetUserId,
            targetUsername,
            type: logType,
            details,
            loggedByUserId: session.userId,
            loggedByUsername: session.username,
            createdAt: Date.now(),
          };
          const logEntries = (await kv.get<HmrcLogEntry[]>("hmrcLogEntries")) || [];
          logEntries.push(entry);
          await kv.set("hmrcLogEntries", logEntries);
          await appendAuditLog({
            type: "hmrc_log_added",
            username: session.username,
            detail: `Logged ${logType} for ${targetUsername}`,
          });
          res.status(200).json({ ...entry, canDelete: true });
          return;
        }

        res.status(400).send("Unknown action.");
      } catch (err) {
        res.status(500).send("Failed: " + (err as Error).message);
      }
      return;
    }

    if (req.method === "DELETE") {
      if (!session) {
        res.status(401).send("You must be signed in.");
        return;
      }
      if (!canAccess) {
        res.status(403).send("You do not have HMRC clearance.");
        return;
      }
      const cardId = (req.query.cardId as string) || "";
      if (cardId) {
        const cards = (await kv.get<HmrcCard[]>("hmrcCards")) || [];
        const target = cards.find((c) => c.id === cardId);
        if (!target) {
          res.status(404).send("Case not found.");
          return;
        }
        if (!isAdmin && target.createdByUserId !== session.userId) {
          res.status(403).send("You can only remove cases you opened.");
          return;
        }
        await kv.set(
          "hmrcCards",
          cards.filter((c) => c.id !== cardId)
        );
        const logEntries = (await kv.get<HmrcLogEntry[]>("hmrcLogEntries")) || [];
        await kv.set(
          "hmrcLogEntries",
          logEntries.filter((l) => l.cardId !== cardId)
        );
        await appendAuditLog({
          type: "hmrc_card_removed",
          username: session.username,
          detail: `Closed the HMRC case for ${target.targetUsername}`,
        });
        res.status(200).json({ ok: true });
        return;
      }

      const id = (req.query.id as string) || "";
      if (!id) {
        res.status(400).send("Missing entry id.");
        return;
      }
      const logEntries = (await kv.get<HmrcLogEntry[]>("hmrcLogEntries")) || [];
      const target = logEntries.find((l) => l.id === id);
      if (!target) {
        res.status(404).send("Entry not found.");
        return;
      }
      if (!isAdmin && target.loggedByUserId !== session.userId) {
        res.status(403).send("You can only remove entries you logged.");
        return;
      }
      await kv.set(
        "hmrcLogEntries",
        logEntries.filter((l) => l.id !== id)
      );
      await appendAuditLog({
        type: "hmrc_log_removed",
        username: session.username,
        detail: `Removed ${target.type} for ${target.targetUsername}`,
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).send("Method not allowed");
    return;
  }

  if (type === "thamesWater") {
    const canManage = session
      ? isBlumeSuperUser(session.userId) || session.username.toLowerCase() === "camhse"
      : false;

    if (req.method === "GET") {
      const jobs = ((await kv.get<ThamesWaterJob[]>("thamesWaterJobs")) || []).sort(
        (a, b) => b.createdAt - a.createdAt
      );
      const payloadJobs = canManage
        ? jobs
        : jobs.map(({ postedByUsername, createdAt, ...rest }) => rest);
      res.status(200).json({ jobs: payloadJobs, canManage });
      return;
    }

    if (req.method === "POST") {
      if (!session) {
        res.status(401).send("You must be signed in.");
        return;
      }
      if (!canManage) {
        res.status(403).send("You don't have access to manage Thames Water job openings.");
        return;
      }
      try {
        const body = req.body as { title?: string; department?: string; description?: string };
        const title = (body.title || "").toString().trim();
        const department = (body.department || "").toString().trim();
        const description = (body.description || "").toString().trim();
        if (!title) {
          res.status(400).send("Title is required.");
          return;
        }
        if (title.length > 120) {
          res.status(400).send("Title is too long (max 120 characters).");
          return;
        }
        if (department.length > 80) {
          res.status(400).send("Department is too long (max 80 characters).");
          return;
        }
        if (description.length > 2000) {
          res.status(400).send("Description is too long (max 2000 characters).");
          return;
        }
        if (containsBlockedLanguage(title) || containsBlockedLanguage(description)) {
          res.status(400).send(MODERATION_REJECTION_MESSAGE);
          return;
        }
        const entry: ThamesWaterJob = {
          id: crypto.randomBytes(12).toString("hex"),
          title,
          department,
          description,
          postedByUsername: session.username,
          createdAt: Date.now(),
        };
        const jobs = (await kv.get<ThamesWaterJob[]>("thamesWaterJobs")) || [];
        jobs.push(entry);
        await kv.set("thamesWaterJobs", jobs);
        await appendAuditLog({
          type: "thames_water_job_added",
          username: session.username,
          detail: `Posted job opening "${title}"`,
        });
        res.status(200).json(entry);
      } catch (err) {
        res.status(500).send("Failed: " + (err as Error).message);
      }
      return;
    }

    if (req.method === "DELETE") {
      if (!session) {
        res.status(401).send("You must be signed in.");
        return;
      }
      if (!canManage) {
        res.status(403).send("You don't have access to manage Thames Water job openings.");
        return;
      }
      const id = (req.query.id as string) || "";
      if (!id) {
        res.status(400).send("Missing job id.");
        return;
      }
      const jobs = (await kv.get<ThamesWaterJob[]>("thamesWaterJobs")) || [];
      const target = jobs.find((j) => j.id === id);
      const next = jobs.filter((j) => j.id !== id);
      await kv.set("thamesWaterJobs", next);
      if (target) {
        await appendAuditLog({
          type: "thames_water_job_removed",
          username: session.username,
          detail: `Removed job opening "${target.title}"`,
        });
      }
      res.status(200).json({ ok: true });
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
