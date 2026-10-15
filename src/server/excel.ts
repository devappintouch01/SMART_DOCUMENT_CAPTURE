import ExcelJS from "exceljs";
import type { ExtractedData } from "@/domain/extracted-data";
import type { DocumentType, Field, FieldKind } from "@/domain/types";

export const HEADER_SHEET = "ข้อมูลหลัก";
export const LINE_ITEMS_SHEET = "รายการ";

type Cell = { value: ExcelJS.CellValue; numFmt?: string };

// Stored values become real Excel values: dates and money are never text.
// The date format is Excel's built-in short date (mm-dd-yy → id 14), which
// follows the machine's regional settings, so a Thai system shows Buddhist Era.
export function toCell(kind: FieldKind, value: string | null): Cell {
  if (value === null || value === "") return { value: null };
  switch (kind) {
    case "date": {
      const [year, month, day] = value.split("-").map(Number);
      return { value: new Date(Date.UTC(year, month - 1, day)), numFmt: "mm-dd-yy" };
    }
    case "amount":
      return { value: Number(value), numFmt: "#,##0.00" };
    case "number":
      return { value: Number(value), numFmt: "General" };
    case "text":
      return { value };
  }
}

// Thai text is roughly as wide as Latin text in Excel's default font.
function fitColumns(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((column) => {
    let widest = 8;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const text = cell.value instanceof Date ? "dd/mm/yyyy" : String(cell.value ?? "");
      widest = Math.max(widest, ...text.split("\n").map((l) => l.length));
    });
    column.width = Math.min(Math.max(widest + 3, 10), 50);
  });
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
}

function lineFieldsOf(documentType: DocumentType): Field[] {
  return documentType.fields.filter((f) => f.scope === "line_item");
}

// One Document: "ข้อมูลหลัก" lists Field name and value, "รายการ" has one row
// per Line Item with the Line Item Fields as columns, in Field order.
export async function buildDocumentWorkbook(
  documentType: DocumentType,
  data: ExtractedData,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();

  const header = workbook.addWorksheet(HEADER_SHEET);
  header.columns = [{ key: "field" }, { key: "value" }];
  styleHeaderRow(header.addRow(["ช่อง", "ค่า"]));
  for (const field of documentType.fields.filter((f) => f.scope === "header")) {
    const row = header.addRow([field.name]);
    const { value, numFmt } = toCell(field.kind, data.header[field.id]?.value ?? null);
    const cell = row.getCell(2);
    cell.value = value;
    if (numFmt) cell.numFmt = numFmt;
    cell.alignment = { horizontal: "left" };
  }
  fitColumns(header);

  const lineFields = lineFieldsOf(documentType);
  const lines = workbook.addWorksheet(LINE_ITEMS_SHEET);
  lines.columns = lineFields.map((f) => ({ key: f.id }));
  styleHeaderRow(lines.addRow(lineFields.map((f) => f.name)));
  for (const item of data.lineItems) {
    const row = lines.addRow([]);
    lineFields.forEach((field, index) => {
      const { value, numFmt } = toCell(field.kind, item[field.id]?.value ?? null);
      const cell = row.getCell(index + 1);
      cell.value = value;
      if (numFmt) cell.numFmt = numFmt;
    });
  }
  fitColumns(lines);

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
