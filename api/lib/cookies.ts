import type { VercelRequest, VercelResponse } from "@vercel/node";

export function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const idx = p.indexOf("=");
        return [p.slice(0, idx), decodeURIComponent(p.slice(idx + 1))];
      })
  );
}

interface CookieOptions {
  maxAge?: number;
  httpOnly?: boolean;
}

export function setCookie(
  res: VercelResponse,
  name: string,
  value: string,
  options: CookieOptions = {}
) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (process.env.VERCEL) parts.push("Secure");
  const cookieStr = parts.join("; ");

  const existing = res.getHeader("Set-Cookie");
  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookieStr] as string[]);
  } else if (existing) {
    res.setHeader("Set-Cookie", [existing as string, cookieStr]);
  } else {
    res.setHeader("Set-Cookie", cookieStr);
  }
}
