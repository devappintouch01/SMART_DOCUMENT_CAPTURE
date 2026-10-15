import { describe, expect, it } from "vitest";
import { SEED_DOCUMENT_TYPES } from "@/domain/seeds";
import {
  ABANDONED_AFTER_MS,
  createDocumentService,
  MAX_ATTEMPTS,
  UserFacingError,
} from "./document-service";
import { AiReaderError, type ExtractionOutput } from "./ports";
import { FakeAiReader } from "./testing/fake-ai-reader";
import { InMemoryStore } from "./testing/in-memory-store";

const receipt = SEED_DOCUMENT_TYPES[0];
const extracted: ExtractionOutput = { kind: "extracted", header: {}, lineItems: [] };
const busy = () => new AiReaderError(true, "บริการ AI ไม่ว่างชั่วคราว");

function setup() {
  let clock = new Date("2026-10-15T09:00:00Z");
  const store = new InMemoryStore();
  store.documentTypes = SEED_DOCUMENT_TYPES;
  store.now = () => clock;
  const ai = new FakeAiReader();
  const service = createDocumentService({ store, ai, now: () => clock });
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  const doc = store.addDocument({ documentTypeId: receipt.id, requestedDocumentTypeId: receipt.id });
  const stored = () => store.documents.find((d) => d.id === doc.id)!;
  return { store, ai, service, advance, stored, clock: () => clock };
}

describe("transient failures", () => {
  it("wait 10 s, go back to the queue and then succeed", async () => {
    const { ai, service, advance, stored, clock } = setup();
    ai.willExtract(busy(), extracted);

    await service.processQueue();
    expect(stored().status).toBe("queued");
    expect(stored().nextAttemptAt?.getTime()).toBe(clock().getTime() + 10_000);

    // Not claimable before the wait is over.
    advance(5_000);
    await service.processQueue();
    expect(ai.extractCalls).toHaveLength(1);

    advance(5_000);
    await service.processQueue();
    expect(stored().status).toBe("done");
    expect(ai.extractCalls).toHaveLength(2);
  });

  it("back off 10 s, 30 s, 90 s and fail after the last retry with the reader's reason", async () => {
    const { ai, service, advance, stored } = setup();
    ai.willExtract(...Array.from({ length: MAX_ATTEMPTS }, busy));
    const waits: number[] = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await service.processQueue();
      if (stored().status === "queued") {
        const startedAt = stored().nextAttemptAt!.getTime();
        waits.push(startedAt);
        advance(120_000);
      }
    }

    expect(ai.extractCalls).toHaveLength(MAX_ATTEMPTS);
    expect(stored().status).toBe("failed");
    expect(stored().failureReason).toBe("บริการ AI ไม่ว่างชั่วคราว");
    // Each wait is measured from the moment that attempt failed.
    const base = new Date("2026-10-15T09:00:00Z").getTime();
    expect(waits.map((t, i) => t - (base + i * 120_000))).toEqual([10_000, 30_000, 90_000]);
  });

  it("include unexpected errors such as a storage hiccup", async () => {
    const { store, ai, service, stored } = setup();
    store.files.delete(stored().storagePath);
    ai.willExtract(extracted);

    await service.processQueue();

    expect(stored().status).toBe("queued");
    expect(ai.extractCalls).toHaveLength(0);
  });
});

describe("permanent failures", () => {
  it("fail immediately without retrying", async () => {
    const { ai, service, advance, stored } = setup();
    ai.willExtract(new AiReaderError(false, "AI รับไฟล์นี้ไม่ได้ (ไฟล์อาจเสียหาย)"));

    await service.processQueue();
    advance(120_000);
    await service.processQueue();

    expect(stored().status).toBe("failed");
    expect(stored().failureReason).toBe("AI รับไฟล์นี้ไม่ได้ (ไฟล์อาจเสียหาย)");
    expect(ai.extractCalls).toHaveLength(1);
  });
});

describe("abandoned Extractions", () => {
  it("go back to the queue after 5 minutes and count as an attempt", async () => {
    const { ai, service, advance, stored, clock } = setup();
    Object.assign(stored(), { status: "extracting", attemptCount: 1, extractingSince: clock() });
    ai.willExtract(extracted);

    advance(ABANDONED_AFTER_MS - 1_000);
    await service.processQueue();
    expect(stored().status).toBe("extracting");

    advance(2_000);
    await service.processQueue();
    expect(stored().status).toBe("queued");
    expect(stored().nextAttemptAt?.getTime()).toBe(clock().getTime() + 10_000);

    advance(10_000);
    await service.processQueue();
    expect(stored().status).toBe("done");
    expect(stored().attemptCount).toBe(2);
  });

  it("fail once their attempts are used up", async () => {
    const { service, advance, stored, clock } = setup();
    Object.assign(stored(), { status: "extracting", attemptCount: MAX_ATTEMPTS, extractingSince: clock() });

    advance(ABANDONED_AFTER_MS + 1_000);
    await service.processQueue();

    expect(stored().status).toBe("failed");
    expect(stored().failureReason).toMatch(/นานผิดปกติ/);
  });
});

describe("retryExtraction", () => {
  it("re-queues a Failed Document with fresh attempts", async () => {
    const { ai, service, stored } = setup();
    ai.willExtract(new AiReaderError(false, "AI ปฏิเสธการอ่านเอกสารนี้"), extracted);
    await service.processQueue();
    expect(stored().status).toBe("failed");

    await service.retryExtraction(stored().id);
    expect(stored()).toMatchObject({ status: "queued", attemptCount: 0, failureReason: null });

    await service.processQueue();
    expect(stored().status).toBe("done");
  });

  it("refuses Documents that are not Failed", async () => {
    const { service, stored } = setup();
    await expect(service.retryExtraction(stored().id)).rejects.toBeInstanceOf(UserFacingError);
  });
});
