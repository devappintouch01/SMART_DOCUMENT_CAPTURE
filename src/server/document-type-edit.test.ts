import { describe, expect, it } from "vitest";
import { toExtractedValue } from "@/domain/extracted-data";
import { SEED_DOCUMENT_TYPES } from "@/domain/seeds";
import { createDocumentService, UserFacingError } from "./document-service";
import type { FieldInput } from "./ports";
import { FakeAiReader } from "./testing/fake-ai-reader";
import { InMemoryStore } from "./testing/in-memory-store";

const raw = (value: string | null) => ({ value, flagReason: null });

// ใบกำกับภาษี-like type with a few Fields, and two Documents already read.
async function setup() {
  const store = new InMemoryStore();
  store.documentTypes = structuredClone(SEED_DOCUMENT_TYPES);
  const service = createDocumentService({ store, ai: new FakeAiReader() });
  const { documentTypeId } = await service.createDocumentType({
    name: "ใบวางบิล",
    fields: [
      { scope: "header", name: "เลขที่", kind: "text", description: "" },
      { scope: "header", name: "หมายเหตุ", kind: "text", description: "" },
      { scope: "header", name: "ยอดรวม", kind: "amount", description: "" },
      { scope: "line_item", name: "รายการ", kind: "text", description: "" },
      { scope: "line_item", name: "จำนวน", kind: "number", description: "" },
    ],
    sample: null,
  });
  const type = () => store.documentTypes.find((t) => t.id === documentTypeId)!;
  const fieldId = (name: string) => type().fields.find((f) => f.name === name)!.id;
  const input = (): FieldInput[] =>
    type().fields.map((f) => ({
      id: f.id,
      scope: f.scope,
      name: f.name,
      kind: f.kind,
      description: f.description ?? "",
    }));

  const addDoc = (no: string, note: string, total: string, items: [string, string][]) =>
    store.addDocument({
      fileName: `${no}.pdf`,
      status: "done",
      documentTypeId,
      extractedData: {
        header: {
          [fieldId("เลขที่")]: toExtractedValue("text", raw(no)),
          [fieldId("หมายเหตุ")]: toExtractedValue("text", raw(note)),
          [fieldId("ยอดรวม")]: toExtractedValue("amount", raw(total)),
        },
        lineItems: items.map(([name, qty]) => ({
          [fieldId("รายการ")]: toExtractedValue("text", raw(name)),
          [fieldId("จำนวน")]: toExtractedValue("number", raw(qty)),
        })),
      },
    });
  const first = addDoc("BN-1", "ด่วน", "100", [["งาน A", "2"], ["งาน B", "3"]]);
  const second = addDoc("BN-2", "ปกติ", "200", [["งาน C", "1"]]);
  return { store, service, type, fieldId, input, first, second, documentTypeId };
}

