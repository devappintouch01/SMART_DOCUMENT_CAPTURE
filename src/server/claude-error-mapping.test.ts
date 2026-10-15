import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

// claude-ai-reader imports "server-only", which only resolves inside Next.
vi.mock("server-only", () => ({}));
const { toReaderError } = await import("./claude-ai-reader");

const apiError = (status: number, message: string) =>
  Anthropic.APIError.generate(
    status,
    { type: "error", error: { type: "invalid_request_error", message } },
    `${status} ${message}`,
    new Headers(),
  );

describe("toReaderError", () => {
  it.each([
    [429, "rate limited"],
    [500, "server error"],
    [529, "overloaded"],
  ])("treats %s as temporary, worth retrying", (status, message) => {
    const mapped = toReaderError(apiError(status, message));
    expect(mapped.retryable).toBe(true);
    expect(mapped.userMessage).toBe("บริการ AI ไม่ว่างชั่วคราว");
  });

  it("says plainly when the credit balance is empty, and does not retry", () => {
    const mapped = toReaderError(
      apiError(400, "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing."),
    );
    expect(mapped.retryable).toBe(false);
    expect(mapped.userMessage).toMatch(/เครดิต Anthropic หมด/);
  });

  it("blames the file only for other bad requests", () => {
    const mapped = toReaderError(apiError(400, "Could not process PDF"));
    expect(mapped.retryable).toBe(false);
    expect(mapped.userMessage).toMatch(/ไฟล์อาจเสียหาย/);
  });

  it("reports a bad API key as a setup problem", () => {
    const mapped = toReaderError(apiError(401, "invalid x-api-key"));
    expect(mapped.retryable).toBe(false);
    expect(mapped.userMessage).toMatch(/API key/);
  });
});
