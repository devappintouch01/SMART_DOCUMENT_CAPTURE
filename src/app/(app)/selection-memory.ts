// What is remembered about a ticked Document, so the selection survives paging
// (the row itself is no longer on screen then).
export type Picked = { documentTypeId: string | null; documentTypeName: string | null; status: string };

// Lives at module level: a page change re-creates the result list, but a
// client-side navigation keeps this module, so ticks carry over between pages.
let picked: Record<string, Picked> = {};

export function recallPicked(): Record<string, Picked> {
  return picked;
}

export function rememberPicked(next: Record<string, Picked>): void {
  picked = next;
}
