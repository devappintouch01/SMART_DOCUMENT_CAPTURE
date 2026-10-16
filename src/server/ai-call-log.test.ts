import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { NewAiCall } from "@/domain/ai-usage";
import { SEED_DOCUMENT_TYPES } from "@/domain/seeds";
import { createDocumentService } from "./document-service";
import { FakeAiReader } from "./testing/fake-ai-reader";
import { InMemoryStore } from "./testing/in-memory-store";

// claude-ai-reader imports "server-only", which only resolves inside Next.
vi.mock("server-only", () => ({}));
const { ClaudeAiReader } = await import("./claude-ai-reader");

const taxInvoice = SEED_DOCUMENT_TYPES[1];
const file = { bytes: new Uint8Array([1, 2, 3]), mimeType: "application/pdf" };

// A stand-in for the SDK client: only the one method the reader calls.
function fakeClient(create: () => Promise<unknown>) {
  return { beta: { messages: { create } } } as unknown as Anthropic;
}

const okResponse = {
  model: "claude-opus-5-5",
  stop_reason: "end_turn",
  usage: { input_tokens: 10_000, output_tokens: 1_000 },
  content: [{ type: "text", text: JSON.stringify({ readable: true, unreadable_reason: "", header: {}, line_items: [] }) }],
};

describe("AI call log", () => {
  it("writes down the model, tokens, cost and time of a call, tied to its Document", async () => {
    const calls: NewAiCall[] = [];
    const reader = new ClaudeAiReader(
      fakeClient(async () => okResponse),
      "claude-opus-5-5",
      "claude-haiku-5-5",
      async (call) => void calls.push(call),
    );

    await reader.extract(file, taxInvoice, { documentId: "doc-1" });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      documentId: "doc-1",
      operation: "extract",
      provider: "anthropic",
      model: "claude-opus-5-5",
      inputTokens: 10_000,
      outputTokens: 1_000,
      status: "ok",
      error: null,
    });
    // 10,000 in at $4/M + 1,000 out at $20/M
    expect(calls[0].costUsd).toBeCloseTo(0.06);
    expect(calls[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("logs a failed call with the reason, and still raises the error", async () => {
    const calls: NewAiCall[] = [];
    const overloaded = Anthropic.APIError.generate(
      529,
      { type: "error", error: { type: "overloaded_error", message: "busy" } },
      "529 busy",
      new Headers(),
    );
    const reader = new ClaudeAiReader(
      fakeClient(async () => {
        throw overloaded;
      }),
      "claude-opus-5-5",
      "claude-haiku-5-5",
      async (call) => void calls.push(call),
    );

    await expect(reader.extract(file, taxInvoice, { documentId: "doc-1" })).rejects.toMatchObject({
      retryable: true,
    });

    expect(calls[0]).toMatchObject({ status: "error", model: "claude-opus-5-5", error: "บริการ AI ไม่ว่างชั่วคราว" });
    expect(calls[0].inputTokens).toBeNull();
  });

  it("does not fail the reading when the log cannot be written", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const reader = new ClaudeAiReader(
      fakeClient(async () => okResponse),
      "claude-opus-5-5",
      "claude-haiku-5-5",
      async () => {
        throw new Error("database down");
      },
    );

    await expect(reader.extract(file, taxInvoice)).resolves.toMatchObject({ kind: "extracted" });
    error.mockRestore();
  });
});

describe("Document completion time and usage report", () => {
  it("records when an Extraction finished", async () => {
    const store = new InMemoryStore();
    store.documentTypes = SEED_DOCUMENT_TYPES;
    const ai = new FakeAiReader().willExtract({ kind: "extracted", header: {}, lineItems: [] });
    const service = createDocumentService({ store, ai, concurrency: 4 });
    const doc = store.addDocument({ documentTypeId: taxInvoice.id, requestedDocumentTypeId: taxInvoice.id });

    expect((await service.getDocument(doc.id))?.completedAt).toBeNull();
    await service.processQueue();

    expect((await service.getDocument(doc.id))?.completedAt).toBeInstanceOf(Date);
  });

  it("reports cost per model and per Document from the logged calls", async () => {
    const store = new InMemoryStore();
    const service = createDocumentService({ store, ai: new FakeAiReader(), concurrency: 4 });
    const base = {
      provider: "anthropic",
      startedAt: new Date(),
      durationMs: 9000,
      inputTokens: 1,
      outputTokens: 1,
      status: "ok" as const,
      error: null,
    };
    await store.recordAiCall({ ...base, documentId: "d1", operation: "extract", model: "opus", costUsd: 0.05 });
    await store.recordAiCall({ ...base, documentId: "d1", operation: "classify", model: "haiku", costUsd: 0.01 });

    const report = await service.getAiUsageReport();

    expect(report.models.map((m) => m.model).sort()).toEqual(["haiku", "opus"]);
    expect(report.averageCostPerDocumentUsd).toBeCloseTo(0.06);
    expect(report.totalCostUsd).toBeCloseTo(0.06);
  });
});
