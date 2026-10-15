import type { ExtractedData, ExtractedRow } from "./extracted-data";
import { formatDateBE } from "./format";
import type { Field, FieldKind } from "./types";

// Plain-text forms of stored values, for the clipboard.

const clean = (text: string) => text.replace(/[\t\r\n]+/g, " ").trim();

// One value pasted into another system: dates as shown on screen (Buddhist
// Era), numbers and amounts without separators so they stay numbers.
export function copyValue(kind: FieldKind, value: string | null): string {
  if (value === null) return "";
  return kind === "date" ? formatDateBE(value) : clean(value);
}

// A value inside a table pasted into Excel or Google Sheets: dates as ISO so
// every spreadsheet locale reads them as real dates.
function tableCell(value: string | null): string {
  return value === null ? "" : clean(value);
}

const line = (cells: string[]) => cells.join("\t");

// Header Fields as one record: a row of Field names over a row of values, so it
// can be appended to a sheet with one row per Document.
export function headerTsv(fields: Field[], data: ExtractedData): string {
  const header = fields.filter((f) => f.scope === "header");
  return [
    line(header.map((f) => clean(f.name))),
    line(header.map((f) => tableCell(data.header[f.id]?.value ?? null))),
  ].join("\n");
}

// Line Items: a row of Field names, then one row per Line Item.
export function lineItemsTsv(fields: Field[], data: ExtractedData): string {
  const lineFields = fields.filter((f) => f.scope === "line_item");
  return [
    line(lineFields.map((f) => clean(f.name))),
    ...data.lineItems.map((row: ExtractedRow) =>
      line(lineFields.map((f) => tableCell(row[f.id]?.value ?? null))),
    ),
  ].join("\n");
}
