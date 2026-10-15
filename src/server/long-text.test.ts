import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { normalizeValue, toExtractedValue } from "@/domain/extracted-data";
import { FIELD_KINDS, validateDocumentTypeDraft } from "@/domain/document-type-rules";
import { formatValue } from "@/domain/format";
import { SEED_DOCUMENT_TYPES } from "@/domain/seeds";
import { headerTsv } from "@/domain/tabular";
import { createDocumentService } from "./document-service";
import { HEADER_SHEET, LINE_ITEMS_SHEET, toCell } from "./excel";
import { FakeAiReader } from "./testing/fake-ai-reader";
import { InMemoryStore } from "./testing/in-memory-store";

const note = "งวดที่1 25% (ส่งมอบงานงวดที่1)\nงวดที่2 25% (ส่งมอบงานงวดที่2)\r\nงวดที่3 25%";

describe("long_text Field Kind", () => {
  it("is offered when setting up a Document Type", () => {
    expect(FIELD_KINDS.map((k) => k.kind)).toContain("long_text");
    expect(
      validateDocumentTypeDraft("ใบวางบิล", [{ scope: "header", name: "หมายเหตุ", kind: "long_text", description: "" }], []),
    ).toEqual([]);
  });

  it("keeps line breaks (normalising Windows ones) and trims the ends; plain text is unaffected", () => {
    expect(normalizeValue("long_text", `  ${note}\n `).value).toBe(
      "งวดที่1 25% (ส่งมอบงานงวดที่1)\nงวดที่2 25% (ส่งมอบงานงวดที่2)\nงวดที่3 25%",
    );
    expect(normalizeValue("long_text", " \n ").value).toBeNull();
    expect(formatValue("long_text", "บรรทัด 1\nบรรทัด 2")).toBe("บรรทัด 1\nบรรทัด 2");
  });

  it("is a different thing from text in Excel: wrapped, so every line shows in the cell", () => {
    expect(toCell("long_text", "a\nb")).toEqual({ value: "a\nb", wrap: true });
    expect(toCell("text", "a")).toEqual({ value: "a" });
  });

  it("is seeded for the remarks of a goods requisition, and is the only long_text seed", () => {
    const requisition = SEED_DOCUMENT_TYPES.find((t) => t.name === "ใบเบิกสินค้า")!;
    expect(requisition.fields.find((f) => f.name === "หมายเหตุ")?.kind).toBe("long_text");
    const longTexts = SEED_DOCUMENT_TYPES.flatMap((t) => t.fields).filter((f) => f.kind === "long_text");
    expect(longTexts).toHaveLength(1);
  });
});

async function withLongTextDocument() {
  const store = new InMemoryStore();
  store.documentTypes = structuredClone(SEED_DOCUMENT_TYPES);
  const service = createDocumentService({ store, ai: new FakeAiReader() });
  const { documentTypeId } = await service.createDocumentType({
    name: "ใบวางบิล",
    fields: [
      { scope: "header", name: "เลขที่", kind: "text", description: "" },
      { scope: "header", name: "หมายเหตุ", kind: "text", description: "" },
      { scope: "line_item", name: "คำอธิบาย", kind: "long_text", description: "" },
    ],
    sample: null,
  });
  const type = store.documentTypes.find((t) => t.id === documentTypeId)!;
  const id = (name: string) => type.fields.find((f) => f.name === name)!.id;
  store.addDocument({
    fileName: "bill.pdf",
    status: "done",
    documentTypeId,
    extractedData: {
      header: {
        [id("เลขที่")]: toExtractedValue("text", { value: "IV-1", flagReason: null }),
        [id("หมายเหตุ")]: toExtractedValue("text", { value: "งวดที่1 25%\nงวดที่2 25%", flagReason: null }),
      },
      lineItems: [{ [id("คำอธิบาย")]: toExtractedValue("long_text", { value: note, flagReason: null }) }],
    },
  });
  return { store, service, type, id, documentTypeId };
}

describe("long_text in a Document Type that already has Documents", () => {
  it("lets the user switch a text Field to long text without losing its value", async () => {
    const { store, service, type, id, documentTypeId } = await withLongTextDocument();

    await service.updateDocumentType(documentTypeId, {
      name: "ใบวางบิล",
      fields: type.fields.map((f) => ({
        id: f.id,
        scope: f.scope,
        name: f.name,
        kind: f.name === "หมายเหตุ" ? ("long_text" as const) : f.kind,
        description: f.description ?? "",
      })),
    });

    expect(type.fields.find((f) => f.name === "หมายเหตุ")?.kind).toBe("long_text");
    expect(store.documents[0].extractedData!.header[id("หมายเหตุ")].value).toBe("งวดที่1 25%\nงวดที่2 25%");
  });

  it("copies a table with long text flattened to one line per cell, so pasted rows stay aligned", async () => {
    const { store, type } = await withLongTextDocument();

    const [names, values] = headerTsv(type.fields, store.documents[0].extractedData!).split("\n");

    expect(names.split("\t")).toEqual(["เลขที่", "หมายเหตุ"]);
    expect(values.split("\t")).toEqual(["IV-1", "งวดที่1 25% งวดที่2 25%"]);
  });

  it("exports long text as a wrapped cell with its line breaks, one Document and many", async () => {
    const { store, service } = await withLongTextDocument();
    const docId = store.documents[0].id;
    const read = async (bytes: Uint8Array) => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
      return workbook;
    };

    const single = await read((await service.exportDocument(docId)).bytes);
    const lines = single.getWorksheet(LINE_ITEMS_SHEET)!;
    expect(lines.getRow(2).getCell(1).value).toContain("\n");
    expect(lines.getRow(2).getCell(1).alignment?.wrapText).toBe(true);

    const multi = await read((await service.exportDocuments([docId])).bytes);
    const multiLines = multi.getWorksheet(LINE_ITEMS_SHEET)!;
    expect(multiLines.getRow(2).getCell(3).alignment?.wrapText).toBe(true);
    // Plain text cells are not wrapped.
    expect(multi.getWorksheet(HEADER_SHEET)!.getRow(2).getCell(3).alignment?.wrapText).toBeUndefined();
  });
});
