import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "../../lib/kv.js";
import { put } from "@vercel/blob";
import crypto from "node:crypto";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import { MIME_EXT, parseDataUrl } from "../../lib/roblox.js";

interface PostEntry {
  id: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  text: string;
  imageUrl: string | null;
  createdAt: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);

  if (req.method === "GET") {
    const search = ((req.query.username as string) || "").trim().toLowerCase();
    let posts = ((await kv.get<PostEntry[]>("posts")) || []).sort(
      (a, b) => b.createdAt - a.createdAt
    );
    if (search) {
      posts = posts.filter((p) => p.authorUsername.toLowerCase().includes(search));
    }
    const payload = posts.map((p) => ({
      id: p.id,
      authorUsername: p.authorUsername,
      authorAvatarUrl: p.authorAvatarUrl ?? null,
      text: p.text,
      imageUrl: p.imageUrl ?? null,
      createdAt: p.createdAt,
      isMine: session ? p.authorId === session.userId : false,
    }));
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

      res.status(200).json({
        id: entry.id,
        authorUsername: entry.authorUsername,
        authorAvatarUrl: entry.authorAvatarUrl,
        text: entry.text,
        imageUrl: entry.imageUrl,
        createdAt: entry.createdAt,
        isMine: true,
      });
    } catch (err) {
      res.status(500).send("Post failed: " + (err as Error).message);
    }
    return;
  }

  res.status(405).send("Method not allowed");
}
