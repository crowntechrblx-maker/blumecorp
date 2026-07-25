import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kv } from "../../lib/kv.js";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import { isBlumeSuperUser } from "../../lib/roblox.js";

interface BlumeBlogPost {
  id: string;
  title: string;
  excerpt: string;
  readMinutes: number;
  authorUsername: string;
  createdAt: number;
}

// Public read (the marketing site's "From our blog" section is visible to
// everyone), but only the two named Blume operators can publish or remove
// posts. DELETE is routed through this same file via ?id= to avoid adding
// another Vercel Hobby-plan function.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);
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
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).send("Method not allowed");
}
