import type { FieldKind } from "./types";

// Display rules (spec: Display and export rules). Stored values stay
// normalised; only what the user sees changes.

const amountFormat = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormat = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 4 });

// ISO date → DD/MM/YYYY in the Buddhist Era.
export function formatDateBE(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${Number(year) + 543}`;
}

// DD/MM/YYYY typed by the user → ISO date, or null when it is not a real date.
// The year is read as Buddhist Era (2569); a two-digit year is a Buddhist Era
// year too (69 → 2569); a four-digit year below 2400 is taken as Common Era.
export function parseThaiDate(text: string): string | null {
  const trimmed = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(trimmed);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (match[3].length === 2) year += 2500;
  if (year >= 2400) year -= 543;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// What a number or amount input shows while it is not being edited: thousands
// separators, and two decimals for money. Text that is not a plain number (a
// half-typed value) is shown as typed.
export function formatNumericInput(kind: FieldKind, text: string): string {
  if (kind !== "amount" && kind !== "number") return text;
  const plain = text.replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(plain)) return text;
  return formatValue(kind, plain);
}

export function formatValue(kind: FieldKind, value: string | null): string {
  if (value === null || value === "") return "";
  switch (kind) {
    case "date":
      return formatDateBE(value);
    case "amount":
      return amountFormat.format(Number(value));
    case "number":
      return numberFormat.format(Number(value));
    case "text":
    case "long_text":
      return value;
  }
}
