import type { FieldKind } from "./types";

// What an Extraction produced for one Field, stored on the Document as JSON
// keyed by Field id (spec: Schema).
export type ReviewFlag = { reason: string; status: "open" | "confirmed" };

export type ExtractedValue = {
  // Normalised per Field Kind: ISO date, two-decimal Amount, plain Number.
  value: string | null;
  // Exactly what the AI returned, kept so a Correction never loses it.
  original: string | null;
  corrected: boolean;
  flag: ReviewFlag | null;
};

export type ExtractedRow = Record<string, ExtractedValue>;

export type ExtractedData = {
  header: ExtractedRow;
  lineItems: ExtractedRow[];
};

// One value as the AI reader hands it over, before normalisation.
export type RawValue = { value: string | null; flagReason: string | null };

const NUMERIC = /^-?\d+(\.\d+)?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function cleanNumber(raw: string): string | null {
  const cleaned = raw.replace(/[\s,฿]|บาท/g, "");
  return NUMERIC.test(cleaned) ? cleaned : null;
}

function cleanDate(raw: string): string | null {
  const match = ISO_DATE.exec(raw.trim());
  if (!match) return null;
  let year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Safety net: a Buddhist Era year that slipped through unconverted.
  if (year >= 2400) year -= 543;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${match[2]}-${match[3]}`;
}

// Returns the normalised value, or a Thai problem when the raw text cannot be
// read as the Field Kind.
export function normalizeValue(
  kind: FieldKind,
  raw: string | null,
): { value: string | null; problem: string | null } {
  const text = raw?.trim() ?? "";
  if (text === "") return { value: null, problem: null };

  switch (kind) {
    case "text":
      return { value: text, problem: null };
    case "long_text":
      // Line breaks are the point of this kind; only normalise their style.
      return { value: text.replace(/\r\n?/g, "\n"), problem: null };
    case "number": {
      const n = cleanNumber(text);
      return n === null
        ? { value: null, problem: "อ่านเป็นตัวเลขไม่ได้" }
        : { value: String(Number(n)), problem: null };
    }
    case "amount": {
      const n = cleanNumber(text);
      return n === null
        ? { value: null, problem: "อ่านเป็นจำนวนเงินไม่ได้" }
        : { value: Number(n).toFixed(2), problem: null };
    }
    case "date": {
      const d = cleanDate(text);
      return d === null
        ? { value: null, problem: "อ่านเป็นวันที่ไม่ได้" }
        : { value: d, problem: null };
    }
  }
}

export function toExtractedValue(kind: FieldKind, raw: RawValue): ExtractedValue {
  const { value, problem } = normalizeValue(kind, raw.value);
  const reason = [raw.flagReason?.trim(), problem].filter(Boolean).join(" · ");
  return {
    value,
    original: raw.value,
    corrected: false,
    flag: reason ? { reason, status: "open" } : null,
  };
}

export function countOpenFlags(data: ExtractedData | null): number {
  if (!data) return 0;
  const rows = [data.header, ...data.lineItems];
  return rows.reduce(
    (total, row) =>
      total + Object.values(row).filter((v) => v.flag?.status === "open").length,
    0,
  );
}
