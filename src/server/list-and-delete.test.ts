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

describe("listDocumentsPage", () => {
  async function many(count: number) {
    const store = new InMemoryStore();
    store.documentTypes = SEED_DOCUMENT_TYPES;
    const service = createDocumentService({ store, ai: new FakeAiReader() });
    for (let i = 1; i <= count; i++) {
      store.addDocument({
        fileName: `doc-${String(i).padStart(2, "0")}.${i % 2 ? "pdf" : "jpg"}`,
        mimeType: i % 2 ? "application/pdf" : "image/jpeg",
        documentTypeId: receipt.id,
        status: "done",
        uploadedAt: new Date(Date.UTC(2026, 9, 15, 9, i)),
      });
    }
    return { store, service };
  }
  const first = { page: 1, pageSize: 10 as const };

  it("returns one page, newest first, with the total and a running-number offset", async () => {
    const { service } = await many(25);

    const p1 = await service.listDocumentsPage({}, first);
    const p3 = await service.listDocumentsPage({}, { page: 3, pageSize: 10 });

    expect(p1).toMatchObject({ total: 25, page: 1, pageCount: 3, offset: 0 });
    expect(p1.items.map((d) => d.fileName).slice(0, 2)).toEqual(["doc-25.pdf", "doc-24.jpg"]);
    expect(p1.items).toHaveLength(10);
    expect(p3).toMatchObject({ page: 3, offset: 20 });
    expect(p3.items.map((d) => d.fileName)).toEqual(["doc-05.pdf", "doc-04.jpg", "doc-03.pdf", "doc-02.jpg", "doc-01.pdf"]);
  });

  it("shows everything for \"all\", and clamps a page that is out of range", async () => {
    const { service } = await many(25);

    const all = await service.listDocumentsPage({}, { page: 1, pageSize: "all" });
    const past = await service.listDocumentsPage({}, { page: 99, pageSize: 10 });
    const bad = await service.listDocumentsPage({}, { page: -4, pageSize: 10 });

    expect(all.items).toHaveLength(25);
    expect(all.pageCount).toBe(1);
    expect(past.page).toBe(3);
    expect(bad.page).toBe(1);
  });

  it("pages the filtered list, and copes with no results", async () => {
    const { service } = await many(25);

    const odd = await service.listDocumentsPage({ search: ".pdf" }, { page: 2, pageSize: 10 });
    const none = await service.listDocumentsPage({ search: "ไม่มี" }, first);

    expect(odd).toMatchObject({ total: 13, pageCount: 2, offset: 10 });
    expect(odd.items).toHaveLength(3);
    expect(none).toMatchObject({ total: 0, page: 1, pageCount: 1, offset: 0, items: [] });
  });

  it("signs links only for the rows on the requested page", async () => {
    const { store, service } = await many(25);
    let signed = 0;
    const original = store.createSignedUrls.bind(store);
    store.createSignedUrls = async (paths: string[]) => {
      signed += paths.length;
      return original(paths);
    };

    const page = await service.listDocumentsPage({}, first);

    // One link per row of this page (thumbnail and hover preview), not per document.
    expect(signed).toBe(page.items.length);
    expect(signed).toBeLessThan(25);
  });
});
