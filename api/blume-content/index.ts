import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kv } from "../../lib/kv.js";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import { isBlumeAuthorized, isBlumeSuperUser, resolveRobloxUserId } from "../../lib/roblox.js";
import { containsBlockedLanguage, MODERATION_REJECTION_MESSAGE } from "../../lib/moderation.js";
import { appendAuditLog } from "../../lib/audit.js";

interface BlumeReport {
  id: string;
  title: string;
  body: string;
  authorUsername: string;
  createdAt: number;
  linkedUserId?: string;
  linkedUsername?: string;
}

interface BlumeBlogPost {
  id: string;
  title: string;
  excerpt: string;
  readMinutes: number;
  authorUsername: string;
  createdAt: number;
}

// Intelligence reports (Blume-clearance only) and the public blog
// (published by named Blume operators) both live behind this one file,
// routed via ?type=report|blog, to stay within Vercel Hobby's 12-function
// limit rather than adding a second file for what's structurally the same
// GET/POST/DELETE pattern.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const type = (req.query.type as string) || "report";
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);

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

  // type === "report"
  const canAccess = session ? await isBlumeAuthorized(session.userId) : false;

  if (req.method === "GET") {
    if (!canAccess) {
      res.status(200).json({ reports: [], canAccess: false });
      return;
    }
    let reports = ((await kv.get<BlumeReport[]>("blumeReports")) || []).sort(
      (a, b) => b.createdAt - a.createdAt
    );
    const personId = (req.query.personId as string) || "";
    if (personId) {
      reports = reports.filter((r) => r.linkedUserId === personId);
    }
    res.status(200).json({ reports, canAccess: true });
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
      const body = req.body as { title?: string; content?: string; linkedPerson?: string };
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
