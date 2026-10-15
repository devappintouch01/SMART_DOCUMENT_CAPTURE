import { describe, expect, it } from "vitest";
import { SEED_DOCUMENT_TYPES } from "@/domain/seeds";
import { createDocumentService, UserFacingError } from "./document-service";
import { AiReaderError, type DocumentTypeProposal, type FieldInput } from "./ports";
import { FakeAiReader } from "./testing/fake-ai-reader";
import { InMemoryStore } from "./testing/in-memory-store";

const billingNote: DocumentTypeProposal = {
  name: "ใบวางบิล",
  fields: [
    { scope: "header", name: "เลขที่ใบวางบิล", kind: "text", description: "เลขที่เอกสาร" },
    { scope: "header", name: "วันที่", kind: "date", description: "วันที่ออกเอกสาร" },
    { scope: "header", name: "ยอดรวมทั้งสิ้น", kind: "amount", description: "ยอดสุทธิ" },
    { scope: "line_item", name: "เลขที่ใบกำกับภาษี", kind: "text", description: "" },
    { scope: "line_item", name: "จำนวนเงิน", kind: "amount", description: "" },
  ],
};

function setup() {
  const store = new InMemoryStore();
  store.documentTypes = structuredClone(SEED_DOCUMENT_TYPES);
  const ai = new FakeAiReader();
  const service = createDocumentService({ store, ai });
  store.files.set("sample.pdf", new Uint8Array([7, 7, 7]));
  const sample = { storagePath: "sample.pdf", fileName: "IV-20261000001.pdf", mimeType: "application/pdf", pageCount: 1 };
  return { store, ai, service, sample };
}

describe("proposeDocumentType", () => {
  it("reads the uploaded Sample Document and returns the AI's draft without saving anything", async () => {
    const { store, ai, service } = setup();
    ai.willPropose(billingNote);

    const proposal = await service.proposeDocumentType({ storagePath: "sample.pdf", mimeType: "application/pdf" });

    expect(ai.proposeCalls[0]).toEqual({ bytes: new Uint8Array([7, 7, 7]), mimeType: "application/pdf" });
    expect(proposal.name).toBe("ใบวางบิล");
    expect(proposal.fields).toHaveLength(5);
    expect(store.documentTypes).toHaveLength(3);
  });

  it("tidies the draft: trims, drops blanks and duplicates, falls back to text for an unknown kind", async () => {
    const { ai, service } = setup();
    ai.willPropose({
      name: "  ใบสั่งซื้อ  ",
      fields: [
        { scope: "header", name: " เลขที่ ", kind: "text", description: " เลขที่ใบสั่งซื้อ " },
        { scope: "header", name: "เลขที่", kind: "text", description: "ซ้ำ" },
        { scope: "header", name: "   ", kind: "text", description: "" },
        { scope: "line_item", name: "เลขที่", kind: "weird" as never, description: "" },
      ],
    });

    const proposal = await service.proposeDocumentType({ storagePath: "sample.pdf", mimeType: "application/pdf" });

    expect(proposal.name).toBe("ใบสั่งซื้อ");
    expect(proposal.fields).toEqual([
      { scope: "header", name: "เลขที่", kind: "text", description: "เลขที่ใบสั่งซื้อ" },
      { scope: "line_item", name: "เลขที่", kind: "text", description: "" },
    ]);
  });

  it("turns AI failures into a Thai message and refuses unsupported files", async () => {
    const { ai, service } = setup();
    ai.willPropose(new AiReaderError(true, "บริการ AI ไม่ว่างชั่วคราว"));

    await expect(
      service.proposeDocumentType({ storagePath: "sample.pdf", mimeType: "application/pdf" }),
    ).rejects.toThrow("บริการ AI ไม่ว่างชั่วคราว");
    await expect(
      service.proposeDocumentType({ storagePath: "sample.pdf", mimeType: "text/plain" }),
    ).rejects.toBeInstanceOf(UserFacingError);
  });
});

