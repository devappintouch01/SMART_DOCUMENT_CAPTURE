import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { toExtractedValue } from "@/domain/extracted-data";
import { SEED_DOCUMENT_TYPES } from "@/domain/seeds";
import { copyValue, headerTsv, lineItemsTsv } from "@/domain/tabular";
import { createDocumentService, UserFacingError } from "./document-service";
import { HEADER_SHEET, LINE_ITEMS_SHEET } from "./excel";
import { FakeAiReader } from "./testing/fake-ai-reader";
import { InMemoryStore } from "./testing/in-memory-store";

const taxInvoice = SEED_DOCUMENT_TYPES[1];
const id = (name: string) => taxInvoice.fields.find((f) => f.name === name)!.id;
const raw = (value: string | null) => ({ value, flagReason: null });

function setup() {
  const store = new InMemoryStore();
  store.documentTypes = SEED_DOCUMENT_TYPES;
  const service = createDocumentService({ store, ai: new FakeAiReader() });
  const doc = store.addDocument({
    fileName: "ใบกำกับภาษี_001.pdf",
    status: "done",
    documentTypeId: taxInvoice.id,
    extractedData: {
      header: {
        [id("เลขที่ใบกำกับภาษี")]: toExtractedValue("text", raw("IV-001")),
        [id("วันที่")]: toExtractedValue("date", raw("2026-10-15")),
        [id("ยอดรวมทั้งสิ้น")]: toExtractedValue("amount", raw("1,250")),
        [id("ชื่อผู้ซื้อ")]: toExtractedValue("text", raw("บริษัท\tก\nจำกัด")),
      },
      lineItems: [
        {
          [id("รายการ")]: toExtractedValue("text", raw("กระดาษ A4")),
          [id("จำนวน")]: toExtractedValue("number", raw("10")),
          [id("ราคาต่อหน่วย")]: toExtractedValue("amount", raw("125")),
        },
        {
          [id("รายการ")]: toExtractedValue("text", raw("หมึก")),
          [id("จำนวน")]: toExtractedValue("number", raw("2")),
          [id("ราคาต่อหน่วย")]: toExtractedValue("amount", raw(null)),
        },
      ],
    },
  });
  return { store, service, doc };
}

// exceljs types row.values as an array-or-object union; rows here are always arrays.
const vals = (row: ExcelJS.Row) => row.values as unknown as unknown[];

async function read(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  return workbook;
}

describe("exportDocument", () => {
  it("builds ข้อมูลหลัก and รายการ sheets named after the Document", async () => {
    const { service, doc } = setup();

    const { fileName, bytes } = await service.exportDocument(doc.id);
    const workbook = await read(bytes);

    expect(fileName).toBe("ใบกำกับภาษี_001.xlsx");
    expect(workbook.worksheets.map((s) => s.name)).toEqual([HEADER_SHEET, LINE_ITEMS_SHEET]);
  });

  it("lists Header Fields as name/value rows in Field order, with typed cells", async () => {
    const { service, doc } = setup();
    const sheet = (await read((await service.exportDocument(doc.id)).bytes)).getWorksheet(HEADER_SHEET)!;

    const names = sheet.getColumn(1).values.slice(2);
    expect(names.slice(0, 3)).toEqual(["เลขที่ใบกำกับภาษี", "วันที่", "ชื่อผู้ขาย"]);

    const rowOf = (name: string) => sheet.getRow(names.indexOf(name) + 2);
    const date = rowOf("วันที่").getCell(2);
    expect(date.value).toBeInstanceOf(Date);
    expect((date.value as Date).toISOString().slice(0, 10)).toBe("2026-10-15");
    expect(date.numFmt).toBe("mm-dd-yy");

    const total = rowOf("ยอดรวมทั้งสิ้น").getCell(2);
    expect(total.value).toBe(1250);
    expect(total.numFmt).toBe("#,##0.00");
    expect(rowOf("เลขที่ใบกำกับภาษี").getCell(2).value).toBe("IV-001");
    expect(rowOf("สาขาผู้ขาย").getCell(2).value).toBeNull();
  });

  it("puts one Line Item per row under the Line Item Fields in Field order", async () => {
    const { service, doc } = setup();
    const sheet = (await read((await service.exportDocument(doc.id)).bytes)).getWorksheet(LINE_ITEMS_SHEET)!;

    expect(sheet.getRow(1).values).toEqual([
      undefined,
      "รหัสสินค้า", "รายการ", "จำนวน", "หน่วย", "ราคาต่อหน่วย", "ส่วนลด", "จำนวนเงิน",
    ]);
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getRow(2).getCell(2).value).toBe("กระดาษ A4");
    expect(sheet.getRow(2).getCell(3).value).toBe(10);
    expect(sheet.getRow(2).getCell(5).value).toBe(125);
    expect(sheet.getRow(2).getCell(5).numFmt).toBe("#,##0.00");
    expect(sheet.getRow(3).getCell(5).value).toBeNull();
  });

  it("uses Corrections, not the AI's original values", async () => {
    const { service, doc } = setup();
    const header = { [id("เลขที่ใบกำกับภาษี")]: "IV-001", [id("วันที่")]: "2026-10-15", [id("ยอดรวมทั้งสิ้น")]: "1,520.00", [id("ชื่อผู้ซื้อ")]: "บริษัท ก จำกัด" };
    await service.saveCorrections(doc.id, {
      header,
      lineItems: [
        { sourceIndex: 0, values: { [id("รายการ")]: "กระดาษ A4", [id("จำนวน")]: "12", [id("ราคาต่อหน่วย")]: "125" } },
      ],
    });

    const workbook = await read((await service.exportDocument(doc.id)).bytes);
    const headerSheet = workbook.getWorksheet(HEADER_SHEET)!;
    const names = headerSheet.getColumn(1).values.slice(2);
    expect(headerSheet.getRow(names.indexOf("ยอดรวมทั้งสิ้น") + 2).getCell(2).value).toBe(1520);
    const lines = workbook.getWorksheet(LINE_ITEMS_SHEET)!;
    expect(lines.rowCount).toBe(2);
    expect(lines.getRow(2).getCell(3).value).toBe(12);
  });

  it("only exports Documents that are done", async () => {
    const { store, service, doc } = setup();
    store.documents[0].status = "failed";

    await expect(service.exportDocument(doc.id)).rejects.toBeInstanceOf(UserFacingError);
  });
});

