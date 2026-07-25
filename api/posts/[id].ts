import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "../../lib/kv.js";
import { del } from "@vercel/blob";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";

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
  if (req.method !== "DELETE") {
    res.status(405).send("Method not allowed");
    return;
  }

  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);
  if (!session) {
    res.status(401).send("You must be signed in to delete a post.");
    return;
  }

  const id = req.query.id as string;
  const entries = (await kv.get<PostEntry[]>("posts")) || [];
  const index = entries.findIndex((p) => p.id === id);
  if (index === -1) {
    res.status(404).send("Post not found.");
    return;
  }

  const post = entries[index];
  if (post.authorId !== session.userId) {
    res.status(403).send("You can only delete your own posts.");
    return;
  }

  if (post.imageUrl) {
    try {
      await del(post.imageUrl);
    } catch {
      // Ignore blob delete failures; the metadata removal below still succeeds.
    }
  }

  entries.splice(index, 1);
  await kv.set("posts", entries);
  res.status(204).end();
}
