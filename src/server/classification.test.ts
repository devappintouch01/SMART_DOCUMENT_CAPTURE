import { describe, expect, it } from "vitest";
import { SEED_DOCUMENT_TYPES } from "@/domain/seeds";
import { toExtractedValue } from "@/domain/extracted-data";
import {
  AUTO_CLASSIFY,
  createDocumentService,
  NO_MATCHING_TYPE,
  UserFacingError,
} from "./document-service";
import { AiReaderError, type ExtractionOutput } from "./ports";
import { FakeAiReader } from "./testing/fake-ai-reader";
import { InMemoryStore } from "./testing/in-memory-store";

const [receipt, taxInvoice] = SEED_DOCUMENT_TYPES;
const extracted: ExtractionOutput = { kind: "extracted", header: {}, lineItems: [] };
const file = (name: string) => ({
  storagePath: `${name}.pdf`,
  fileName: `${name}.pdf`,
  mimeType: "application/pdf",
  pageCount: 1,
});

function setup() {
  const store = new InMemoryStore();
  store.documentTypes = SEED_DOCUMENT_TYPES;
  const ai = new FakeAiReader();
  const service = createDocumentService({ store, ai });
  return { store, ai, service };
}

describe("uploading with ให้ AI เลือกประเภทเอกสารให้", () => {
  it("creates Documents with no Document Type yet", async () => {
    const { service } = setup();

    await service.registerUploads({ documentTypeId: AUTO_CLASSIFY, files: [file("a")] });

    const [document] = await service.listDocuments();
    expect(document.documentTypeId).toBeNull();
    expect(document.status).toBe("queued");
  });

  it("sorts a mixed batch: Classification picks each type, then that type is extracted", async () => {
    const { ai, service } = setup();
    await service.registerUploads({
      documentTypeId: AUTO_CLASSIFY,
      files: [file("receipt"), file("invoice")],
    });
    ai.willClassify(
      { documentTypeId: receipt.id, reason: "ใบเสร็จ" },
      { documentTypeId: taxInvoice.id, reason: "ใบกำกับภาษี" },
    );
    ai.willExtract((_file, type) => {
      expect(type.id).not.toBeNull();
      return extracted;
    }, extracted);

    await service.processQueue();

    const byName = Object.fromEntries(
      (await service.listDocuments()).map((d) => [d.fileName, d]),
    );
    expect(byName["receipt.pdf"]).toMatchObject({ status: "done", documentTypeName: "ใบเสร็จรับเงิน" });
    expect(byName["invoice.pdf"]).toMatchObject({ status: "done", documentTypeName: "ใบกำกับภาษี" });
    expect(ai.classifyCalls[0].documentTypes.map((t) => t.name)).toEqual([
      "ใบเสร็จรับเงิน",
      "ใบกำกับภาษี",
      "ใบเบิกสินค้า",
    ]);
    expect(ai.extractCalls.map((c) => c.documentType.name).sort()).toEqual([
      "ใบกำกับภาษี",
      "ใบเสร็จรับเงิน",
    ]);
  });

  it("fails with ไม่พบประเภทเอกสารที่ตรงกัน when nothing fits, without extracting", async () => {
    const { ai, service } = setup();
    await service.registerUploads({ documentTypeId: AUTO_CLASSIFY, files: [file("menu")] });
    ai.willClassify({ documentTypeId: null, reason: "เป็นเมนูอาหาร" });

    await service.processQueue();

    const [document] = await service.listDocuments();
    expect(document.status).toBe("failed");
    expect(document.failureReason).toBe(`${NO_MATCHING_TYPE}: เป็นเมนูอาหาร`);
    expect(ai.extractCalls).toHaveLength(0);
  });

  it("skips Classification when the user chose a Document Type", async () => {
    const { ai, service } = setup();
    await service.registerUploads({ documentTypeId: receipt.id, files: [file("a")] });
    ai.willExtract(extracted);

    await service.processQueue();

    expect(ai.classifyCalls).toHaveLength(0);
    expect(ai.extractCalls[0].documentType.id).toBe(receipt.id);
  });

  it("keeps the classified type when only the Extraction needs a retry", async () => {
    const { store, ai, service } = setup();
    await service.registerUploads({ documentTypeId: AUTO_CLASSIFY, files: [file("a")] });
    ai.willClassify({ documentTypeId: taxInvoice.id, reason: "" });
    ai.willExtract(new AiReaderError(true, "บริการ AI ไม่ว่างชั่วคราว"), extracted);

    await service.processQueue();
    store.documents[0].nextAttemptAt = null;
    await service.processQueue();

    expect(ai.classifyCalls).toHaveLength(1);
    expect(store.documents[0]).toMatchObject({ status: "done", documentTypeId: taxInvoice.id });
  });
});

describe("rerunExtraction", () => {
  async function doneTaxInvoice() {
    const ctx = setup();
    const field = taxInvoice.fields[0];
    const doc = ctx.store.addDocument({
      status: "done",
      documentTypeId: receipt.id,
      extractedData: {
        header: { [field.id]: { ...toExtractedValue("text", { value: "x", flagReason: null }), corrected: true } },
        lineItems: [],
      },
    });
    return { ...ctx, doc };
  }

  it("changes the Document Type, drops old values and Corrections, and extracts again", async () => {
    const { store, ai, service, doc } = await doneTaxInvoice();
    ai.willExtract(extracted);

    await service.rerunExtraction(doc.id, taxInvoice.id);
    expect(store.documents[0]).toMatchObject({ status: "queued", extractedData: null, documentTypeId: taxInvoice.id });

    await service.processQueue();
    expect(ai.extractCalls[0].documentType.id).toBe(taxInvoice.id);
    expect(store.documents[0].status).toBe("done");
  });

  it("can hand the choice back to Classification", async () => {
    const { ai, service, doc } = await doneTaxInvoice();
    ai.willClassify({ documentTypeId: taxInvoice.id, reason: "" });
    ai.willExtract(extracted);

    await service.rerunExtraction(doc.id, AUTO_CLASSIFY);
    await service.processQueue();

    expect(ai.classifyCalls).toHaveLength(1);
    expect((await service.getDocument(doc.id))?.documentType?.id).toBe(taxInvoice.id);
  });

  it("refuses while the Document is still being read, and refuses unknown types", async () => {
    const { store, service, doc } = await doneTaxInvoice();

    await expect(service.rerunExtraction(doc.id, "nope")).rejects.toBeInstanceOf(UserFacingError);
    store.documents[0].status = "extracting";
    await expect(service.rerunExtraction(doc.id, receipt.id)).rejects.toBeInstanceOf(UserFacingError);
  });
});
