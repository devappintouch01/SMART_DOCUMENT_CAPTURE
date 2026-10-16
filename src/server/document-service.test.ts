import { describe, expect, it } from "vitest";
import { SEED_DOCUMENT_TYPES } from "@/domain/seeds";
import { MAX_FILE_BYTES, type FileMeta } from "@/domain/upload-limits";
import { createDocumentService, UserFacingError } from "./document-service";
import { FakeAiReader } from "./testing/fake-ai-reader";
import { InMemoryStore } from "./testing/in-memory-store";

const [receipt, taxInvoice] = SEED_DOCUMENT_TYPES;

function setup() {
  const store = new InMemoryStore();
  store.documentTypes = SEED_DOCUMENT_TYPES;
  const service = createDocumentService({ store, ai: new FakeAiReader() });
  return { store, service };
}

function file(overrides: Partial<FileMeta> = {}): FileMeta {
  return {
    fileName: "ใบกำกับภาษี_001.pdf",
    mimeType: "application/pdf",
    sizeBytes: 200_000,
    pageCount: 1,
    ...overrides,
  };
}


describe("listDocuments", () => {
  it("returns an empty list when nothing has been uploaded", async () => {
    const { service } = setup();
    expect(await service.listDocuments()).toEqual([]);
  });

  it("lists the newest upload first", async () => {
    const { store, service } = setup();
    store.addDocument({ id: "old", uploadedAt: new Date("2026-10-14T08:00:00Z") });
    store.addDocument({ id: "new", uploadedAt: new Date("2026-10-15T08:00:00Z") });

    const ids = (await service.listDocuments()).map((d) => d.id);

    expect(ids).toEqual(["new", "old"]);
  });

  it("gives images a preview URL and PDFs none", async () => {
    const { store, service } = setup();
    store.addDocument({ id: "pdf", mimeType: "application/pdf", storagePath: "a.pdf" });
    store.addDocument({ id: "img", mimeType: "image/jpeg", storagePath: "b.jpg" });

    const byId = Object.fromEntries((await service.listDocuments()).map((d) => [d.id, d]));

    expect(byId.pdf.previewUrl).toBeNull();
    expect(byId.img.previewUrl).toBe("memory://view/b.jpg");
  });
});

describe("requestUploads", () => {
  it("hands out one ASCII storage target per file, in order", async () => {
    const { service } = setup();

    const targets = await service.requestUploads([
      file(),
      file({ fileName: "สลิป.png", mimeType: "image/png" }),
    ]);

    expect(targets).toHaveLength(2);
    expect(targets[0].storagePath).toMatch(/^[\w-]+\.pdf$/);
    expect(targets[1].storagePath).toMatch(/^[\w-]+\.png$/);
  });

  it.each([
    ["an unsupported format", file({ mimeType: "image/heic", fileName: "IMG_1.heic" })],
    ["a file over 10 MB", file({ sizeBytes: MAX_FILE_BYTES + 1 })],
    ["a PDF over 10 pages", file({ pageCount: 11 })],
    ["an empty file", file({ sizeBytes: 0 })],
  ])("rejects %s and hands out no targets", async (_label, bad) => {
    const { store, service } = setup();

    await expect(service.requestUploads([file(), bad])).rejects.toBeInstanceOf(UserFacingError);

    expect(store.uploadTargets).toEqual([]);
  });

  it("accepts exactly 10 pages and 10 MB", async () => {
    const { service } = setup();
    await expect(
      service.requestUploads([file({ pageCount: 10, sizeBytes: MAX_FILE_BYTES })]),
    ).resolves.toHaveLength(1);
  });

  it("rejects an empty batch and a batch over 20 files", async () => {
    const { service } = setup();

    await expect(service.requestUploads([])).rejects.toBeInstanceOf(UserFacingError);
    await expect(
      service.requestUploads(Array.from({ length: 21 }, () => file())),
    ).rejects.toBeInstanceOf(UserFacingError);
    await expect(
      service.requestUploads(Array.from({ length: 20 }, () => file())),
    ).resolves.toHaveLength(20);
  });
});

describe("registerUploads", () => {
  it("creates one Queued Document per file with the chosen Document Type", async () => {
    const { service } = setup();

    const { documentIds } = await service.registerUploads({
      documentTypeId: taxInvoice.id,
      files: [
        { storagePath: "a.pdf", fileName: "ใบกำกับภาษี_001.pdf", mimeType: "application/pdf", pageCount: 2 },
        { storagePath: "b.jpg", fileName: "photo.jpg", mimeType: "image/jpeg", pageCount: 1 },
      ],
    });

    expect(documentIds).toHaveLength(2);
    const listed = await service.listDocuments();
    expect(listed).toHaveLength(2);
    expect(listed.every((d) => d.status === "queued")).toBe(true);
    expect(listed.every((d) => d.documentTypeName === "ใบกำกับภาษี")).toBe(true);
    expect(listed.map((d) => d.fileName).sort()).toEqual(["photo.jpg", "ใบกำกับภาษี_001.pdf"]);
  });

  it("rejects an unknown Document Type without creating anything", async () => {
    const { service } = setup();

    await expect(
      service.registerUploads({
        documentTypeId: "00000000-0000-0000-0000-000000000000",
        files: [{ storagePath: "a.pdf", fileName: "a.pdf", mimeType: "application/pdf", pageCount: 1 }],
      }),
    ).rejects.toBeInstanceOf(UserFacingError);

    expect(await service.listDocuments()).toEqual([]);
  });
});

describe("seeded Document Types", () => {
  it("define the Fields listed in the spec", async () => {
    const { service } = setup();
    const types = await service.listDocumentTypes();

    expect(types.map((t) => t.name)).toEqual(["ใบเสร็จรับเงิน", "ใบกำกับภาษี", "ใบเบิกสินค้า"]);
    expect(receipt.fields.filter((f) => f.scope === "header")).toHaveLength(7);
    expect(receipt.fields.filter((f) => f.scope === "line_item")).toHaveLength(4);
    expect(taxInvoice.fields.filter((f) => f.scope === "header")).toHaveLength(11);
    expect(taxInvoice.fields.filter((f) => f.scope === "line_item")).toHaveLength(7);
    expect(taxInvoice.fields.find((f) => f.name === "ภาษีมูลค่าเพิ่ม")?.kind).toBe("amount");
    expect(taxInvoice.fields.find((f) => f.name === "วันที่")?.kind).toBe("date");
  });

  it("keep stable, unique Field ids", () => {
    const ids = SEED_DOCUMENT_TYPES.flatMap((t) => t.fields.map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(SEED_DOCUMENT_TYPES.every((t) => t.fields.every((f) => f.description))).toBe(true);
  });
});
