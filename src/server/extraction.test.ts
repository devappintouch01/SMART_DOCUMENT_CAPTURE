import { describe, expect, it } from "vitest";
import { SEED_DOCUMENT_TYPES } from "@/domain/seeds";
import { createDocumentService } from "./document-service";
import { AiReaderError, type ExtractionOutput } from "./ports";
import { FakeAiReader } from "./testing/fake-ai-reader";
import { InMemoryStore } from "./testing/in-memory-store";

const taxInvoice = SEED_DOCUMENT_TYPES[1];
const field = (name: string) => {
  const found = taxInvoice.fields.find((f) => f.name === name);
  if (!found) throw new Error(`no field ${name}`);
  return found;
};

function setup(concurrency = 4) {
  const store = new InMemoryStore();
  store.documentTypes = SEED_DOCUMENT_TYPES;
  const ai = new FakeAiReader();
  const service = createDocumentService({ store, ai, concurrency });
  return { store, ai, service };
}

function queueTaxInvoice(store: InMemoryStore, fileName = "inv.pdf") {
  return store.addDocument({
    fileName,
    documentTypeId: taxInvoice.id,
    requestedDocumentTypeId: taxInvoice.id,
  });
}

const extracted = (overrides: Partial<Extract<ExtractionOutput, { kind: "extracted" }>> = {}) =>
  ({
    kind: "extracted",
    header: {
      [field("เลขที่ใบกำกับภาษี").id]: { value: "INV-001", flagReason: null },
      [field("วันที่").id]: { value: "2026-10-15", flagReason: null },
      [field("ยอดรวมทั้งสิ้น").id]: { value: "1,070.00", flagReason: null },
      [field("ชื่อผู้ซื้อ").id]: { value: "บริษัท ข", flagReason: "ลายมือไม่ชัด" },
    },
    lineItems: [
      { [field("รายการ").id]: { value: "กระดาษ A4", flagReason: null }, [field("จำนวน").id]: { value: "2", flagReason: null } },
      { [field("รายการ").id]: { value: "หมึก", flagReason: null }, [field("จำนวน").id]: { value: "1", flagReason: null } },
    ],
    ...overrides,
  }) satisfies ExtractionOutput;

describe("processQueue", () => {
  it("reads a Queued Document and stores normalised values, Line Items and Review Flags", async () => {
    const { store, ai, service } = setup();
    const doc = queueTaxInvoice(store);
    ai.willExtract(extracted());

    await service.processQueue();

    const detail = await service.getDocument(doc.id);
    expect(detail?.status).toBe("done");
    expect(detail?.documentType?.name).toBe("ใบกำกับภาษี");
    expect(detail?.extractedData?.header[field("ยอดรวมทั้งสิ้น").id]).toMatchObject({
      value: "1070.00",
      original: "1,070.00",
      flag: null,
    });
    expect(detail?.extractedData?.header[field("ชื่อผู้ซื้อ").id].flag).toEqual({
      reason: "ลายมือไม่ชัด",
      status: "open",
    });
    // Fields the AI left out are present and empty.
    expect(detail?.extractedData?.header[field("สาขาผู้ขาย").id].value).toBeNull();
    expect(detail?.extractedData?.lineItems.map((r) => r[field("รายการ").id].value)).toEqual([
      "กระดาษ A4",
      "หมึก",
    ]);
    expect((await service.listDocuments())[0].openReviewFlagCount).toBe(1);
  });

  it("sends the stored file and the Document's Document Type to the AI", async () => {
    const { store, ai, service } = setup();
    const doc = queueTaxInvoice(store);
    store.files.set(doc.storagePath, new Uint8Array([1, 2, 3]));
    ai.willExtract(extracted());

    await service.processQueue();

    expect(ai.extractCalls).toHaveLength(1);
    expect(ai.extractCalls[0].file).toEqual({ bytes: new Uint8Array([1, 2, 3]), mimeType: "application/pdf" });
    expect(ai.extractCalls[0].documentType.id).toBe(taxInvoice.id);
  });

  it("fails an unreadable Document with the AI's reason", async () => {
    const { store, ai, service } = setup();
    const doc = queueTaxInvoice(store);
    ai.willExtract({ kind: "unreadable", reason: "ภาพมืดเกินไป" });

    await service.processQueue();

    const detail = await service.getDocument(doc.id);
    expect(detail?.status).toBe("failed");
    expect(detail?.failureReason).toBe("ภาพมืดเกินไป");
    expect(detail?.extractedData).toBeNull();
  });

  it("fails with the reader's Thai message when the AI call errors", async () => {
    const { store, ai, service } = setup();
    const doc = queueTaxInvoice(store);
    ai.willExtract(new AiReaderError(false, "AI ปฏิเสธการอ่านเอกสารนี้"));

    await service.processQueue();

    expect((await service.getDocument(doc.id))?.failureReason).toBe("AI ปฏิเสธการอ่านเอกสารนี้");
  });

  it("works through a batch larger than the concurrency limit without exceeding it", async () => {
    const { store, ai, service } = setup(2);
    for (let i = 0; i < 5; i++) queueTaxInvoice(store, `inv-${i}.pdf`);
    ai.willExtract(...Array.from({ length: 5 }, () => extracted()));

    await service.processQueue();

    expect(ai.extractCalls).toHaveLength(5);
    expect(ai.peakConcurrentExtracts).toBe(2);
    expect((await service.listDocuments()).every((d) => d.status === "done")).toBe(true);
  });

  it("never reads the same Document twice when two runs overlap", async () => {
    const { store, ai, service } = setup(4);
    for (let i = 0; i < 3; i++) queueTaxInvoice(store, `inv-${i}.pdf`);
    ai.willExtract(...Array.from({ length: 3 }, () => extracted()));

    await Promise.all([service.processQueue(), service.processQueue()]);

    expect(ai.extractCalls).toHaveLength(3);
  });

  it("does nothing when no Document is Queued", async () => {
    const { store, ai, service } = setup();
    store.addDocument({ status: "done", documentTypeId: taxInvoice.id });

    await service.processQueue();

    expect(ai.extractCalls).toHaveLength(0);
  });
});
