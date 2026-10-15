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
      return value;
  }
}
