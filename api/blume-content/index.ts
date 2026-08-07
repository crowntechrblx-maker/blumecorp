import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { put, del } from "@vercel/blob";
import { kv } from "../../lib/kv.js";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import {
  isBlumeAuthorized,
  isBlumeSuperUser,
  resolveRobloxUserId,
  isRobloxGroupMember,
  getRobloxAvatarUrl,
  isHmctsRanked,
  isHmctsEditor,
  getHmctsUserDepartments,
  getUserGroupIds,
  MIME_EXT,
  parseDataUrl,
} from "../../lib/roblox.js";
import { containsBlockedLanguage, MODERATION_REJECTION_MESSAGE } from "../../lib/moderation.js";
import { appendAuditLog } from "../../lib/audit.js";
import { isVerifileAuthorized, getVerifileWhitelist } from "../../lib/verifile.js";
import { isPlatformAdmin } from "../../lib/admins.js";
import {
  BRITISH_GAS_ROOT_USERNAMES,
  isBritishGasAdmin,
  getBritishGasAdmins,
  addBritishGasAdmin,
  removeBritishGasAdmin,
} from "../../lib/britishGas.js";
import { getGroupIdsByNameMatch, getGroupCatalog } from "../../lib/groupCatalog.js";
import { sendSystemMessage } from "../../lib/systemMessage.js";

const HMRC_GROUP_ID = 567563234;
const HMRC_LOG_TYPES = ["Information", "Arrest by HMRC", "Money Laundering", "Tax Evasion", "Fraud"];

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
  charges?: string[];
  sourceKey?: string;
  loggedByUserId: string;
  loggedByUsername: string;
  createdAt: number;
}

