import {
  normalizeValue,
  type ExtractedData,
  type ExtractedRow,
  type ExtractedValue,
} from "./extracted-data";
import type { Field } from "./types";

// What the result detail page sends when the user saves: every value as text.
// Dates arrive as ISO; Amounts and Numbers may still carry separators.
export type CorrectionInput = {
  header: Record<string, string>;
  // sourceIndex points at the row in the stored data this row came from;
  // null marks a row the user added.
  lineItems: { sourceIndex: number | null; values: Record<string, string> }[];
};

export type CorrectionResult =
  | { ok: true; data: ExtractedData }
  | { ok: false; problems: string[] };

const isBlank = (value: string | null | undefined) => (value ?? "").trim() === "";

// A changed value becomes a Correction and settles its Review Flag. An
// unchanged value (flag included) is left exactly as the AI produced it.
function applyValue(
  field: Field,
  existing: ExtractedValue | undefined,
  typed: string | undefined,
  problems: string[],
): ExtractedValue {
  const before: ExtractedValue = existing ?? { value: null, original: null, corrected: false, flag: null };
  const text = typed ?? before.value ?? "";
  const { value, problem } = normalizeValue(field.kind, text);
  if (problem) {
    problems.push(`${field.name}: ${problem}`);
    return before;
  }
  if (value === before.value || (value === null && isBlank(before.value))) return before;
  return {
    value,
    original: before.original,
    corrected: true,
    flag: before.flag ? { ...before.flag, status: "confirmed" } : null,
  };
}

export function applyCorrections(
  existing: ExtractedData,
  fields: Field[],
  input: CorrectionInput,
): CorrectionResult {
  const problems: string[] = [];
  const headerFields = fields.filter((f) => f.scope === "header");
  const lineFields = fields.filter((f) => f.scope === "line_item");

  const header: ExtractedRow = {};
  for (const field of headerFields) {
    header[field.id] = applyValue(field, existing.header[field.id], input.header[field.id], problems);
  }

  const lineItems = input.lineItems.map((row) => {
    const source = row.sourceIndex === null ? undefined : existing.lineItems[row.sourceIndex];
    const result: ExtractedRow = {};
    for (const field of lineFields) {
      const before = source?.[field.id];
      const applied = applyValue(field, before, row.values[field.id], problems);
      // A cell the user filled in on a new row is a Correction too.
      result[field.id] =
        source || applied.value === null
          ? applied
          : { value: applied.value, original: null, corrected: true, flag: null };
    }
    return result;
  });

  return problems.length > 0 ? { ok: false, problems } : { ok: true, data: { header, lineItems } };
}

export type FlagTarget = { rowIndex: number | null; fieldId: string };

// Marks the targeted Review Flags as confirmed, leaving everything else alone.
export function confirmFlags(data: ExtractedData, targets: FlagTarget[]): ExtractedData {
  const next: ExtractedData = structuredClone(data);
  for (const { rowIndex, fieldId } of targets) {
    const row = rowIndex === null ? next.header : next.lineItems[rowIndex];
    const entry = row?.[fieldId];
    if (entry?.flag) entry.flag.status = "confirmed";
  }
  return next;
}
