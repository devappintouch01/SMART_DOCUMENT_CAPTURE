import { describe, expect, it } from "vitest";
import { SEED_DOCUMENT_TYPES } from "@/domain/seeds";
import { createDocumentService, UserFacingError } from "./document-service";
import { FakeAiReader } from "./testing/fake-ai-reader";
import { InMemoryStore } from "./testing/in-memory-store";

const [receipt, taxInvoice] = SEED_DOCUMENT_TYPES;

function setup() {
  const store = new InMemoryStore();
  store.documentTypes = SEED_DOCUMENT_TYPES;
  const service = createDocumentService({ store, ai: new FakeAiReader() });
  const add = (fileName: string, documentTypeId: string, status: "queued" | "done" | "failed", minute: number) =>
    store.addDocument({
      fileName,
      documentTypeId,
      status,
      uploadedAt: new Date(Date.UTC(2026, 9, 15, 9, minute)),
    });
  add("inv_001.pdf", taxInvoice.id, "done", 1);
  add("inv_002.pdf", taxInvoice.id, "failed", 2);
  add("slip_may.jpg", receipt.id, "done", 3);
  add("ใบเสร็จ ร้านกาแฟ.png", receipt.id, "queued", 4);
  return { store, service };
}

const names = async (service: ReturnType<typeof setup>["service"], filter = {}) =>
  (await service.listDocuments(filter)).map((d) => d.fileName);

describe("listDocuments filters", () => {
  it("returns everything, newest first, when no filter is given", async () => {
    const { service } = setup();
    expect(await names(service)).toEqual(["ใบเสร็จ ร้านกาแฟ.png", "slip_may.jpg", "inv_002.pdf", "inv_001.pdf"]);
  });

  it("filters by Document Type", async () => {
    const { service } = setup();
    expect(await names(service, { documentTypeId: taxInvoice.id })).toEqual(["inv_002.pdf", "inv_001.pdf"]);
  });

  it("filters by status", async () => {
    const { service } = setup();
    expect(await names(service, { status: "failed" })).toEqual(["inv_002.pdf"]);
    expect(await names(service, { status: "queued" })).toEqual(["ใบเสร็จ ร้านกาแฟ.png"]);
  });

  it("searches file names, ignoring case and surrounding spaces, Thai included", async () => {
    const { service } = setup();
    expect(await names(service, { search: "  INV_ " })).toEqual(["inv_002.pdf", "inv_001.pdf"]);
    expect(await names(service, { search: "กาแฟ" })).toEqual(["ใบเสร็จ ร้านกาแฟ.png"]);
    expect(await names(service, { search: "ไม่มีไฟล์นี้" })).toEqual([]);
  });

  it("combines all three", async () => {
    const { service } = setup();
    expect(await names(service, { documentTypeId: taxInvoice.id, status: "done", search: "inv" })).toEqual([
      "inv_001.pdf",
    ]);
    expect(await names(service, { documentTypeId: receipt.id, status: "done", search: "inv" })).toEqual([]);
  });
});

describe("deleteDocuments", () => {
  it("removes the Documents and their stored files, leaving the rest", async () => {
    const { store, service } = setup();
    const [first, second, third] = store.documents;

    const result = await service.deleteDocuments([first.id, third.id]);

    expect(result).toEqual({ deleted: 2 });
    expect(await names(service)).toEqual(["ใบเสร็จ ร้านกาแฟ.png", "inv_002.pdf"]);
    expect(store.files.has(first.storagePath)).toBe(false);
    expect(store.files.has(third.storagePath)).toBe(false);
    expect(store.files.has(second.storagePath)).toBe(true);
  });

  it("copes with ids that are already gone and rejects an empty selection", async () => {
    const { store, service } = setup();
    const id = store.documents[0].id;

    expect(await service.deleteDocuments([id, "00000000-0000-0000-0000-000000000000"])).toEqual({ deleted: 1 });
    expect(await service.deleteDocuments([id])).toEqual({ deleted: 0 });
    await expect(service.deleteDocuments([])).rejects.toBeInstanceOf(UserFacingError);
  });

  it("does not let a read that finishes later bring a deleted Document back", async () => {
    const { store, service } = setup();
    const doc = store.addDocument({ status: "extracting", documentTypeId: receipt.id });

    await service.deleteDocuments([doc.id]);
    await store.completeExtraction(doc.id, { header: {}, lineItems: [] });

    expect(store.documents.find((d) => d.id === doc.id)).toBeUndefined();
  });
});
