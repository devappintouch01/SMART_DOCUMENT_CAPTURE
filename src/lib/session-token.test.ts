import { beforeEach, describe, expect, it } from "vitest";
import {
  createSessionToken,
  credentialsMatch,
  isValidSessionToken,
  SESSION_MAX_AGE_SECONDS,
} from "./session-token";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "1234";
});

describe("session token", () => {
  it("accepts a token it issued until it expires", () => {
    const now = Date.now();
    const token = createSessionToken(now);

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

describe("credentialsMatch", () => {
  it("accepts only the configured username and password", () => {
    expect(credentialsMatch("admin", "1234")).toBe(true);
    expect(credentialsMatch("admin", "wrong")).toBe(false);
    expect(credentialsMatch("someone", "1234")).toBe(false);
  });

  it("rejects everything when credentials are not configured", () => {
    delete process.env.ADMIN_PASSWORD;
    expect(credentialsMatch("admin", "")).toBe(false);
  });
});
