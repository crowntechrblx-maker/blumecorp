import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kv } from "../../lib/kv.js";
import { parseCookies } from "../../lib/cookies.js";
import { decodeSession } from "../../lib/session.js";
import { isPlatformAdmin } from "../../lib/roblox.js";
import { containsBlockedLanguage, MODERATION_REJECTION_MESSAGE } from "../../lib/moderation.js";
import { appendAuditLog } from "../../lib/audit.js";

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
  // Deletion never actually erases the row — it's flagged so Blume
  // Monitoring can still surface it. Every ordinary read path (this file's
  // own GET) filters deleted messages out, so nothing changes for regular
  // users; only Monitoring reads the flag itself.
  deleted?: boolean;
  deletedAt?: number;
  // Set once the recipient has opened the conversation it belongs to.
  // Used to compute the unread badge shown next to each contact.
  readAt?: number;
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

    // Unread counts per sender, for the badge shown next to each contact
    // in the sidebar — kept on this same endpoint rather than a new
    // function file, since Vercel Hobby caps serverless functions at 12.
    if (req.query.unread === "1") {
      const me = session.username.toLowerCase();
      const all = (await kv.get<MessageEntry[]>("messages")) || [];
      const counts: Record<string, number> = {};
      for (const m of all) {
        if (m.deleted || m.readAt) continue;
        if (m.toUsername.toLowerCase() !== me) continue;
        const from = m.fromUsername.toLowerCase();
        counts[from] = (counts[from] || 0) + 1;
      }
      res.status(200).json(counts);
      return;
    }

    const withUser = ((req.query.with as string) || "").trim();
    if (!withUser) {
      res.status(400).send("Missing 'with' query parameter.");
      return;
    }
    const key = conversationKey(session.username, withUser);
    const all = (await kv.get<MessageEntry[]>("messages")) || [];

    // Opening a conversation is what marks the other person's messages as
    // read — same trigger a real chat app uses.
    const me = session.username.toLowerCase();
    const otherLower = withUser.toLowerCase();
    let mutated = false;
    const now = Date.now();
    for (const m of all) {
      if (
        m.conversationKey === key &&
        !m.deleted &&
        !m.readAt &&
        m.toUsername.toLowerCase() === me &&
        m.fromUsername.toLowerCase() === otherLower
      ) {
        m.readAt = now;
        mutated = true;
      }
    }
    if (mutated) await kv.set("messages", all);

    const messages = all
      .filter((m) => m.conversationKey === key && !m.deleted)
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
      if (containsBlockedLanguage(text)) {
        res.status(400).send(MODERATION_REJECTION_MESSAGE);
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

      await appendAuditLog({
        type: "message_sent",
        username: session.username,
        detail: `To ${recipient.username}: "${text.slice(0, 140)}"`,
      });

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

  if (req.method === "DELETE") {
    if (!session) {
      res.status(401).send("You must be signed in.");
      return;
    }
    const id = (req.query.id as string) || "";
    const entries = (await kv.get<MessageEntry[]>("messages")) || [];
    const index = entries.findIndex((m) => m.id === id);
    if (index === -1) {
      res.status(404).send("Message not found.");
      return;
    }
    const message = entries[index];
    if (!isPlatformAdmin(session.userId)) {
      res.status(403).send("Only an admin can delete messages.");
      return;
    }
    entries[index] = { ...message, deleted: true, deletedAt: Date.now() };
    await kv.set("messages", entries);

    await appendAuditLog({
      type: "message_deleted",
      username: session.username,
      detail: `Admin-deleted a message from ${message.fromUsername} to ${message.toUsername}`,
    });

    res.status(204).end();
    return;
  }

  res.status(405).send("Method not allowed");
}
