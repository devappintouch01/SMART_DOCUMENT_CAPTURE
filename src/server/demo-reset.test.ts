import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_RESET_PHRASE, type DemoFixture } from "@/domain/demo";
import { SEED_DOCUMENT_TYPES } from "@/domain/seeds";
import { createDocumentService, UserFacingError } from "./document-service";
import { FakeAiReader } from "./testing/fake-ai-reader";
import { InMemoryStore } from "./testing/in-memory-store";

const manifest = JSON.parse(
  readFileSync(new URL("../../fixtures/demo/manifest.json", import.meta.url), "utf8"),
) as (Omit<DemoFixture, "bytes" | "fileName"> & { file: string })[];

const realFixtures: DemoFixture[] = manifest.map(({ file, ...rest }) => ({
  ...rest,
  fileName: file,
  bytes: new Uint8Array(readFileSync(new URL(`../../fixtures/demo/${file}`, import.meta.url))),
}));

// A messy state: user data, an edited seed, a custom type, a stored file.
async function messy() {
  const store = new InMemoryStore();
  store.documentTypes = structuredClone(SEED_DOCUMENT_TYPES);
  const ai = new FakeAiReader();
  const service = createDocumentService({ store, ai });

  store.documentTypes[0].name = "ใบเสร็จ (ชื่อที่ผู้ใช้แก้)";
  store.documentTypes[0].fields.push({ id: "extra", scope: "header", name: "ช่องที่เพิ่มเอง", kind: "text", description: null, position: 99 });
  const { documentTypeId } = await service.createDocumentType({
    name: "ใบวางบิล",
    fields: [{ scope: "header", name: "เลขที่", kind: "text", description: "" }],
    sample: null,
  });
  store.addDocument({ fileName: "ของจริง.pdf", storagePath: "user-file.pdf", status: "done", documentTypeId });
  return { store, ai, service, documentTypeId };
}

const reset = (service: Awaited<ReturnType<typeof messy>>["service"], fixtures = realFixtures, confirmation = DEMO_RESET_PHRASE) =>
  service.resetDemoData({ confirmation, seedTypes: SEED_DOCUMENT_TYPES, fixtures });

describe("resetDemoData", () => {
  it("wipes Documents, files and custom types, and gives the seeded types their original Fields back", async () => {
    const { store, service, documentTypeId } = await messy();

    await reset(service);

    expect(store.documentTypes.map((t) => t.name)).toEqual(["ใบเสร็จรับเงิน", "ใบกำกับภาษี", "ใบเบิกสินค้า"]);
    expect(store.documentTypes.some((t) => t.id === documentTypeId)).toBe(false);
    expect(store.documentTypes[0].fields).toEqual(SEED_DOCUMENT_TYPES[0].fields);
    expect(store.documents.some((d) => d.fileName === "ของจริง.pdf")).toBe(false);
    expect(store.files.has("user-file.pdf")).toBe(false);
  });

  it("loads every fixture as a finished Document with its file stored, and never calls the AI", async () => {
    const { store, ai, service } = await messy();

    expect(await reset(service)).toEqual({ loaded: 6 });

    const docs = await service.listDocuments();
    expect(docs).toHaveLength(6);
    expect(docs.every((d) => d.status === "done")).toBe(true);
    expect(store.files.size).toBe(6);
    expect(store.documents.every((d) => store.files.has(d.storagePath))).toBe(true);
    expect(ai.extractCalls).toHaveLength(0);
    expect(ai.classifyCalls).toHaveLength(0);
  });

  it("lists the first fixture on top and uses the Document Type each fixture names", async () => {
    const { service } = await messy();

    await reset(service);
    const docs = await service.listDocuments();

    expect(docs.map((d) => d.fileName)).toEqual(realFixtures.map((f) => f.fileName));
    expect(docs.map((d) => d.documentTypeName)).toEqual(realFixtures.map((f) => f.documentType));
  });

  it("builds the stored values like an AI result: normalised, in Field order, with Review Flags where marked", async () => {
    const { service } = await messy();
    await reset(service);

    const docs = await service.listDocuments();
    const handwritten = docs.find((d) => d.fileName === "tax-invoice-02-handwritten.png")!;
    const detail = (await service.getDocument(handwritten.id))!;
    const type = detail.documentType!;
    const total = type.fields.find((f) => f.name === "ยอดรวมทั้งสิ้น")!;

    expect(detail.extractedData!.header[total.id]).toMatchObject({
      value: "10272.00",
      flag: { reason: "ลายมือไม่ชัด", status: "open" },
    });
    expect(detail.extractedData!.lineItems).toHaveLength(2);
    // Handwritten without doubt: no flag. Handwritten with doubt: flagged. Two flags in this file.
    expect(handwritten.openReviewFlagCount).toBe(2);
    expect(docs.filter((d) => d.openReviewFlagCount > 0).length).toBeGreaterThanOrEqual(2);
  });

  it("includes a handwritten Document and a combined tax invoice/receipt, as the demo needs", () => {
    expect(realFixtures.map((f) => f.fileName).filter((n) => n.includes("handwritten"))).toHaveLength(2);
    const combined = realFixtures.find((f) => f.fileName.includes("combined"))!;
    expect(combined.documentType).toBe("ใบกำกับภาษี");
  });

  it("can be exported straight away, as a presenter will do", async () => {
    const { service } = await messy();
    await reset(service);
    const invoices = (await service.listDocuments({})).filter((d) => d.documentTypeName === "ใบกำกับภาษี");

    const { fileName } = await service.exportDocuments(invoices.map((d) => d.id));

    expect(fileName).toBe(`ใบกำกับภาษี_${invoices.length}ใบ.xlsx`);
  });

  it("refuses without the typed phrase, and checks the fixtures before deleting anything", async () => {
    const { store, service } = await messy();

    await expect(reset(service, realFixtures, "")).rejects.toBeInstanceOf(UserFacingError);
    await expect(reset(service, realFixtures, "reset")).rejects.toThrow(DEMO_RESET_PHRASE);
    expect(store.documents).toHaveLength(1);

    const broken = [{ ...realFixtures[0], header: { ช่องที่ไม่มี: "x" } }];
    await expect(reset(service, broken)).rejects.toThrow(/ช่องที่ไม่มี/);
    const unknownType = [{ ...realFixtures[0], documentType: "ประเภทที่ไม่มี" }];
    await expect(reset(service, unknownType)).rejects.toThrow(/unknown Document Type/);
    expect(store.documents).toHaveLength(1);
    expect(store.documentTypes).toHaveLength(4);
  });

  it("accepts the phrase with stray spaces and can run twice with the same result", async () => {
    const { service } = await messy();

    await reset(service, realFixtures, `  ${DEMO_RESET_PHRASE} `);
    await reset(service);

    expect(await service.listDocuments()).toHaveLength(6);
  });
});
