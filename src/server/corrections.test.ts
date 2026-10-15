import { describe, expect, it } from "vitest";
import { parseThaiDate } from "@/domain/format";
import { toExtractedValue } from "@/domain/extracted-data";
import { SEED_DOCUMENT_TYPES } from "@/domain/seeds";
import { createDocumentService, UserFacingError } from "./document-service";
import { FakeAiReader } from "./testing/fake-ai-reader";
import { InMemoryStore } from "./testing/in-memory-store";

const taxInvoice = SEED_DOCUMENT_TYPES[1];
const id = (name: string) => taxInvoice.fields.find((f) => f.name === name)!.id;
const raw = (value: string | null, flagReason: string | null = null) => ({ value, flagReason });

function setup() {
  const store = new InMemoryStore();
  store.documentTypes = SEED_DOCUMENT_TYPES;
  const service = createDocumentService({ store, ai: new FakeAiReader() });
  const doc = store.addDocument({
    status: "done",
    documentTypeId: taxInvoice.id,
    extractedData: {
      header: {
        [id("เลขที่ใบกำกับภาษี")]: toExtractedValue("text", raw("IV-001")),
        [id("ยอดรวมทั้งสิ้น")]: toExtractedValue("amount", raw("1250.00", "ลายมือไม่ชัด")),
        [id("วันที่")]: toExtractedValue("date", raw("2026-10-15")),
      },
      lineItems: [
        {
          [id("รายการ")]: toExtractedValue("text", raw("กระดาษ")),
          [id("จำนวน")]: toExtractedValue("number", raw("2", "ตัวเลขไม่ชัด")),
        },
        {
          [id("รายการ")]: toExtractedValue("text", raw("หมึก")),
          [id("จำนวน")]: toExtractedValue("number", raw("1")),
        },
      ],
    },
  });
  const header = () => store.documents[0].extractedData!.header;
  const lines = () => store.documents[0].extractedData!.lineItems;
  const typed = (overrides: Record<string, string> = {}) => ({
    [id("เลขที่ใบกำกับภาษี")]: "IV-001",
    [id("ยอดรวมทั้งสิ้น")]: "1250.00",
    [id("วันที่")]: "2026-10-15",
    ...overrides,
  });
  const rows = (...r: { sourceIndex: number | null; รายการ: string; จำนวน: string }[]) =>
    r.map((row) => ({
      sourceIndex: row.sourceIndex,
      values: { [id("รายการ")]: row.รายการ, [id("จำนวน")]: row.จำนวน },
    }));
  const sameRows = () => rows({ sourceIndex: 0, รายการ: "กระดาษ", จำนวน: "2" }, { sourceIndex: 1, รายการ: "หมึก", จำนวน: "1" });
  return { store, service, doc, header, lines, typed, rows, sameRows };
}

describe("saveCorrections", () => {
  it("stores a changed value as a Correction, keeps the AI's original and settles the flag", async () => {
    const { service, doc, header, typed, sameRows } = setup();

    await service.saveCorrections(doc.id, {
      header: typed({ [id("ยอดรวมทั้งสิ้น")]: "1,520.00" }),
      lineItems: sameRows(),
    });

    expect(header()[id("ยอดรวมทั้งสิ้น")]).toEqual({
      value: "1520.00",
      original: "1250.00",
      corrected: true,
      flag: { reason: "ลายมือไม่ชัด", status: "confirmed" },
    });
    expect((await service.listDocuments())[0].openReviewFlagCount).toBe(1);
  });

  it("leaves untouched values and their flags exactly as the AI produced them", async () => {
    const { service, doc, header, lines, typed, sameRows } = setup();

    await service.saveCorrections(doc.id, { header: typed(), lineItems: sameRows() });

    expect(header()[id("ยอดรวมทั้งสิ้น")]).toMatchObject({ corrected: false, flag: { status: "open" } });
    expect(lines()[0][id("จำนวน")]).toMatchObject({ corrected: false, flag: { status: "open" } });
  });

  it("adds and removes Line Item rows", async () => {
    const { service, doc, lines, typed, rows } = setup();

    await service.saveCorrections(doc.id, {
      header: typed(),
      lineItems: rows(
        { sourceIndex: 1, รายการ: "หมึก", จำนวน: "1" },
        { sourceIndex: null, รายการ: "แฟ้ม", จำนวน: "5" },
      ),
    });

    expect(lines().map((r) => r[id("รายการ")].value)).toEqual(["หมึก", "แฟ้ม"]);
    expect(lines()[1][id("รายการ")]).toMatchObject({ original: null, corrected: true });
    // The removed row took its open flag with it.
    expect((await service.listDocuments())[0].openReviewFlagCount).toBe(1);
  });

  it("rejects values that cannot be read as the Field Kind, naming each Field, and saves nothing", async () => {
    const { service, doc, header, typed, sameRows } = setup();

    const attempt = service.saveCorrections(doc.id, {
      header: typed({ [id("ยอดรวมทั้งสิ้น")]: "หนึ่งพัน", [id("วันที่")]: "ไม่ใช่วันที่" }),
      lineItems: sameRows(),
    });

    await expect(attempt).rejects.toThrow(/วันที่.*\n.*ยอดรวมทั้งสิ้น/);
    expect(header()[id("ยอดรวมทั้งสิ้น")].value).toBe("1250.00");
  });

  it("only works on Done Documents", async () => {
    const { store, service, doc, typed, sameRows } = setup();
    store.documents[0].status = "queued";

    await expect(
      service.saveCorrections(doc.id, { header: typed(), lineItems: sameRows() }),
    ).rejects.toBeInstanceOf(UserFacingError);
  });

  it("feeds the edited values to a later re-read check: a re-run replaces them", async () => {
    const { store, service, doc, typed, sameRows } = setup();
    await service.saveCorrections(doc.id, {
      header: typed({ [id("เลขที่ใบกำกับภาษี")]: "IV-999" }),
      lineItems: sameRows(),
    });

    await service.rerunExtraction(doc.id, taxInvoice.id);

    expect(store.documents[0].extractedData).toBeNull();
  });
});

describe("confirmReviewFlags", () => {
  it("settles the chosen flags and nothing else", async () => {
    const { service, doc, header, lines } = setup();

    await service.confirmReviewFlags(doc.id, [{ rowIndex: null, fieldId: id("ยอดรวมทั้งสิ้น") }]);

    expect(header()[id("ยอดรวมทั้งสิ้น")].flag?.status).toBe("confirmed");
    expect(header()[id("ยอดรวมทั้งสิ้น")].value).toBe("1250.00");
    expect(lines()[0][id("จำนวน")].flag?.status).toBe("open");
    expect((await service.listDocuments())[0].openReviewFlagCount).toBe(1);

    await service.confirmReviewFlags(doc.id, [{ rowIndex: 0, fieldId: id("จำนวน") }]);
    expect((await service.listDocuments())[0].openReviewFlagCount).toBe(0);
  });
});

describe("parseThaiDate", () => {
  it.each([
    ["15/10/2569", "2026-10-15"],
    ["15/10/69", "2026-10-15"],
    ["1/2/2569", "2026-02-01"],
    ["15-10-2026", "2026-10-15"],
    ["2026-10-15", "2026-10-15"],
    ["30/02/2569", null],
    ["พรุ่งนี้", null],
  ])("reads %s as %s", (text, expected) => {
    expect(parseThaiDate(text)).toBe(expected);
  });
});
