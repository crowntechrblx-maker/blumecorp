import crypto from "node:crypto";
import { kv } from "./kv.js";

export interface AuditEntry {
  id: string;
  type: string;
  username: string;
  detail: string;
  createdAt: number;
}

const MAX_AUDIT_ENTRIES = 1000;

export async function appendAuditLog(entry: {
  type: string;
  username: string;
  detail: string;
}): Promise<void> {
  const full: AuditEntry = {
    id: crypto.randomBytes(8).toString("hex"),
    createdAt: Date.now(),
    ...entry,
  };
  const entries = (await kv.get<AuditEntry[]>("auditLog")) || [];
  entries.push(full);
  if (entries.length > MAX_AUDIT_ENTRIES) {
    entries.splice(0, entries.length - MAX_AUDIT_ENTRIES);
  }
  await kv.set("auditLog", entries);
}

export async function getAuditLog(limit = 300): Promise<AuditEntry[]> {
  const entries = (await kv.get<AuditEntry[]>("auditLog")) || [];
  return entries.slice(-limit).reverse();
}
