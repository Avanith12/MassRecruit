import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import type { Role } from "./rules";

const PROD = process.env.NODE_ENV === "production";
// __Host- prefix: browser only accepts it with Secure, Path=/ and no Domain (blocks subdomain overwrite).
const COOKIE = PROD ? "__Host-mr_session" : "mr_session";
const MAX_AGE_S = 60 * 60 * 24 * 7; // 7 days

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET ?? "";
  const min = PROD ? 32 : 16;
  if (s.length < min || (PROD && /change-me/i.test(s))) {
    throw new Error(`AUTH_SECRET must be set to a random string of at least ${min} characters.`);
  }
  return new TextEncoder().encode(s);
}

export async function createSession(user: { id: string; sessionVersion: number }): Promise<void> {
  const token = await new SignJWT({ v: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: PROD,
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

async function readSession(): Promise<{ sub: string; v: number } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.v !== "number") return null;
    return { sub: payload.sub, v: payload.v };
  } catch {
    return null;
  }
}

/** Sign out everywhere: bump the user's sessionVersion so every issued token stops working. */
export async function destroySession(): Promise<void> {
  const s = await readSession();
  if (s) await db.user.updateMany({ where: { id: s.sub }, data: { sessionVersion: { increment: 1 } } });
  (await cookies()).delete(COOKIE);
}

/** Current user loaded fresh from the DB (so role/verification/revocation apply immediately). */
export async function getCurrentUser() {
  const s = await readSession();
  if (!s) return null;
  const user = await db.user.findUnique({
    where: { id: s.sub },
    select: { id: true, username: true, name: true, email: true, role: true, verified: true, sessionVersion: true, emailVerifiedAt: true },
  });
  if (!user || user.sessionVersion !== s.v) return null;
  return user;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Redirects to /login unless signed in with one of `roles`. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role as Role)) redirect("/studies?denied=1");
  // Admin powers require a confirmed email (ADMIN_EMAILS alone could be claimed by anyone).
  if (user.role === "ADMIN" && !user.emailVerifiedAt) redirect("/verify-email");
  return user;
}

export function homeFor(role: string): string {
  return role === "ADMIN" ? "/admin" : role === "RESEARCHER" ? "/researcher" : "/student";
}

/**
 * Client IP for rate limiting. Hosting platforms (Vercel, Render, Fly…) set
 * x-forwarded-for / x-real-ip; behind no proxy this falls back to "local".
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (xff || h.get("x-real-ip") || "local").slice(0, 64);
}
