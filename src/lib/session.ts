import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { readSession, SESSION_COOKIE, type Role } from "./session-token";

// Who is signed in, read from the session cookie (null when nobody is).
export async function getRole(): Promise<Role | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return readSession(token)?.role ?? null;
}

// For pages and actions that only a superadmin may use. Anyone else gets the
// same "not found" as a page that does not exist.
export async function requireSuperAdmin(): Promise<void> {
  if ((await getRole()) !== "superadmin") notFound();
}
