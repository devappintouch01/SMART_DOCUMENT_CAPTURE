import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createSessionToken,
  isValidSessionToken,
  matchCredentials,
  readSession,
  SESSION_MAX_AGE_SECONDS,
} from "./session-token";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "1234";
  process.env.SUPERADMIN_USERNAME = "boss";
  process.env.SUPERADMIN_PASSWORD = "s3cret";
});

describe("session token", () => {
  it("accepts a token it issued until it expires", () => {
    const now = Date.now();
    const token = createSessionToken("admin", now);

    expect(isValidSessionToken(token, now + 1000)).toBe(true);
    expect(isValidSessionToken(token, now + SESSION_MAX_AGE_SECONDS * 1000 + 1)).toBe(false);
  });

  it("rejects missing, tampered and foreign tokens", () => {
    const token = createSessionToken();
    const [payload] = token.split(".");

    expect(isValidSessionToken(undefined)).toBe(false);
    expect(isValidSessionToken(`${payload}.forged`)).toBe(false);

    process.env.SESSION_SECRET = "other-secret";
    expect(isValidSessionToken(token)).toBe(false);
  });
});

describe("session role", () => {
  it("carries the role it was issued with", () => {
    expect(readSession(createSessionToken("superadmin"))?.role).toBe("superadmin");
    expect(readSession(createSessionToken("admin"))?.role).toBe("admin");
  });

  it("cannot be promoted by editing the token", () => {
    const [payload, signature] = createSessionToken("admin").split(".");
    const edited = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), role: "superadmin" }),
    ).toString("base64url");

    expect(readSession(`${edited}.${signature}`)).toBeNull();
  });

  it("treats a token issued before roles existed as admin", () => {
    const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 60_000 })).toString("base64url");
    const signature = createHmac("sha256", "test-secret").update(payload).digest("base64url");

    expect(readSession(`${payload}.${signature}`)?.role).toBe("admin");
  });
});

describe("matchCredentials", () => {
  it("tells the admin login from the superadmin login", () => {
    expect(matchCredentials("admin", "1234")).toBe("admin");
    expect(matchCredentials("boss", "s3cret")).toBe("superadmin");
  });

  it("rejects wrong passwords and mixed-up pairs", () => {
    expect(matchCredentials("admin", "wrong")).toBeNull();
    expect(matchCredentials("someone", "1234")).toBeNull();
    expect(matchCredentials("boss", "1234")).toBeNull();
    expect(matchCredentials("admin", "s3cret")).toBeNull();
  });

  it("keeps the superadmin login off until it is configured", () => {
    delete process.env.SUPERADMIN_PASSWORD;
    expect(matchCredentials("boss", "")).toBeNull();
    expect(matchCredentials("admin", "1234")).toBe("admin");
  });

  it("rejects everything when no credentials are configured", () => {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.SUPERADMIN_PASSWORD;
    expect(matchCredentials("admin", "")).toBeNull();
  });
});