describe("updateDocumentType: renaming and reordering", () => {
  it("keeps every value when a Field or the type is renamed", async () => {
    const { store, service, type, fieldId, input, first, documentTypeId } = await setup();
    const totalId = fieldId("ยอดรวม");

    await service.updateDocumentType(documentTypeId, {
      name: "ใบวางบิล (ใหม่)",
      fields: input().map((f) => (f.name === "ยอดรวม" ? { ...f, name: "ยอดรวมทั้งสิ้น" } : f)),
    });

    expect(type().name).toBe("ใบวางบิล (ใหม่)");
    expect(type().fields.find((f) => f.id === totalId)?.name).toBe("ยอดรวมทั้งสิ้น");
    const stored = store.documents.find((d) => d.id === first.id)!.extractedData!;
    expect(stored.header[totalId].value).toBe("100.00");
  });

  it("reorders Fields within a group", async () => {
    const { type, service, input, documentTypeId } = await setup();
    const [a, b, c, ...rest] = input();

    await service.updateDocumentType(documentTypeId, { name: "ใบวางบิล", fields: [c, a, b, ...rest] });

    expect(type().fields.filter((f) => f.scope === "header").map((f) => f.name)).toEqual(["ยอดรวม", "เลขที่", "หมายเหตุ"]);
    expect(type().fields.map((f) => f.position)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("updateDocumentType: deleting a Field", () => {
  it("drops its values from every Document, header and Line Items alike, and nothing else", async () => {
    const { store, service, input, fieldId, documentTypeId } = await setup();
    const noteId = fieldId("หมายเหตุ");
    const qtyId = fieldId("จำนวน");

    await service.updateDocumentType(documentTypeId, {
      name: "ใบวางบิล",
      fields: input().filter((f) => f.name !== "หมายเหตุ" && f.name !== "จำนวน"),
    });

    for (const doc of store.documents) {
      const data = doc.extractedData!;
      expect(Object.keys(data.header)).not.toContain(noteId);
      expect(data.lineItems.every((row) => !(qtyId in row))).toBe(true);
      expect(data.header[fieldId("เลขที่")]).toBeDefined();
      expect(data.lineItems.every((row) => fieldId("รายการ") in row)).toBe(true);
    }
    expect(store.documents.map((d) => d.extractedData!.lineItems.length)).toEqual([2, 1]);
  });
});

describe("updateDocumentType: adding a Field", () => {
  it("shows it empty on existing Documents without touching their data", async () => {
    const { store, service, input, type, documentTypeId } = await setup();
    const before = structuredClone(store.documents.map((d) => d.extractedData));

    await service.updateDocumentType(documentTypeId, {
      name: "ใบวางบิล",
      fields: [...input(), { scope: "header", name: "ส่วนลด", kind: "amount", description: "" }],
    });

    const added = type().fields.find((f) => f.name === "ส่วนลด")!;
    expect(added.id).toBeTruthy();
    expect(store.documents.map((d) => d.extractedData)).toEqual(before);
    // The page and the exports read values by Field id, so a missing entry is just an empty cell.
    expect(store.documents[0].extractedData!.header[added.id]).toBeUndefined();
  });
});

describe("updateDocumentType: changing a Field Kind", () => {
  it("re-reads stored values as the new kind and empties the ones that no longer fit", async () => {
    const { store, service, input, fieldId, documentTypeId } = await setup();
    // "ด่วน" cannot become a number; "ปกติ" neither.
    await service.updateDocumentType(documentTypeId, {
      name: "ใบวางบิล",
      fields: input().map((f) => (f.name === "หมายเหตุ" ? { ...f, kind: "number" as const } : f)),
    });

    expect(store.documents[0].extractedData!.header[fieldId("หมายเหตุ")].value).toBeNull();
    expect(store.documents[0].extractedData!.header[fieldId("หมายเหตุ")].original).toBe("ด่วน");

    // And the other way: an amount shown as text keeps its digits.
    await service.updateDocumentType(documentTypeId, {
      name: "ใบวางบิล",
      fields: input().map((f) => (f.name === "ยอดรวม" ? { ...f, kind: "text" as const } : f)),
    });
    expect(store.documents[0].extractedData!.header[fieldId("ยอดรวม")].value).toBe("100.00");
  });
});

describe("updateDocumentType: validation", () => {
  it("refuses a name another type already has, but allows keeping its own", async () => {
    const { service, input, documentTypeId } = await setup();

    await expect(
      service.updateDocumentType(documentTypeId, { name: " ใบกำกับภาษี", fields: input() }),
    ).rejects.toThrow(/อยู่แล้ว/);
    await expect(
      service.updateDocumentType(documentTypeId, { name: "ใบวางบิล", fields: input() }),
    ).resolves.toBeUndefined();
  });

  it("refuses a Field that belongs to another type or has been moved between groups, and saves nothing", async () => {
    const { store, service, input, type, documentTypeId } = await setup();
    const foreign = { ...input()[0], id: SEED_DOCUMENT_TYPES[0].fields[0].id };
    const moved = input().map((f) => (f.name === "เลขที่" ? { ...f, scope: "line_item" as const } : f));

    await expect(service.updateDocumentType(documentTypeId, { name: "ใบวางบิล", fields: [foreign] })).rejects.toBeInstanceOf(UserFacingError);
    await expect(service.updateDocumentType(documentTypeId, { name: "ใบวางบิล", fields: moved })).rejects.toThrow(/ข้ามกลุ่ม/);
    expect(type().fields).toHaveLength(5);
    expect(store.documents[0].extractedData).not.toBeNull();
  });

  it("applies the same Field rules as creation", async () => {
    const { service, input, documentTypeId } = await setup();
    const duplicated = [...input(), { scope: "header" as const, name: "เลขที่", kind: "text" as const, description: "" }];

    await expect(service.updateDocumentType(documentTypeId, { name: "ใบวางบิล", fields: duplicated })).rejects.toThrow(/ซ้ำกัน/);
    await expect(service.updateDocumentType(documentTypeId, { name: "ใบวางบิล", fields: [] })).rejects.toThrow(/อย่างน้อย 1 ช่อง/);
  });

  it("leaves Documents that are not done alone", async () => {
    const { store, service, input, documentTypeId } = await setup();
    const queued = store.addDocument({ status: "queued", documentTypeId });

    await service.updateDocumentType(documentTypeId, { name: "ใบวางบิล", fields: input().slice(0, 3) });

    expect(store.documents.find((d) => d.id === queued.id)?.status).toBe("queued");
  });
});

describe("deleteDocumentType", () => {
  it("refuses while any Document uses the type, saying how many", async () => {
    const { store, service, documentTypeId } = await setup();

    await expect(service.deleteDocumentType(documentTypeId)).rejects.toThrow(/ยังมีเอกสาร 2 ใบ/);

    expect(store.documentTypes.some((t) => t.id === documentTypeId)).toBe(true);
  });

  it("deletes a type once its Documents are gone, and refuses an unknown one", async () => {
    const { store, service, documentTypeId } = await setup();
    await service.deleteDocuments(store.documents.map((d) => d.id));

    await service.deleteDocumentType(documentTypeId);

    expect(store.documentTypes.some((t) => t.id === documentTypeId)).toBe(false);
    await expect(service.deleteDocumentType(documentTypeId)).rejects.toBeInstanceOf(UserFacingError);
  });

  it("lets an unused seeded type go too", async () => {
    const { store, service } = await setup();
    await service.deleteDocumentType(SEED_DOCUMENT_TYPES[2].id);
    expect(store.documentTypes.some((t) => t.id === SEED_DOCUMENT_TYPES[2].id)).toBe(false);
  });
});