describe("copy as text", () => {
  const { store } = setup();
  const data = store.documents[0].extractedData!;

  it("copies a header as Field names over one row of values, dates as ISO, amounts plain, tabs and newlines flattened", () => {
    const [names, values] = headerTsv(taxInvoice.fields, data).split("\n");
    const cols = names.split("\t");
    const row = values.split("\t");
    expect(cols).toHaveLength(11);
    expect(row[cols.indexOf("เลขที่ใบกำกับภาษี")]).toBe("IV-001");
    expect(row[cols.indexOf("วันที่")]).toBe("2026-10-15");
    expect(row[cols.indexOf("ยอดรวมทั้งสิ้น")]).toBe("1250.00");
    expect(row[cols.indexOf("ชื่อผู้ซื้อ")]).toBe("บริษัท ก จำกัด");
    expect(row[cols.indexOf("สาขาผู้ขาย")]).toBe("");
  });

  it("copies Line Items as a header row plus one row per Line Item", () => {
    const rows = lineItemsTsv(taxInvoice.fields, data).split("\n").map((r) => r.split("\t"));
    expect(rows).toHaveLength(3);
    expect(rows[0][1]).toBe("รายการ");
    expect(rows[1].slice(1, 3)).toEqual(["กระดาษ A4", "10"]);
    expect(rows[2][4]).toBe("");
  });

  it("copies a single date the way it is shown (Buddhist Era)", () => {
    expect(copyValue("date", "2026-10-15")).toBe("15/10/2569");
    expect(copyValue("amount", "1250.00")).toBe("1250.00");
    expect(copyValue("text", null)).toBe("");
  });
});

