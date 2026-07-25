import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kv } from "../../lib/kv.js";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import { isBlumeAuthorized } from "../../lib/roblox.js";

interface BlumeReport {
  id: string;
  title: string;
  body: string;
  authorUsername: string;
  createdAt: number;
}

// DELETE is routed through this same file (via ?id=) rather than a separate
// [id].ts file, to avoid tipping the Vercel Hobby plan's 12-function limit.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);
  const canAccess = session ? await isBlumeAuthorized(session.userId) : false;

  if (req.method === "GET") {
    if (!canAccess) {
      res.status(200).json({ reports: [], canAccess: false });
      return;
    }
    const reports = ((await kv.get<BlumeReport[]>("blumeReports")) || []).sort(
      (a, b) => b.createdAt - a.createdAt
    );
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
      const body = req.body as { title?: string; content?: string };
      const title = (body.title || "").toString().trim();
      const content = (body.content || "").toString().trim();
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
      const entry: BlumeReport = {
        id: crypto.randomBytes(12).toString("hex"),
        title,
        body: content,
        authorUsername: session.username,
        createdAt: Date.now(),
      };
      const reports = (await kv.get<BlumeReport[]>("blumeReports")) || [];
      reports.push(entry);
      await kv.set("blumeReports", reports);
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
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).send("Method not allowed");
}
