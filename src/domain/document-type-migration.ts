import { normalizeValue, type ExtractedData, type ExtractedRow } from "./extracted-data";
import type { FieldKind } from "./types";

export type FieldChanges = {
  // Fields deleted from the Document Type.
  removedFieldIds: Set<string>;
  // Fields whose Field Kind changed, with the new kind.
  kindChanges: Map<string, FieldKind>;
};

// What an edit to a Document Type does to a Document that was already read:
// a deleted Field loses its values everywhere, a Field whose kind changed has
// its values re-read as the new kind (unreadable ones become empty), and
// everything else, including a renamed Field, is untouched because values are
// keyed by Field id. A new Field needs nothing: it simply has no value yet.
export function migrateExtractedData(
  data: ExtractedData,
  changes: FieldChanges,
): { data: ExtractedData; changed: boolean } {
  let changed = false;

  const migrateRow = (row: ExtractedRow): ExtractedRow => {
    const next: ExtractedRow = {};
    for (const [fieldId, entry] of Object.entries(row)) {
      if (changes.removedFieldIds.has(fieldId)) {
        changed = true;
        continue;
      }
      const newKind = changes.kindChanges.get(fieldId);
      if (newKind) {
        const { value } = normalizeValue(newKind, entry.value);
        if (value !== entry.value) changed = true;
        next[fieldId] = { ...entry, value };
      } else {
        next[fieldId] = entry;
      }
    }
    return next;
  };

  const migrated: ExtractedData = {
    header: migrateRow(data.header),
    lineItems: data.lineItems.map(migrateRow),
  };
  return { data: migrated, changed };
}
