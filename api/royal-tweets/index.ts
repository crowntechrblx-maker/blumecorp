import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kv } from "../../lib/kv.js";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import { isRobloxGroupMember, ROYAL_FAMILY_GROUP_ID, isPlatformAdmin } from "../../lib/roblox.js";
import { appendAuditLog } from "../../lib/audit.js";

interface RoyalTweetEntry {
  id: string;
  url: string;
  addedByUsername: string;
  createdAt: number;
}

const TWEET_URL_PATTERN = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\/[^/]+\/status\/\d+/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);

  if (req.method === "GET") {
    const entries = ((await kv.get<RoyalTweetEntry[]>("royalTweets")) || []).sort(
      (a, b) => b.createdAt - a.createdAt
    );
    const canAdd = session
      ? isPlatformAdmin(session.userId) || (await isRobloxGroupMember(session.userId, ROYAL_FAMILY_GROUP_ID))
      : false;
    res.status(200).json({
      tweets: entries.map((e) => ({
        id: e.id,
        url: e.url,
        addedByUsername: e.addedByUsername,
        createdAt: e.createdAt,
      })),
      canAdd,
    });
    return;
  }

  if (req.method === "POST") {
    if (!session) {
      res.status(401).send("You must be signed in.");
      return;
    }
    const isMember = await isRobloxGroupMember(session.userId, ROYAL_FAMILY_GROUP_ID);
    if (!isPlatformAdmin(session.userId) && !isMember) {
      res.status(403).send("Only members of the Royal Family group can add posts.");
      return;
    }
    try {
      const body = req.body as { url?: string };
      const url = (body.url || "").toString().trim();
      if (!TWEET_URL_PATTERN.test(url)) {
        res.status(400).send("That doesn't look like a valid X/Twitter post link.");
        return;
      }
      const entry: RoyalTweetEntry = {
        id: crypto.randomBytes(12).toString("hex"),
        url,
        addedByUsername: session.username,
        createdAt: Date.now(),
      };
      const entries = (await kv.get<RoyalTweetEntry[]>("royalTweets")) || [];
      entries.push(entry);
      await kv.set("royalTweets", entries);
      await appendAuditLog({
        type: "royal_tweet_added",
        username: session.username,
        detail: `Added post ${url}`,
      });
      res.status(200).json(entry);
    } catch (err) {
      res.status(500).send("Failed to add post: " + (err as Error).message);
    }
    return;
  }

  if (req.method === "DELETE") {
    if (!session) {
      res.status(401).send("You must be signed in.");
      return;
    }
    const isMember = await isRobloxGroupMember(session.userId, ROYAL_FAMILY_GROUP_ID);
    if (!isPlatformAdmin(session.userId) && !isMember) {
      res.status(403).send("Only members of the Royal Family group can delete posts.");
      return;
    }
    const url = new URL(req.url || "", `https://${req.headers.host}`);
    const id = url.searchParams.get("id");
    if (!id) {
      res.status(400).send("Missing post id.");
      return;
    }
    const entries = (await kv.get<RoyalTweetEntry[]>("royalTweets")) || [];
    const next = entries.filter((e) => e.id !== id);
    if (next.length === entries.length) {
      res.status(404).send("Post not found.");
      return;
    }
    await kv.set("royalTweets", next);
    await appendAuditLog({
      type: "royal_tweet_deleted",
      username: session.username,
      detail: `Deleted post ${id}`,
    });
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).send("Method not allowed");
}