interface BritishGasIncident {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  postedByUserId: string;
  postedByUsername: string;
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

interface HmctsMessage {
  id: string;
  fromUserId: string;
  fromUsername: string;
  departments: string[];
  text: string;
  createdAt: number;
  kind?: "publicRecordsRequest";
  requestId?: string;
}

interface HmctsPublicRecordsRequest {
  id: string;
  foiYear: number;
  foiNumber: number;
  subjectUsername: string;
  subjectUserId: string;
  requestedInfo: string;
  requesterUserId: string;
  requesterUsername: string;
  requesterGroups: { id: number; name: string; category: string }[];
  status: "pending" | "replied";
  reply?: string;
  replyAttachments?: { name: string; url: string }[];
  repliedByUsername?: string;
  repliedAt?: number;
  createdAt: number;
}

interface HmctsCaseAttachment {
  name: string;
  url: string;
}

interface HmctsCase {
  id: string;
  title: string;
  info: string;
  subjectUserId: string | null;
  subjectUsername: string | null;
  photos: HmctsCaseAttachment[];
  files: HmctsCaseAttachment[];
  isPublic: boolean;
  createdByUserId: string;
  createdByUsername: string;
  createdAt: number;
}

interface HmctsLrrPost {
  id: string;
  title: string;
  link: string;
  postedByUsername: string;
  createdAt: number;
}

const HMCTS_CASE_MAX_PHOTOS = 4;
const HMCTS_CASE_MAX_FILES = 3;
const HMCTS_CASE_MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

// Broader than parseDataUrl (which only accepts image/* mimes) — case files can be
// PDFs, docs, etc.
function parseAnyDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const type = (req.query.type as string) || "report";
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);

  if (type === "hmcts") {
    const ranked = session ? await isHmctsRanked(session.userId) : false;
    const canEdit = session ? await isHmctsEditor(session.userId) : false;
    res.status(200).json({ ranked, canEdit });
    return;
  }

  // HMCTS internal messaging — single group chat, restricted to MOJ / CPS / Home Office.
  if (type === "hmctsChat") {
    if (!session) {
      res.status(401).send("You must be signed in.");
      return;
    }
    if (!(await isHmctsEditor(session.userId))) {
      res.status(403).send("Internal Messaging is restricted to Ministry of Justice, Crown Prosecution Service, and Home Office.");
      return;
    }

    if (req.method === "GET") {
      const messages = ((await kv.get<HmctsMessage[]>("hmctsMessages")) || []).slice(-200);
      res.status(200).json({ messages });
      return;
    }

    if (req.method === "POST") {
      const body = req.body as { text?: string };
      const text = (body.text || "").toString().trim();
      if (!text) {
        res.status(400).send("Message can't be empty.");
        return;
      }
      if (text.length > 1000) {
        res.status(400).send("Message is too long (max 1000 characters).");
        return;
      }
      if (containsBlockedLanguage(text)) {
        res.status(400).send(MODERATION_REJECTION_MESSAGE);
        return;
      }
      const departments = await getHmctsUserDepartments(session.userId);
      const entry: HmctsMessage = {
        id: crypto.randomBytes(12).toString("hex"),
        fromUserId: session.userId,
        fromUsername: session.username,
        departments,
        text,
        createdAt: Date.now(),
      };
      const all = (await kv.get<HmctsMessage[]>("hmctsMessages")) || [];
      const next = [...all, entry].slice(-500);
      await kv.set("hmctsMessages", next);
      res.status(200).json({ message: entry });
      return;
    }

    if (req.method === "DELETE") {
      if (!(await isPlatformAdmin(session.userId, session.username))) {
        res.status(403).send("Only admins can delete messages.");
        return;
      }
      const id = (req.query.id as string) || "";
      const all = (await kv.get<HmctsMessage[]>("hmctsMessages")) || [];
      const next = all.filter((m) => m.id !== id);
      await kv.set("hmctsMessages", next);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).send("Method not allowed");
    return;
  }

  // Cases & Citations — viewing AND editing restricted to MOJ / CPS / Home Office.
  if (type === "hmctsCases") {
    if (!session) {
      res.status(401).send("You must be signed in.");
      return;
    }
    if (!(await isHmctsEditor(session.userId))) {
      res.status(403).send("Cases & Citations is restricted to Ministry of Justice, Crown Prosecution Service, and Home Office.");
      return;
    }

    if (req.method === "GET") {
      const cases = ((await kv.get<HmctsCase[]>("hmctsCases")) || []).sort((a, b) => b.createdAt - a.createdAt);
      res.status(200).json({ cases });
      return;
    }

    if (req.method === "POST") {
      try {
        const body = req.body as {
          title?: string;
          info?: string;
          subjectQuery?: string;
          isPublic?: boolean;
          photos?: { name?: string; dataUrl?: string }[];
          files?: { name?: string; dataUrl?: string }[];
        };
        const title = (body.title || "").toString().trim();
        const info = (body.info || "").toString().trim();
        if (!title) {
          res.status(400).send("Missing title.");
          return;
        }
        if (title.length > 140) {
          res.status(400).send("Title is too long (max 140 characters).");
          return;
        }
        if (info.length > 4000) {
          res.status(400).send("Information is too long (max 4000 characters).");
          return;
        }
        if (containsBlockedLanguage(title) || containsBlockedLanguage(info)) {
          res.status(400).send(MODERATION_REJECTION_MESSAGE);
          return;
        }

        let subjectUserId: string | null = null;
        let subjectUsername: string | null = null;
        const subjectQuery = (body.subjectQuery || "").toString().trim();
        if (subjectQuery) {
          const resolved = await resolveRobloxUserId(subjectQuery);
          if (!resolved) {
            res.status(400).send(`Couldn't find a Roblox user matching "${subjectQuery}".`);
            return;
          }
          subjectUserId = resolved.userId;
          subjectUsername = resolved.username;
        }

        const rawPhotos = Array.isArray(body.photos) ? body.photos.slice(0, HMCTS_CASE_MAX_PHOTOS) : [];
        const rawFiles = Array.isArray(body.files) ? body.files.slice(0, HMCTS_CASE_MAX_FILES) : [];

        const photos: HmctsCaseAttachment[] = [];
        for (const p of rawPhotos) {
          const parsed = parseDataUrl(p.dataUrl || "");
          if (!parsed) continue;
          const ext = MIME_EXT[parsed.mime];
          if (!ext) continue;
          if (parsed.buffer.length > HMCTS_CASE_MAX_ATTACHMENT_BYTES) {
            res.status(400).send("A photo is too large (max 4MB each).");
            return;
          }
          const id = crypto.randomBytes(10).toString("hex");
          const blob = await put(`hmcts-cases/${id}.${ext}`, parsed.buffer, {
            access: "public",
            contentType: parsed.mime,
          });
          photos.push({ name: (p.name || "photo").toString().slice(0, 80), url: blob.url });
        }

        const files: HmctsCaseAttachment[] = [];
        for (const f of rawFiles) {
          const parsed = parseAnyDataUrl(f.dataUrl || "");
          if (!parsed) continue;
          if (parsed.buffer.length > HMCTS_CASE_MAX_ATTACHMENT_BYTES) {
            res.status(400).send("A file is too large (max 4MB each).");
            return;
          }
          const id = crypto.randomBytes(10).toString("hex");
          const safeName = (f.name || "file").toString().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
          const blob = await put(`hmcts-cases/${id}-${safeName}`, parsed.buffer, {
            access: "public",
            contentType: parsed.mime,
          });
          files.push({ name: safeName, url: blob.url });
        }

        const entry: HmctsCase = {
          id: crypto.randomBytes(12).toString("hex"),
          title,
          info,
          subjectUserId,
          subjectUsername,
          photos,
          files,
          isPublic: !!body.isPublic,
          createdByUserId: session.userId,
          createdByUsername: session.username,
          createdAt: Date.now(),
        };
        const all = (await kv.get<HmctsCase[]>("hmctsCases")) || [];
        all.push(entry);
        await kv.set("hmctsCases", all);
        await appendAuditLog({
          type: "hmcts_case_added",
          username: session.username,
          detail: `Filed case "${title}"${subjectUsername ? ` re. ${subjectUsername}` : ""}`,
        });
        res.status(200).json(entry);
        return;
      } catch (err) {
        res.status(500).send("Failed to save case: " + (err as Error).message);
      }
      return;
    }

    if (req.method === "PATCH") {
      try {
        const id = (req.query.id as string) || "";
        const all = (await kv.get<HmctsCase[]>("hmctsCases")) || [];
        const idx = all.findIndex((c) => c.id === id);
        if (idx === -1) {
          res.status(404).send("Case not found.");
          return;
        }
        const target = all[idx];
        if (target.createdByUserId !== session.userId && !(await isPlatformAdmin(session.userId, session.username))) {
          res.status(403).send("You can only edit cases you filed.");
          return;
        }
        const body = req.body as {
          title?: string;
          info?: string;
          isPublic?: boolean;
          addPhotos?: { name?: string; dataUrl?: string }[];
          addFiles?: { name?: string; dataUrl?: string }[];
        };
        const title = body.title !== undefined ? body.title.toString().trim() : target.title;
        const info = body.info !== undefined ? body.info.toString().trim() : target.info;
        if (!title) {
          res.status(400).send("Missing title.");
          return;
        }
        if (title.length > 140) {
          res.status(400).send("Title is too long (max 140 characters).");
          return;
        }
        if (info.length > 4000) {
          res.status(400).send("Information is too long (max 4000 characters).");
          return;
        }
        if (containsBlockedLanguage(title) || containsBlockedLanguage(info)) {
          res.status(400).send(MODERATION_REJECTION_MESSAGE);
          return;
        }

        const photos = [...target.photos];
        const files = [...target.files];

        const rawPhotos = Array.isArray(body.addPhotos)
          ? body.addPhotos.slice(0, Math.max(0, HMCTS_CASE_MAX_PHOTOS - photos.length))
          : [];
        for (const p of rawPhotos) {
          const parsed = parseDataUrl(p.dataUrl || "");
          if (!parsed) continue;
          const ext = MIME_EXT[parsed.mime];
          if (!ext) continue;
          if (parsed.buffer.length > HMCTS_CASE_MAX_ATTACHMENT_BYTES) {
            res.status(400).send("A photo is too large (max 4MB each).");
            return;
          }
          const pid = crypto.randomBytes(10).toString("hex");
          const blob = await put(`hmcts-cases/${pid}.${ext}`, parsed.buffer, {
            access: "public",
            contentType: parsed.mime,
          });
          photos.push({ name: (p.name || "photo").toString().slice(0, 80), url: blob.url });
        }

        const rawFiles = Array.isArray(body.addFiles)
          ? body.addFiles.slice(0, Math.max(0, HMCTS_CASE_MAX_FILES - files.length))
          : [];
        for (const f of rawFiles) {
          const parsed = parseAnyDataUrl(f.dataUrl || "");
          if (!parsed) continue;
          if (parsed.buffer.length > HMCTS_CASE_MAX_ATTACHMENT_BYTES) {
            res.status(400).send("A file is too large (max 4MB each).");
            return;
          }
          const fid = crypto.randomBytes(10).toString("hex");
          const safeName = (f.name || "file").toString().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
          const blob = await put(`hmcts-cases/${fid}-${safeName}`, parsed.buffer, {
            access: "public",
            contentType: parsed.mime,
          });
          files.push({ name: safeName, url: blob.url });
        }

        const updated: HmctsCase = {
          ...target,
          title,
          info,
          isPublic: body.isPublic !== undefined ? !!body.isPublic : target.isPublic,
          photos,
          files,
        };
        all[idx] = updated;
        await kv.set("hmctsCases", all);
        await appendAuditLog({
          type: "hmcts_case_edited",
          username: session.username,
          detail: `Edited case "${updated.title}"`,
        });
        res.status(200).json(updated);
        return;
      } catch (err) {
        res.status(500).send("Failed to update case: " + (err as Error).message);
      }
      return;
    }

    if (req.method === "DELETE") {
      const id = (req.query.id as string) || "";
      const all = (await kv.get<HmctsCase[]>("hmctsCases")) || [];
      const target = all.find((c) => c.id === id);
      if (!target) {
        res.status(404).send("Case not found.");
        return;
      }
      if (target.createdByUserId !== session.userId && !(await isPlatformAdmin(session.userId, session.username))) {
        res.status(403).send("You can only remove cases you filed.");
        return;
      }
      for (const attachment of [...target.photos, ...target.files]) {
        try {
          await del(attachment.url);
        } catch {
        }
      }
      const next = all.filter((c) => c.id !== id);
      await kv.set("hmctsCases", next);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).send("Method not allowed");
    return;
  }

  // Legal Research Repositories — viewable by anyone ranked, postable only by
  // MOJ / CPS / Home Office.
  if (type === "hmctsLrr") {
    if (!session) {
      res.status(401).send("You must be signed in.");
      return;
    }
    if (!(await isHmctsRanked(session.userId))) {
      res.status(403).send("Legal Research Repositories requires a recognised judiciary rank.");
      return;
    }

    if (req.method === "GET") {
      const posts = ((await kv.get<HmctsLrrPost[]>("hmctsLrrPosts")) || []).sort((a, b) => b.createdAt - a.createdAt);
      res.status(200).json({ posts });
      return;
    }

    if (req.method === "POST") {
      if (!(await isHmctsEditor(session.userId))) {
        res.status(403).send("Only Ministry of Justice, Crown Prosecution Service, and Home Office can post updates.");
        return;
      }
      const body = req.body as { title?: string; link?: string };
      const title = (body.title || "").toString().trim();
      const link = (body.link || "").toString().trim();
      if (!title || !link) {
        res.status(400).send("Missing title or link.");
        return;
      }
      if (title.length > 140) {
        res.status(400).send("Title is too long (max 140 characters).");
        return;
      }
      if (!/^https?:\/\/.+/i.test(link)) {
        res.status(400).send("Link must start with http:// or https://.");
        return;
      }
      if (containsBlockedLanguage(title)) {
        res.status(400).send(MODERATION_REJECTION_MESSAGE);
        return;
      }
      const entry: HmctsLrrPost = {
        id: crypto.randomBytes(12).toString("hex"),
        title,
        link,
        postedByUsername: session.username,
        createdAt: Date.now(),
      };
      const all = (await kv.get<HmctsLrrPost[]>("hmctsLrrPosts")) || [];
      all.push(entry);
      await kv.set("hmctsLrrPosts", all);
      res.status(200).json(entry);
      return;
    }

    if (req.method === "DELETE") {
      if (!(await isHmctsEditor(session.userId))) {
        res.status(403).send("Only Ministry of Justice, Crown Prosecution Service, and Home Office can remove updates.");
        return;
      }
      const id = (req.query.id as string) || "";
      const all = (await kv.get<HmctsLrrPost[]>("hmctsLrrPosts")) || [];
      const next = all.filter((p) => p.id !== id);
      await kv.set("hmctsLrrPosts", next);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).send("Method not allowed");
    return;
  }

  // Public Records — no rank required, just signed in. Surfaces only the title of
  // public case entries linked to the searched person.
  if (type === "hmctsPublicRecords") {
    if (!session) {
      res.status(401).send("You must be signed in.");
      return;
    }
    if (req.method !== "GET") {
      res.status(405).send("Method not allowed");
      return;
    }
    const q = ((req.query.query as string) || "").trim();
    if (!q) {
      res.status(400).send("Missing search query.");
      return;
    }
    const resolved = await resolveRobloxUserId(q);
    if (!resolved) {
      res.status(404).send("No Roblox user found matching that name or ID.");
      return;
    }
    const all = (await kv.get<HmctsCase[]>("hmctsCases")) || [];
    const records = all
      .filter((c) => c.isPublic && c.subjectUserId === resolved.userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt }));
    res.status(200).json({ userId: resolved.userId, username: resolved.username, records });
    return;
  }

  // Personnel Directory — public within the app (no rank gate). Lists only the
  // people the platform has scanned who sit in MOJ / CPS / Home Office.
  if (type === "hmctsPersonnel") {
    if (!session) {
      res.status(401).send("You must be signed in.");
      return;
    }
    if (req.method !== "GET") {
      res.status(405).send("Method not allowed");
      return;
    }
    const scanCache = (await kv.get<{ userId: string; username: string; avatarUrl: string | null; groupIds: number[] }[]>("blumeGroupScanCache")) || [];
    const [mojGroupIds, cpsGroupIds, hoGroupIds] = await Promise.all([
      getGroupIdsByNameMatch(["ministry of justice"]),
      getGroupIdsByNameMatch(["crown prosecution"]),
      getGroupIdsByNameMatch(["home office"]),
    ]);
    const deptSets: { label: string; set: Set<number> }[] = [
      { label: "Ministry of Justice", set: new Set(mojGroupIds) },
      { label: "Crown Prosecution Service", set: new Set(cpsGroupIds) },
      { label: "Home Office", set: new Set(hoGroupIds) },
    ];
    const personnel = scanCache
      .filter((m) => deptSets.some((d) => m.groupIds.some((id) => d.set.has(id))))
      .map((m) => ({
        userId: m.userId,
        username: m.username,
        avatarUrl: m.avatarUrl,
        departments: deptSets.filter((d) => m.groupIds.some((id) => d.set.has(id))).map((d) => d.label),
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
    res.status(200).json({ personnel });
    return;
  }

  // Public Records Requests — anyone signed in can ask for more detail on a
  // person; MOJ / CPS / Home Office review and reply from Internal Messaging.
  if (type === "hmctsPublicRecordsRequests") {
    if (!session) {
      res.status(401).send("You must be signed in.");
      return;
    }

    if (req.method === "GET") {
      if (!(await isHmctsEditor(session.userId))) {
        res.status(403).send("Public Records Requests are restricted to Ministry of Justice, Crown Prosecution Service, and Home Office.");
        return;
      }
      const requests = ((await kv.get<HmctsPublicRecordsRequest[]>("hmctsPublicRecordsRequests")) || []).sort(
        (a, b) => b.createdAt - a.createdAt
      );
      res.status(200).json({ requests });
      return;
    }

    if (req.method === "POST") {
      const body = req.body as {
        action?: string;
        username?: string;
        requestedInfo?: string;
        id?: string;
        reply?: string;
        attachments?: { name?: string; dataUrl?: string }[];
      };
      const action = body.action || "create";

      if (action === "reply") {
        if (!(await isHmctsEditor(session.userId))) {
          res.status(403).send("Only Ministry of Justice, Crown Prosecution Service, and Home Office can reply.");
          return;
        }
        try {
          const id = (body.id || "").toString().trim();
          const reply = (body.reply || "").toString().trim();
          if (!reply) {
            res.status(400).send("Reply can't be empty.");
            return;
          }
          if (reply.length > 6000) {
            res.status(400).send("Reply is too long (max 6000 characters).");
            return;
          }
          if (containsBlockedLanguage(reply)) {
            res.status(400).send(MODERATION_REJECTION_MESSAGE);
            return;
          }
          const all = (await kv.get<HmctsPublicRecordsRequest[]>("hmctsPublicRecordsRequests")) || [];
          const idx = all.findIndex((r) => r.id === id);
          if (idx === -1) {
            res.status(404).send("Request not found.");
            return;
          }
          const target = all[idx];

          const rawAttachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 5) : [];
          const replyAttachments: { name: string; url: string }[] = [];
          for (const f of rawAttachments) {
            const parsed = parseAnyDataUrl(f.dataUrl || "");
            if (!parsed) continue;
            if (parsed.buffer.length > HMCTS_CASE_MAX_ATTACHMENT_BYTES) {
              res.status(400).send("An attachment is too large (max 4MB each).");
              return;
            }
            const fid = crypto.randomBytes(10).toString("hex");
            const safeName = (f.name || "file").toString().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
            const blob = await put(`hmcts-foi/${fid}-${safeName}`, parsed.buffer, {
              access: "public",
              contentType: parsed.mime,
            });
            replyAttachments.push({ name: safeName, url: blob.url });
          }

          const updated: HmctsPublicRecordsRequest = {
            ...target,
            reply,
            replyAttachments,
            status: "replied",
            repliedByUsername: session.username,
            repliedAt: Date.now(),
          };
          all[idx] = updated;
          await kv.set("hmctsPublicRecordsRequests", all);

          const reference = `FOI${updated.foiYear}/${updated.foiNumber}`;
          await sendSystemMessage(
            updated.requesterUsername,
            `eJudiciary has replied to your Public Records request regarding ${updated.subjectUsername} (Reference: ${reference}):\n\n${reply}`,
            replyAttachments
          );

          const notifyEntry: HmctsMessage = {
            id: crypto.randomBytes(12).toString("hex"),
            fromUserId: "system",
            fromUsername: "eJudiciary",
            departments: [],
            text: `${session.username} Replied to ${updated.requesterUsername}'s FOIA Request, ${reference}`,
            createdAt: Date.now(),
            kind: "publicRecordsRequest",
            requestId: updated.id,
          };
          const chatAllReply = (await kv.get<HmctsMessage[]>("hmctsMessages")) || [];
          const chatNextReply = [...chatAllReply, notifyEntry].slice(-500);
          await kv.set("hmctsMessages", chatNextReply);

          await appendAuditLog({
            type: "hmcts_public_records_request_replied",
            username: session.username,
            detail: `Replied to Public Records request from ${updated.requesterUsername} re. ${updated.subjectUsername} (${reference})`,
          });
          res.status(200).json(updated);
          return;
        } catch (err) {
          res.status(500).send("Failed to send reply: " + (err as Error).message);
          return;
        }
      }

      const usernameQuery = (body.username || "").toString().trim();
      const requestedInfo = (body.requestedInfo || "").toString().trim();
      if (!usernameQuery || !requestedInfo) {
        res.status(400).send("Both a username and requested information are required.");
        return;
      }
      if (requestedInfo.length > 1000) {
        res.status(400).send("Requested information is too long (max 1000 characters).");
        return;
      }
      if (containsBlockedLanguage(requestedInfo)) {
        res.status(400).send(MODERATION_REJECTION_MESSAGE);
        return;
      }
      const resolved = await resolveRobloxUserId(usernameQuery);
      if (!resolved) {
        res.status(404).send(`Couldn't find a Roblox user matching "${usernameQuery}".`);
        return;
      }
      const [requesterGroupIds, catalog] = await Promise.all([getUserGroupIds(session.userId), getGroupCatalog()]);
      const requesterGroups = requesterGroupIds
        .filter((id) => id in catalog)
        .map((id) => ({ id, name: catalog[id].name, category: catalog[id].category }));

      const all = (await kv.get<HmctsPublicRecordsRequest[]>("hmctsPublicRecordsRequests")) || [];
      const foiYear = new Date().getFullYear();
      const foiNumber = all.filter((r) => r.foiYear === foiYear).length + 1;

      const entry: HmctsPublicRecordsRequest = {
        id: crypto.randomBytes(12).toString("hex"),
        foiYear,
        foiNumber,
        subjectUsername: resolved.username,
        subjectUserId: resolved.userId,
        requestedInfo,
        requesterUserId: session.userId,
        requesterUsername: session.username,
        requesterGroups,
        status: "pending",
        createdAt: Date.now(),
      };
      all.push(entry);
      await kv.set("hmctsPublicRecordsRequests", all);

      const chatEntry: HmctsMessage = {
        id: crypto.randomBytes(12).toString("hex"),
        fromUserId: "system",
        fromUsername: "eJudiciary",
        departments: [],
        text: `New Public Records Request from ${session.username} regarding ${resolved.username} (FOI${foiYear}/${foiNumber}).`,
        createdAt: Date.now(),
        kind: "publicRecordsRequest",
        requestId: entry.id,
      };
      const chatAll = (await kv.get<HmctsMessage[]>("hmctsMessages")) || [];
      const chatNext = [...chatAll, chatEntry].slice(-500);
      await kv.set("hmctsMessages", chatNext);

      res.status(200).json(entry);
      return;
    }

    if (req.method === "DELETE") {
      if (!(await isHmctsEditor(session.userId))) {
        res.status(403).send("Only Ministry of Justice, Crown Prosecution Service, and Home Office can remove requests.");
        return;
      }
      const id = (req.query.id as string) || "";
      const all = (await kv.get<HmctsPublicRecordsRequest[]>("hmctsPublicRecordsRequests")) || [];
      const target = all.find((r) => r.id === id);
      if (!target) {
        res.status(404).send("Request not found.");
        return;
      }
      for (const attachment of target.replyAttachments || []) {
        try {
          await del(attachment.url);
        } catch {
        }
      }
      const next = all.filter((r) => r.id !== id);
      await kv.set("hmctsPublicRecordsRequests", next);
      await appendAuditLog({
        type: "hmcts_public_records_request_deleted",
        username: session.username,
        detail: `Removed Public Records request from ${target.requesterUsername} re. ${target.subjectUsername} (FOI${target.foiYear}/${target.foiNumber})`,
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).send("Method not allowed");
    return;
  }

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
          if (!["Low", "Medium", "High"].includes(riskLevel)) {
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

  if (type === "britishGas") {
    const canManage = session
      ? (await isPlatformAdmin(session.userId, session.username)) ||
        (await isBritishGasAdmin(session.userId, session.username))
      : false;

    if (req.method === "GET") {
      const incidents = ((await kv.get<BritishGasIncident[]>("britishGasIncidents")) || []).sort(
        (a, b) => b.createdAt - a.createdAt
      );
      const admins = canManage ? await getBritishGasAdmins() : [];
      res.status(200).json({ canManage, incidents, admins, rootAdmins: BRITISH_GAS_ROOT_USERNAMES });
      return;
    }

    if (req.method === "POST") {
      if (!session) {
        res.status(401).send("You must be signed in.");
        return;
      }
      if (!canManage) {
        res.status(403).send("You do not have British Gas admin access.");
        return;
      }
      try {
        const body = req.body as {
          action?: string;
          title?: string;
          description?: string;
          imageDataUrl?: string;
          username?: string;
          userId?: string;
        };
        const action = body.action || "";

        if (action === "addIncident") {
          const title = (body.title || "").toString().trim();
          const description = (body.description || "").toString().trim();
          if (!title) {
            res.status(400).send("Missing title.");
            return;
          }
          if (title.length > 140) {
            res.status(400).send("Title is too long (max 140 characters).");
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

          let imageUrl: string | null = null;
          const rawImage = (body.imageDataUrl || "").toString();
          if (rawImage) {
            const parsed = parseDataUrl(rawImage);
            if (!parsed) {
              res.status(400).send("Unsupported image format.");
              return;
            }
            const ext = MIME_EXT[parsed.mime];
            if (!ext) {
              res.status(400).send("Unsupported image format.");
              return;
            }
            if (parsed.buffer.length > 4 * 1024 * 1024) {
              res.status(400).send("Image is too large (max 4MB).");
              return;
            }
            const id = crypto.randomBytes(10).toString("hex");
            const blob = await put(`british-gas/${id}.${ext}`, parsed.buffer, {
              access: "public",
              contentType: parsed.mime,
            });
            imageUrl = blob.url;
          }

          const entry: BritishGasIncident = {
            id: crypto.randomBytes(12).toString("hex"),
            title,
            description,
            imageUrl,
            postedByUserId: session.userId,
            postedByUsername: session.username,
            createdAt: Date.now(),
          };
          const incidents = (await kv.get<BritishGasIncident[]>("britishGasIncidents")) || [];
          incidents.push(entry);
          await kv.set("britishGasIncidents", incidents);
          await appendAuditLog({
            type: "british_gas_incident_added",
            username: session.username,
            detail: `Posted a British Gas incident: "${title}"`,
          });
          res.status(200).json({ incidents: [...incidents].sort((a, b) => b.createdAt - a.createdAt) });
          return;
        }

        if (action === "addAdmin") {
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
          await addBritishGasAdmin({
            userId: resolved.userId,
            username: resolved.username,
            addedByUsername: session.username,
            createdAt: Date.now(),
          });
          await appendAuditLog({
            type: "british_gas_admin_added",
            username: session.username,
            detail: `Added ${resolved.username} as a British Gas admin`,
          });
          res.status(200).json({ admins: await getBritishGasAdmins() });
          return;
        }

        if (action === "removeAdmin") {
          const userId = (body.userId || "").toString().trim();
          if (!userId) {
            res.status(400).send("Missing admin.");
            return;
          }
          await removeBritishGasAdmin(userId);
          await appendAuditLog({
            type: "british_gas_admin_removed",
            username: session.username,
            detail: "Removed a British Gas admin",
          });
          res.status(200).json({ admins: await getBritishGasAdmins() });
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
      if (!canManage) {
        res.status(403).send("You do not have British Gas admin access.");
        return;
      }
      const id = (req.query.id as string) || "";
      if (!id) {
        res.status(400).send("Missing incident id.");
        return;
      }
      const incidents = (await kv.get<BritishGasIncident[]>("britishGasIncidents")) || [];
      const target = incidents.find((i) => i.id === id);
      if (!target) {
        res.status(404).send("Incident not found.");
        return;
      }
      await kv.set(
        "britishGasIncidents",
        incidents.filter((i) => i.id !== id)
      );
      await appendAuditLog({
        type: "british_gas_incident_removed",
        username: session.username,
        detail: `Removed a British Gas incident: "${target.title}"`,
      });
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
