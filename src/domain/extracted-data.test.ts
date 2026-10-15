import { describe, expect, it } from "vitest";
import { countOpenFlags, normalizeValue, toExtractedValue } from "./extracted-data";
import { formatValue } from "./format";

describe("normalizeValue", () => {
  it.each([
    ["1,070.00", "1070.00"],
    ["1070", "1070.00"],
    ["฿ 2,500.5", "2500.50"],
    ["350 บาท", "350.00"],
  ])("reads Amount %s as %s", (raw, expected) => {
    expect(normalizeValue("amount", raw)).toEqual({ value: expected, problem: null });
  });

  it("reads Numbers without forcing decimals", () => {
    expect(normalizeValue("number", "12").value).toBe("12");
    expect(normalizeValue("number", "2.50").value).toBe("2.5");
  });

  it("keeps ISO dates and converts a Buddhist Era year that slipped through", () => {
    expect(normalizeValue("date", "2026-10-15").value).toBe("2026-10-15");
    expect(normalizeValue("date", "2569-10-15").value).toBe("2026-10-15");
  });

  it.each([
    ["date", "15/10/69"],
    ["date", "2026-02-30"],
    ["amount", "หนึ่งพันบาท"],
    ["number", "N/A"],
  ] as const)("reports a problem for %s %s", (kind, raw) => {
    const result = normalizeValue(kind, raw);
    expect(result.value).toBeNull();
    expect(result.problem).toMatch(/อ่าน/);
  });

  it("treats blanks as missing, not as problems", () => {
    expect(normalizeValue("amount", "  ")).toEqual({ value: null, problem: null });
    expect(normalizeValue("text", null)).toEqual({ value: null, problem: null });
  });
});

describe("toExtractedValue", () => {
  it("keeps the AI's original text and opens a Review Flag for the AI's doubt and for unreadable values", () => {
    expect(toExtractedValue("amount", { value: "1,O70", flagReason: "ลายมือไม่ชัด" })).toEqual({
      value: null,
      original: "1,O70",
      corrected: false,
      flag: { reason: "ลายมือไม่ชัด · อ่านเป็นจำนวนเงินไม่ได้", status: "open" },
    });
    expect(toExtractedValue("text", { value: "ร้าน ก", flagReason: null }).flag).toBeNull();
  });

  it("counts open flags across header and Line Items", () => {
    const flagged = toExtractedValue("text", { value: "x", flagReason: "ไม่ชัด" });
    const clean = toExtractedValue("text", { value: "y", flagReason: null });
    expect(
      countOpenFlags({ header: { a: flagged, b: clean }, lineItems: [{ c: flagged }, { d: clean }] }),
    ).toBe(2);
    expect(countOpenFlags(null)).toBe(0);
  });
});

describe("formatValue", () => {
  it("shows dates in the Buddhist Era and Amounts with separators", () => {
    expect(formatValue("date", "2026-10-15")).toBe("15/10/2569");
    expect(formatValue("amount", "1070.00")).toBe("1,070.00");
    expect(formatValue("number", "1500")).toBe("1,500");
    expect(formatValue("text", null)).toBe("");
  });
});

describe("formatNumericInput", () => {
  it("shows separators, and two decimals for money, but only for plain numbers", async () => {
    const { formatNumericInput } = await import("./format");
    expect(formatNumericInput("amount", "250000")).toBe("250,000.00");
    expect(formatNumericInput("amount", "58411.21")).toBe("58,411.21");
    expect(formatNumericInput("amount", "1,070")).toBe("1,070.00");
    expect(formatNumericInput("number", "1500")).toBe("1,500");
    expect(formatNumericInput("number", "0.25")).toBe("0.25");
    // Half-typed or unreadable input is left exactly as typed.
    expect(formatNumericInput("amount", "12.")).toBe("12.");
    expect(formatNumericInput("amount", "abc")).toBe("abc");
    expect(formatNumericInput("amount", "")).toBe("");
    // Other kinds are untouched.
    expect(formatNumericInput("text", "250000")).toBe("250000");
    expect(formatNumericInput("date", "2026-10-15")).toBe("2026-10-15");
  });
});
