import { describe, expect, it } from "vitest";
import { canSelect, selectAllIds, selectionTypeId } from "./selection";

const rows = [
  { id: "a", documentTypeId: "bill" },
  { id: "b", documentTypeId: "receipt" },
  { id: "c", documentTypeId: null },
  { id: "d", documentTypeId: "bill" },
];

describe("row selection", () => {
  it("allows any typed row while nothing is ticked, and never a row without a type", () => {
    expect(selectionTypeId(rows, [])).toBeNull();
    expect(rows.map((r) => canSelect(r, null))).toEqual([true, true, false, true]);
  });

  it("locks to the type of what is ticked: other types stay visible but unavailable", () => {
    const locked = selectionTypeId(rows, ["a"]);

    expect(locked).toBe("bill");
    expect(rows.map((r) => canSelect(r, locked))).toEqual([true, false, false, true]);
  });

  it("unlocks again when the last tick is removed", () => {
    expect(selectionTypeId(rows, [])).toBeNull();
    expect(canSelect(rows[1], selectionTypeId(rows, []))).toBe(true);
  });

  it("ignores ids that are not on this page", () => {
    expect(selectionTypeId(rows, ["gone"])).toBeNull();
  });

  it("selects all rows of the locked type, or of the first selectable row when nothing is ticked", () => {
    expect(selectAllIds(rows, "receipt")).toEqual(["b"]);
    expect(selectAllIds(rows, null)).toEqual(["a", "d"]);
    expect(selectAllIds([{ id: "x", documentTypeId: null }], null)).toEqual([]);
    expect(selectAllIds([], null)).toEqual([]);
  });
});

describe("page size from the URL", () => {
  it("accepts the sizes we offer and falls back to 10 for anything else", async () => {
    const { pageSizeFromParam, PAGE_SIZES } = await import("./paging");
    expect(PAGE_SIZES.map((s) => s.value)).toEqual(["10", "50", "100", "all"]);
    expect(pageSizeFromParam("50")).toBe("50");
    expect(pageSizeFromParam("all")).toBe("all");
    expect(pageSizeFromParam("7")).toBe("10");
    expect(pageSizeFromParam("-1")).toBe("10");
    expect(pageSizeFromParam(undefined)).toBe("10");
  });
});
