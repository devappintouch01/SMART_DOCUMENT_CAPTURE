// Which rows of the result list can be ticked. Everything ticked at once has to
// share one Document Type (an Excel export needs one set of columns), so after
// the first tick only rows of that type stay available, and a Document with no
// type yet can never be ticked.

type Row = { id: string; documentTypeId: string | null };

// The type the current selection is locked to, or null when nothing is ticked.
export function selectionTypeId(rows: Row[], selectedIds: Iterable<string>): string | null {
  const selected = new Set(selectedIds);
  return rows.find((r) => selected.has(r.id))?.documentTypeId ?? null;
}

export function canSelect(row: Row, lockedTypeId: string | null): boolean {
  if (row.documentTypeId === null) return false;
  return lockedTypeId === null || row.documentTypeId === lockedTypeId;
}

// What "select all" ticks: every available row of the locked type, or, when
// nothing is ticked yet, every row of the first row that can be ticked.
export function selectAllIds(rows: Row[], lockedTypeId: string | null): string[] {
  const type = lockedTypeId ?? rows.find((r) => r.documentTypeId !== null)?.documentTypeId ?? null;
  if (type === null) return [];
  return rows.filter((r) => r.documentTypeId === type).map((r) => r.id);
}
