import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "../../lib/kv.js";
import { put } from "@vercel/blob";
import crypto from "node:crypto";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import { MIME_EXT, parseDataUrl, isPlatformAdmin } from "../../lib/roblox.js";
import { containsBlockedLanguage, MODERATION_REJECTION_MESSAGE } from "../../lib/moderation.js";
import { appendAuditLog } from "../../lib/audit.js";

interface PostEntry {
  id: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  text: string;
  imageUrl: string | null;
  createdAt: number;
  // Deletion never actually erases the row (or its image blob) — it's
  // flagged so Blume Monitoring can still surface it. The public feed GET
  // below filters deleted posts out, so nothing changes for regular users.
  deleted?: boolean;
  deletedAt?: number;
  likedBy?: string[];
}

// DELETE is routed through this same file (via ?id=) rather than a separate
// [id].ts file, to stay within Vercel's Hobby-plan 12-function limit.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);

  if (req.method === "GET") {
    const search = ((req.query.username as string) || "").trim().toLowerCase();
    let posts = ((await kv.get<PostEntry[]>("posts")) || [])
      .filter((p) => !p.deleted)
      .sort((a, b) => b.createdAt - a.createdAt);
    if (search) {
      posts = posts.filter((p) => p.authorUsername.toLowerCase().includes(search));
    }
    const payload = posts.map((p) => {
      const likedBy = p.likedBy || [];
      return {
        id: p.id,
        authorUsername: p.authorUsername,
        authorAvatarUrl: p.authorAvatarUrl ?? null,
        text: p.text,
        imageUrl: p.imageUrl ?? null,
        createdAt: p.createdAt,
        isMine: session ? p.authorId === session.userId : false,
        canDelete: session ? p.authorId === session.userId || isPlatformAdmin(session.userId) : false,
        likes: likedBy.length,
        liked: session ? likedBy.includes(session.userId) : false,
      };
    });
    res.status(200).json(payload);
    return;
  }

  if (req.method === "POST") {
    if (!session) {
      res.status(401).send("You must be signed in to post.");
      return;
    }
    try {
      const body = req.body as { text?: string; imageDataUrl?: string };
      const text = (body.text || "").toString().trim();
      const imageDataUrl = body.imageDataUrl || undefined;

      if (!text && !imageDataUrl) {
        res.status(400).send("A post needs text or an image.");
        return;
      }
      if (text.length > 2000) {
        res.status(400).send("Post text is too long (max 2000 characters).");
        return;
      }
      if (containsBlockedLanguage(text)) {
        res.status(400).send(MODERATION_REJECTION_MESSAGE);
        return;
      }

      let imageUrl: string | null = null;
      if (imageDataUrl) {
        const parsed = parseDataUrl(imageDataUrl);
        if (!parsed) {
          res.status(400).send("Invalid image data.");
          return;
        }
        const ext = MIME_EXT[parsed.mime];
        if (!ext) {
          res.status(400).send("Unsupported image type. Use PNG, JPEG, WEBP, or GIF.");
          return;
        }
        if (parsed.buffer.length > 8 * 1024 * 1024) {
          res.status(400).send("Image too large (max 8MB).");
          return;
        }
        const id = crypto.randomBytes(12).toString("hex");
        const blob = await put(`posts/${id}.${ext}`, parsed.buffer, {
          access: "public",
          contentType: parsed.mime,
        });
        imageUrl = blob.url;
      }

      const entry: PostEntry = {
        id: crypto.randomBytes(12).toString("hex"),
        authorId: session.userId,
        authorUsername: session.username,
        authorAvatarUrl: session.avatarUrl,
        text,
        imageUrl,
        createdAt: Date.now(),
      };
      const entries = (await kv.get<PostEntry[]>("posts")) || [];
      entries.push(entry);
      await kv.set("posts", entries);

      await appendAuditLog({
        type: "instagram_post",
        username: session.username,
        detail: text ? `Posted: "${text.slice(0, 140)}"` : "Posted an image",
      });

      res.status(200).json({
        id: entry.id,
        authorUsername: entry.authorUsername,
        authorAvatarUrl: entry.authorAvatarUrl,
        text: entry.text,
        imageUrl: entry.imageUrl,
        createdAt: entry.createdAt,
        isMine: true,
        canDelete: true,
      });
    } catch (err) {
      res.status(500).send("Post failed: " + (err as Error).message);
    }
    return;
  }

  if (req.method === "PATCH") {
    if (!session) {
      res.status(401).send("You must be signed in to like a post.");
      return;
    }
    const id = (req.query.id as string) || "";
    const entries = (await kv.get<PostEntry[]>("posts")) || [];
    const index = entries.findIndex((p) => p.id === id);
    if (index === -1) {
      res.status(404).send("Post not found.");
      return;
    }
    const post = entries[index];
    const uid = session.userId;
    const likedBy = post.likedBy || [];
    const nextLikedBy = likedBy.includes(uid) ? likedBy.filter((x) => x !== uid) : [...likedBy, uid];
    entries[index] = { ...post, likedBy: nextLikedBy };
    await kv.set("posts", entries);
    res.status(200).json({ likes: nextLikedBy.length, liked: nextLikedBy.includes(uid) });
    return;
  }

  if (req.method === "DELETE") {
    if (!session) {
      res.status(401).send("You must be signed in to delete a post.");
      return;
    }
    const id = (req.query.id as string) || "";
    const entries = (await kv.get<PostEntry[]>("posts")) || [];
    const index = entries.findIndex((p) => p.id === id);
    if (index === -1) {
      res.status(404).send("Post not found.");
      return;
    }

    const post = entries[index];
    const isAdminOverride = isPlatformAdmin(session.userId);
    if (post.authorId !== session.userId && !isAdminOverride) {
      res.status(403).send("You can only delete your own posts.");
      return;
    }

    // The image blob is deliberately kept (not deleted) — Monitoring needs
    // to still be able to show it.
    entries[index] = { ...post, deleted: true, deletedAt: Date.now() };
    await kv.set("posts", entries);

    await appendAuditLog({
      type: "instagram_post_deleted",
      username: session.username,
      detail: isAdminOverride && post.authorId !== session.userId
        ? `Admin-deleted a post by ${post.authorUsername}`
        : "Deleted their own post",
    });

    res.status(204).end();
    return;
  }

  res.status(405).send("Method not allowed");
}
