import { describe, expect, it } from "vitest";
import { averageCostPerDocument, summarizeAiCalls, summarizeByDocument, toBaht, type AiCall } from "./ai-usage";

const call = (overrides: Partial<AiCall>): AiCall => ({
  id: crypto.randomUUID(),
  documentId: "d1",
  operation: "extract",
  provider: "anthropic",
  model: "opus",
  startedAt: new Date("2026-10-16T00:00:00Z"),
  durationMs: 10_000,
  inputTokens: 1000,
  outputTokens: 100,
  costUsd: 0.05,
  status: "ok",
  error: null,
  isLegacy: false,
  ...overrides,
});

describe("summarizeAiCalls", () => {
  it("adds up everything spent on a Document, whichever call it was", () => {
    const [opus] = summarizeAiCalls([
      call({ documentId: "d1", costUsd: 0.05 }),
      call({ documentId: "d1", operation: "classify", costUsd: 0.01, durationMs: 1000 }),
      call({ documentId: "d2", costUsd: 0.03 }),
    ]);

    expect(opus.documents).toBe(2);
    expect(opus.totalCostUsd).toBeCloseTo(0.09);
    expect(opus.avgCostPerDocumentUsd).toBeCloseTo(0.045); // (0.06 + 0.03) / 2
  });

  it("averages extract time over successful extract calls only", () => {
    const [opus] = summarizeAiCalls([
      call({ durationMs: 10_000 }),
      call({ durationMs: 20_000 }),
      call({ durationMs: 500, status: "error" }),
      call({ operation: "classify", durationMs: 1000 }),
    ]);

    expect(opus.avgExtractMs).toBe(15_000);
    expect(opus.failedCalls).toBe(1);
  });

  it("counts legacy rows as calls but does not invent cost or time from them", () => {
    const [opus] = summarizeAiCalls([
      call({ isLegacy: true, costUsd: null, durationMs: null, inputTokens: null, outputTokens: null }),
    ]);

    expect(opus.calls).toBe(1);
    expect(opus.measuredCalls).toBe(0);
    expect(opus.avgCostPerDocumentUsd).toBeNull();
    expect(opus.avgExtractMs).toBeNull();
  });

  it("keeps a row per provider and model, busiest first", () => {
    const rows = summarizeAiCalls([
      call({ model: "haiku" }),
      call({ model: "opus" }),
      call({ model: "opus", documentId: "d2" }),
    ]);

    expect(rows.map((r) => r.model)).toEqual(["opus", "haiku"]);
  });
});

describe("averageCostPerDocument", () => {
  it("averages what each Document cost across models, ignoring unmeasured calls", () => {
    const calls = [
      call({ documentId: "d1", costUsd: 0.05 }),
      call({ documentId: "d1", model: "haiku", operation: "classify", costUsd: 0.01 }),
      call({ documentId: "d2", costUsd: 0.03 }),
      call({ documentId: "d3", costUsd: null, isLegacy: true }),
    ];

    expect(averageCostPerDocument(calls)).toBeCloseTo(0.045);
    expect(averageCostPerDocument([])).toBeNull();
  });
});

describe("summarizeByDocument", () => {
  it("gives the total cost and the model that did the reading", () => {
    const summary = summarizeByDocument([
      call({ documentId: "d1", operation: "classify", model: "haiku", costUsd: 0.001, startedAt: new Date("2026-10-16T00:00:00Z") }),
      call({ documentId: "d1", operation: "extract", model: "opus", costUsd: 0.05, startedAt: new Date("2026-10-16T00:00:05Z") }),
    ]);

    expect(summary.d1.costUsd).toBeCloseTo(0.051);
    expect(summary.d1.model).toBe("opus");
  });

  it("names the latest model after a re-read with another model", () => {
    const summary = summarizeByDocument([
      call({ documentId: "d1", model: "opus", startedAt: new Date("2026-10-16T00:00:00Z") }),
      call({ documentId: "d1", model: "haiku", startedAt: new Date("2026-10-17T00:00:00Z") }),
    ]);

    expect(summary.d1.model).toBe("haiku");
  });

  it("knows the model of a legacy Document but not its cost", () => {
    const summary = summarizeByDocument([call({ documentId: "d1", isLegacy: true, costUsd: null })]);

    expect(summary.d1).toEqual({ costUsd: null, model: "opus" });
  });
});

describe("toBaht", () => {
  it("converts at 35 baht to the dollar", () => {
    expect(toBaht(0.059)).toBeCloseTo(2.065);
  });
});
