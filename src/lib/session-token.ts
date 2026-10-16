import { createHmac, timingSafeEqual } from "node:crypto";

// Two shared logins (ADR 0002): the admin login, and a superadmin login that
// also unlocks the AI call log and usage report. The session records which one
// signed in and when it expires.

export type Role = "admin" | "superadmin";

export const SESSION_COOKIE = "sdc_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(role: Role = "admin", now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: now + SESSION_MAX_AGE_SECONDS * 1000, role }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

// Who the token belongs to, or null when it is missing, forged or expired.
// A token with no role (issued before roles existed) counts as admin.
export function readSession(
  token: string | undefined,
  now = Date.now(),
): { role: Role } | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }

  try {
    const { exp, role } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof exp !== "number" || exp <= now) return null;
    return { role: role === "superadmin" ? "superadmin" : "admin" };
  } catch {
    return null;
  }
}

export function isValidSessionToken(token: string | undefined, now = Date.now()): boolean {
  return readSession(token, now) !== null;
}

function matches(username: string, password: string, userKey: string, passwordKey: string): boolean {
  const expectedUser = process.env[userKey];
  const expectedPassword = process.env[passwordKey];
  if (!expectedUser || !expectedPassword) return false;
  return safeEqual(username, expectedUser) && safeEqual(password, expectedPassword);
}

// Which login these credentials are, or null. The superadmin login is off
// until SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD are both set.
export function matchCredentials(username: string, password: string): Role | null {
  if (matches(username, password, "SUPERADMIN_USERNAME", "SUPERADMIN_PASSWORD")) return "superadmin";
  if (matches(username, password, "ADMIN_USERNAME", "ADMIN_PASSWORD")) return "admin";
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const left = createHmac("sha256", "compare").update(a).digest();
  const right = createHmac("sha256", "compare").update(b).digest();
  return timingSafeEqual(left, right);
}