describe("exportDocuments", () => {
  function setupMany() {
    const store = new InMemoryStore();
    store.documentTypes = SEED_DOCUMENT_TYPES;
    const service = createDocumentService({ store, ai: new FakeAiReader() });
    const invoice = (fileName: string, minute: number, no: string, total: string, items: [string, string][]) =>
      store.addDocument({
        fileName,
        status: "done",
        documentTypeId: taxInvoice.id,
        uploadedAt: new Date(Date.UTC(2026, 9, 15, 9, minute)),
        extractedData: {
          header: {
            [id("เลขที่ใบกำกับภาษี")]: toExtractedValue("text", raw(no)),
            [id("วันที่")]: toExtractedValue("date", raw("2026-10-15")),
            [id("ยอดรวมทั้งสิ้น")]: toExtractedValue("amount", raw(total)),
          },
          lineItems: items.map(([name, qty]) => ({
            [id("รายการ")]: toExtractedValue("text", raw(name)),
            [id("จำนวน")]: toExtractedValue("number", raw(qty)),
          })),
        },
      });
    const b = invoice("b.pdf", 2, "IV-002", "200", [["หมึก", "2"]]);
    const a = invoice("a.pdf", 1, "IV-001", "100", [["กระดาษ", "10"], ["แฟ้ม", "5"]]);
    const c = invoice("c.pdf", 3, "IV-003", "300", []);
    return { store, service, a, b, c };
  }

  it("puts one row per Document on ข้อมูลหลัก, oldest upload first, numbered from 1", async () => {
    const { service, a, b, c } = setupMany();

    const { fileName, bytes } = await service.exportDocuments([c.id, a.id, b.id]);
    const sheet = (await read(bytes)).getWorksheet(HEADER_SHEET)!;

    expect(fileName).toBe("ใบกำกับภาษี_3ใบ.xlsx");
    expect(vals(sheet.getRow(1)).slice(1, 6)).toEqual([
      "ลำดับ", "ชื่อไฟล์", "เลขที่ใบกำกับภาษี", "วันที่", "ชื่อผู้ขาย",
    ]);
    const body = [2, 3, 4].map((r) => [sheet.getRow(r).getCell(1).value, sheet.getRow(r).getCell(2).value, sheet.getRow(r).getCell(3).value]);
    expect(body).toEqual([[1, "a.pdf", "IV-001"], [2, "b.pdf", "IV-002"], [3, "c.pdf", "IV-003"]]);
    expect(sheet.getRow(2).getCell(4).value).toBeInstanceOf(Date);
    const totalCol = vals(sheet.getRow(1)).indexOf("ยอดรวมทั้งสิ้น");
    expect(sheet.getRow(3).getCell(totalCol).value).toBe(200);
    expect(sheet.getRow(3).getCell(totalCol).numFmt).toBe("#,##0.00");
  });

  it("collects every Line Item on รายการ, each tied to its Document by ลำดับ and ชื่อไฟล์", async () => {
    const { service, a, b, c } = setupMany();

    const sheet = (await read((await service.exportDocuments([a.id, b.id, c.id])).bytes)).getWorksheet(LINE_ITEMS_SHEET)!;

    expect(vals(sheet.getRow(1)).slice(1, 5)).toEqual(["ลำดับ", "ชื่อไฟล์", "รหัสสินค้า", "รายการ"]);
    const rows = [2, 3, 4].map((r) => [1, 2, 4, 5].map((c) => sheet.getRow(r).getCell(c).value));
    expect(rows).toEqual([
      [1, "a.pdf", "กระดาษ", 10],
      [1, "a.pdf", "แฟ้ม", 5],
      [2, "b.pdf", "หมึก", 2],
    ]);
    // c.pdf has no Line Items, so it adds no rows.
    expect(sheet.rowCount).toBe(4);
  });

  it("uses Corrections", async () => {
    const { service, a, b } = setupMany();
    await service.saveCorrections(a.id, {
      header: { [id("เลขที่ใบกำกับภาษี")]: "IV-001", [id("วันที่")]: "2026-10-15", [id("ยอดรวมทั้งสิ้น")]: "150" },
      lineItems: [
        { sourceIndex: 0, values: { [id("รายการ")]: "กระดาษ", [id("จำนวน")]: "10" } },
        { sourceIndex: 1, values: { [id("รายการ")]: "แฟ้ม", [id("จำนวน")]: "5" } },
      ],
    });

    const sheet = (await read((await service.exportDocuments([a.id, b.id])).bytes)).getWorksheet(HEADER_SHEET)!;
    const totalCol = vals(sheet.getRow(1)).indexOf("ยอดรวมทั้งสิ้น");
    expect(sheet.getRow(2).getCell(totalCol).value).toBe(150);
  });

  it("refuses a selection that mixes Document Types", async () => {
    const { store, service, a, b } = setupMany();
    store.documents.find((d) => d.id === b.id)!.documentTypeId = SEED_DOCUMENT_TYPES[0].id;

    await expect(service.exportDocuments([a.id, b.id])).rejects.toThrow(/ประเภทเดียวกัน/);
  });

  it("refuses Documents that are not done, and empty or unknown selections", async () => {
    const { store, service, a, b } = setupMany();
    store.documents.find((d) => d.id === b.id)!.status = "queued";

    await expect(service.exportDocuments([a.id, b.id])).rejects.toThrow(/ยังไม่เสร็จ 1 ใบ/);
    await expect(service.exportDocuments([])).rejects.toBeInstanceOf(UserFacingError);
    await expect(service.exportDocuments([a.id, "00000000-0000-0000-0000-000000000000"])).rejects.toBeInstanceOf(UserFacingError);
  });

  it("counts a Document once even if it is listed twice", async () => {
    const { service, a } = setupMany();
    expect((await service.exportDocuments([a.id, a.id])).fileName).toBe("ใบกำกับภาษี_1ใบ.xlsx");
  });
});