describe("createDocumentType", () => {
  it("saves the type with its Fields in order, and the Sample Document becomes its first Document", async () => {
    const { store, service, sample } = setup();

    const { documentTypeId, documentId } = await service.createDocumentType({
      name: " ใบวางบิล ",
      fields: billingNote.fields,
      sample,
    });

    const created = store.documentTypes.find((t) => t.id === documentTypeId)!;
    expect(created).toMatchObject({ name: "ใบวางบิล", isSeed: false });
    expect(created.fields.map((f) => [f.scope, f.name, f.position])).toEqual([
      ["header", "เลขที่ใบวางบิล", 0],
      ["header", "วันที่", 1],
      ["header", "ยอดรวมทั้งสิ้น", 2],
      ["line_item", "เลขที่ใบกำกับภาษี", 3],
      ["line_item", "จำนวนเงิน", 4],
    ]);
    const [first] = await service.listDocuments();
    expect(first).toMatchObject({
      id: documentId,
      fileName: "IV-20261000001.pdf",
      status: "queued",
      documentTypeId,
    });
  });

  it("reads the Sample Document with the new type's Fields as soon as the queue runs", async () => {
    const { ai, service, sample } = setup();
    const { documentTypeId } = await service.createDocumentType({ name: "ใบวางบิล", fields: billingNote.fields, sample });
    ai.willExtract({ kind: "extracted", header: {}, lineItems: [] });

    await service.processQueue();

    expect(ai.classifyCalls).toHaveLength(0);
    expect(ai.extractCalls[0].documentType.id).toBe(documentTypeId);
    expect(ai.extractCalls[0].documentType.fields.map((f) => f.name)).toContain("เลขที่ใบวางบิล");
  });

  it("creates a type without a Sample Document too", async () => {
    const { store, service } = setup();

    const result = await service.createDocumentType({ name: "ใบสั่งซื้อ", fields: billingNote.fields, sample: null });

    expect(result.documentId).toBeNull();
    expect(store.documents).toHaveLength(0);
  });

  it("lists types with how many Documents use each", async () => {
    const { service, sample } = setup();
    const { documentTypeId } = await service.createDocumentType({ name: "ใบวางบิล", fields: billingNote.fields, sample });

    const types = await service.listDocumentTypesWithCounts();

    expect(types.map((t) => [t.name, t.documentCount])).toEqual([
      ["ใบเสร็จรับเงิน", 0],
      ["ใบกำกับภาษี", 0],
      ["ใบเบิกสินค้า", 0],
      ["ใบวางบิล", 1],
    ]);
    expect(types.find((t) => t.id === documentTypeId)?.isSeed).toBe(false);
  });

  const bad = (overrides: Partial<{ name: string; fields: FieldInput[] }>) => ({
    name: "ใบวางบิล",
    fields: billingNote.fields,
    sample: null,
    ...overrides,
  });

  it.each([
    ["an empty name", bad({ name: "  " }), /ใส่ชื่อ/],
    ["a name that is already taken, ignoring case and spaces", bad({ name: " ใบกำกับภาษี " }), /อยู่แล้ว/],
    ["no fields", bad({ fields: [] }), /อย่างน้อย 1 ช่อง/],
    ["a blank field name", bad({ fields: [{ scope: "header", name: " ", kind: "text", description: "" }] }), /ยังไม่ได้ตั้งชื่อ/],
    [
      "the same field twice in one group",
      bad({ fields: [billingNote.fields[0], billingNote.fields[0]] }),
      /ซ้ำกัน/,
    ],
    ["an unsupported kind", bad({ fields: [{ ...billingNote.fields[0], kind: "money" as never }] }), /ชนิดข้อมูล/],
  ])("rejects %s and saves nothing", async (_label, input, message) => {
    const { store, service } = setup();

    await expect(service.createDocumentType(input)).rejects.toThrow(message);

    expect(store.documentTypes).toHaveLength(3);
  });

  it("allows the same field name in the header and in the Line Items", async () => {
    const { service } = setup();
    const fields: FieldInput[] = [
      { scope: "header", name: "รายการ", kind: "text", description: "" },
      { scope: "line_item", name: "รายการ", kind: "text", description: "" },
    ];

    await expect(service.createDocumentType({ name: "ทดสอบ", fields, sample: null })).resolves.toBeDefined();
  });
});
