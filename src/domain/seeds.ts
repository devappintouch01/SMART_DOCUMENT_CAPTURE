import { createHash } from "node:crypto";
import type { DocumentType, Field, FieldKind, FieldScope } from "./types";

// The three Document Types every install starts with. Ids are derived from
// names so re-seeding (and the demo reset) never changes the id a stored
// value is keyed by.

function stableId(name: string): string {
  const hash = createHash("sha1").update(`sdc:${name}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

type FieldSpec = [name: string, kind: FieldKind, description: string];

function buildType(
  name: string,
  header: FieldSpec[],
  lineItems: FieldSpec[],
): DocumentType {
  const typeId = stableId(`type:${name}`);
  const toFields = (scope: FieldScope, specs: FieldSpec[], offset: number): Field[] =>
    specs.map(([fieldName, kind, description], index) => ({
      id: stableId(`field:${name}:${scope}:${fieldName}`),
      scope,
      name: fieldName,
      kind,
      description,
      position: offset + index,
    }));

  return {
    id: typeId,
    name,
    isSeed: true,
    fields: [
      ...toFields("header", header, 0),
      ...toFields("line_item", lineItems, header.length),
    ],
  };
}

export const SEED_DOCUMENT_TYPES: DocumentType[] = [
  buildType(
    "ใบเสร็จรับเงิน",
    [
      ["เลขที่ใบเสร็จ", "text", "เลขที่ของใบเสร็จรับเงินฉบับนี้"],
      ["วันที่", "date", "วันที่ออกใบเสร็จ"],
      ["ชื่อผู้ขาย", "text", "ชื่อบริษัทหรือร้านที่ออกใบเสร็จ"],
      ["เลขประจำตัวผู้เสียภาษีผู้ขาย", "text", "เลขประจำตัวผู้เสียภาษี 13 หลักของผู้ขาย"],
      ["ชื่อผู้ซื้อ", "text", "ชื่อลูกค้าหรือผู้จ่ายเงิน"],
      ["วิธีชำระเงิน", "text", "เช่น เงินสด โอนเงิน บัตรเครดิต เช็ค"],
      ["ยอดรวมทั้งสิ้น", "amount", "ยอดสุทธิที่ได้รับชำระ รวมภาษีแล้ว"],
    ],
    [
      ["รายการ", "text", "ชื่อสินค้าหรือบริการในแถวนี้"],
      ["จำนวน", "number", "จำนวนสินค้าในแถวนี้"],
      ["ราคาต่อหน่วย", "amount", "ราคาต่อ 1 หน่วย"],
      ["จำนวนเงิน", "amount", "ยอดเงินของแถวนี้"],
    ],
  ),
  buildType(
    "ใบกำกับภาษี",
    [
      ["เลขที่ใบกำกับภาษี", "text", "เลขที่ของใบกำกับภาษีฉบับนี้"],
      ["วันที่", "date", "วันที่ออกใบกำกับภาษี"],
      ["ชื่อผู้ขาย", "text", "ชื่อบริษัทที่ออกใบกำกับภาษี"],
      ["เลขประจำตัวผู้เสียภาษีผู้ขาย", "text", "เลขประจำตัวผู้เสียภาษี 13 หลักของผู้ขาย"],
      ["สาขาผู้ขาย", "text", "เช่น สำนักงานใหญ่ หรือ สาขาที่ 00001"],
      ["ชื่อผู้ซื้อ", "text", "ชื่อบริษัทหรือบุคคลที่ซื้อ"],
      ["เลขประจำตัวผู้เสียภาษีผู้ซื้อ", "text", "เลขประจำตัวผู้เสียภาษี 13 หลักของผู้ซื้อ"],
      ["สาขาผู้ซื้อ", "text", "เช่น สำนักงานใหญ่ หรือ สาขาที่ 00001"],
      ["มูลค่าก่อนภาษี", "amount", "ยอดรวมก่อนภาษีมูลค่าเพิ่ม"],
      ["ภาษีมูลค่าเพิ่ม", "amount", "จำนวนเงินภาษีมูลค่าเพิ่ม (VAT)"],
      ["ยอดรวมทั้งสิ้น", "amount", "ยอดสุทธิที่ต้องชำระ รวม VAT แล้ว"],
    ],
    [
      ["รหัสสินค้า", "text", "รหัสสินค้าของแถวนี้ ถ้ามี"],
      ["รายการ", "text", "ชื่อสินค้าหรือบริการในแถวนี้"],
      ["จำนวน", "number", "จำนวนสินค้าในแถวนี้"],
      ["หน่วย", "text", "หน่วยนับ เช่น ชิ้น กล่อง"],
      ["ราคาต่อหน่วย", "amount", "ราคาต่อ 1 หน่วย"],
      ["ส่วนลด", "amount", "ส่วนลดของแถวนี้ ถ้ามี"],
      ["จำนวนเงิน", "amount", "ยอดเงินของแถวนี้หลังหักส่วนลด"],
    ],
  ),
  buildType(
    "ใบเบิกสินค้า",
    [
      ["เลขที่ใบเบิก", "text", "เลขที่ของใบเบิกสินค้าฉบับนี้"],
      ["วันที่เบิก", "date", "วันที่เบิกสินค้า"],
      ["ผู้ขอเบิก", "text", "ชื่อผู้ขอเบิกสินค้า"],
      ["แผนก", "text", "แผนกของผู้ขอเบิก"],
      ["ผู้อนุมัติ", "text", "ชื่อผู้อนุมัติการเบิก"],
      ["หมายเหตุ", "text", "ข้อความหมายเหตุท้ายเอกสาร ถ้ามี"],
    ],
    [
      ["รหัสสินค้า", "text", "รหัสสินค้าของแถวนี้ ถ้ามี"],
      ["รายการ", "text", "ชื่อสินค้าที่เบิกในแถวนี้"],
      ["จำนวนที่เบิก", "number", "จำนวนที่เบิกในแถวนี้"],
      ["หน่วย", "text", "หน่วยนับ เช่น ชิ้น กล่อง"],
    ],
  ),
];
