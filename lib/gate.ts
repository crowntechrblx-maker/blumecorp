import crypto from "node:crypto";

export const GATE_COOKIE_NAME = "wb_gate";

function getGatePassword(): string {
  return process.env.WB_GATE_PASSWORD || "longliveblumecorp";
}

function gateToken(): string {
  return crypto.createHash("sha256").update(getGatePassword()).digest("hex");
}

export function checkGatePassword(password: string): boolean {
  return password === getGatePassword();
}

export function isGateUnlocked(token: string | undefined): boolean {
  return !!token && token === gateToken();
}

export function getGateToken(): string {
  return gateToken();
}
