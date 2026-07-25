import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "../lib/kv.js";
import { put } from "@vercel/blob";
import crypto from "node:crypto";
import { parseCookies } from "../lib/cookies.js";
import { decodeSession } from "../lib/session.js";
import { MIME_EXT, parseDataUrl } from "../lib/roblox.js";

interface WallpaperEntry {
  id: string;
  url: string;
  ownerId: string;
  ownerUsername: string;
  visibility: "public" | "private";
  createdAt: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);

  if (req.method === "GET") {
    const all = (await kv.get<WallpaperEntry[]>("wallpapers")) || [];
    const visible = all.filter(
      (w) => w.visibility === "public" || (session && w.ownerId === session.userId)
    );
    const payload = [
      {
        id: "default",
        url: "/wallpapers/default.webp",
        visibility: "public" as const,
        ownerUsername: "Westbridge OS",
        isDefault: true,
      },
      ...visible.map((w) => ({
        id: w.id,
        url: w.url,
        visibility: w.visibility,
        ownerUsername: w.ownerUsername,
        isDefault: false,
        isMine: session ? w.ownerId === session.userId : false,
      })),
    ];
    res.status(200).json(payload);
    return;
  }

  if (req.method === "POST") {
    if (!session) {
      res.status(401).send("You must be signed in to upload a background.");
      return;
    }
    try {
      const body = req.body as { dataUrl?: string; visibility?: string };
      const parsed = parseDataUrl(body.dataUrl || "");
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
      const visibility: "public" | "private" = body.visibility === "private" ? "private" : "public";
      const id = crypto.randomBytes(12).toString("hex");
      const blob = await put(`wallpapers/${id}.${ext}`, parsed.buffer, {
        access: "public",
        contentType: parsed.mime,
      });

      const entry: WallpaperEntry = {
        id,
        url: blob.url,
        ownerId: session.userId,
        ownerUsername: session.username,
        visibility,
        createdAt: Date.now(),
      };
      const entries = (await kv.get<WallpaperEntry[]>("wallpapers")) || [];
      entries.push(entry);
      await kv.set("wallpapers", entries);

      res.status(200).json({
        id: entry.id,
        url: entry.url,
        visibility: entry.visibility,
        ownerUsername: entry.ownerUsername,
        isDefault: false,
        isMine: true,
      });
    } catch (err) {
      res.status(500).send("Upload failed: " + (err as Error).message);
    }
    return;
  }

  res.status(405).send("Method not allowed");
}
