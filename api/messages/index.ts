import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kv } from "../lib/kv.js";
import { parseCookies } from "../lib/cookies.js";
import { decodeSession } from "../lib/session.js";

interface KnownUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
  lastSeen: number;
}

interface MessageEntry {
  id: string;
  conversationKey: string;
  fromUsername: string;
  toUsername: string;
  text: string;
  createdAt: number;
}

function conversationKey(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join("::");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req);
  const session = decodeSession(cookies.wb_session);

  if (req.method === "GET") {
    if (!session) {
      res.status(401).send("You must be signed in.");
      return;
    }
    const withUser = ((req.query.with as string) || "").trim();
    if (!withUser) {
      res.status(400).send("Missing 'with' query parameter.");
      return;
    }
    const key = conversationKey(session.username, withUser);
    const messages = ((await kv.get<MessageEntry[]>("messages")) || [])
      .filter((m) => m.conversationKey === key)
      .sort((a, b) => a.createdAt - b.createdAt);
    res.status(200).json(
      messages.map((m) => ({
        id: m.id,
        from: m.fromUsername,
        text: m.text,
        createdAt: m.createdAt,
        isMine: m.fromUsername.toLowerCase() === session.username.toLowerCase(),
      }))
    );
    return;
  }

  if (req.method === "POST") {
    if (!session) {
      res.status(401).send("You must be signed in to send a message.");
      return;
    }
    try {
      const body = req.body as { to?: string; text?: string };
      const to = (body.to || "").toString().trim();
      const text = (body.text || "").toString().trim();
      if (!to || !text) {
        res.status(400).send("Both 'to' and 'text' are required.");
        return;
      }
      if (text.length > 2000) {
        res.status(400).send("Message is too long (max 2000 characters).");
        return;
      }

      const knownUsers = (await kv.get<KnownUser[]>("users")) || [];
      const recipient = knownUsers.find((u) => u.username.toLowerCase() === to.toLowerCase());
      if (!recipient) {
        res.status(404).send("That user hasn't signed in to Westbridge OS.");
        return;
      }

      const entry: MessageEntry = {
        id: crypto.randomBytes(12).toString("hex"),
        conversationKey: conversationKey(session.username, to),
        fromUsername: session.username,
        toUsername: recipient.username,
        text,
        createdAt: Date.now(),
      };
      const entries = (await kv.get<MessageEntry[]>("messages")) || [];
      entries.push(entry);
      await kv.set("messages", entries);

      res.status(200).json({
        id: entry.id,
        from: entry.fromUsername,
        text: entry.text,
        createdAt: entry.createdAt,
        isMine: true,
      });
    } catch (err) {
      res.status(500).send("Send failed: " + (err as Error).message);
    }
    return;
  }

  res.status(405).send("Method not allowed");
}
