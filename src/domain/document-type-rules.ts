import type { FieldKind } from "./types";

// Rules for a Document Type the user is creating or editing. Pure, so the
// browser can warn early and the Document service can enforce the same thing.

export const FIELD_KINDS: { kind: FieldKind; label: string }[] = [
  { kind: "text", label: "ข้อความ" },
  { kind: "number", label: "ตัวเลข" },
  { kind: "date", label: "วันที่" },
  { kind: "amount", label: "จำนวนเงิน" },
];

export const MAX_TYPE_NAME = 80;
export const MAX_FIELD_NAME = 60;
export const MAX_FIELD_DESCRIPTION = 300;
export const MAX_FIELDS = 60;

type DraftField = { scope: string; name: string; kind: string; description: string };

// Thai messages, one per problem; an empty list means the draft is valid.
export function validateDocumentTypeDraft(
  name: string,
  fields: DraftField[],
  existingNames: string[],
): string[] {
  const problems: string[] = [];
  const typeName = name.trim();

  if (typeName === "") problems.push("ใส่ชื่อประเภทเอกสาร");
  else if (typeName.length > MAX_TYPE_NAME) problems.push(`ชื่อประเภทยาวเกิน ${MAX_TYPE_NAME} ตัวอักษร`);
  else if (existingNames.some((n) => n.trim().toLowerCase() === typeName.toLowerCase())) {
    problems.push(`มีประเภทเอกสารชื่อ "${typeName}" อยู่แล้ว`);
  }

  if (fields.length === 0) problems.push("ต้องมีอย่างน้อย 1 ช่อง");
  if (fields.length > MAX_FIELDS) problems.push(`มีช่องได้ไม่เกิน ${MAX_FIELDS} ช่อง`);

  const kinds = FIELD_KINDS.map((k) => k.kind as string);
  const seen = new Set<string>();
  for (const field of fields) {
    const label = field.name.trim() || "(ไม่มีชื่อ)";
    if (field.name.trim() === "") problems.push("มีช่องที่ยังไม่ได้ตั้งชื่อ");
    else if (field.name.trim().length > MAX_FIELD_NAME) problems.push(`ชื่อช่อง "${label}" ยาวเกิน ${MAX_FIELD_NAME} ตัวอักษร`);
    if (!kinds.includes(field.kind)) problems.push(`ช่อง "${label}" มีชนิดข้อมูลที่ไม่รองรับ`);
    if (field.scope !== "header" && field.scope !== "line_item") problems.push(`ช่อง "${label}" อยู่ผิดกลุ่ม`);
    if (field.description.length > MAX_FIELD_DESCRIPTION) problems.push(`คำอธิบายของช่อง "${label}" ยาวเกิน ${MAX_FIELD_DESCRIPTION} ตัวอักษร`);

    const key = `${field.scope}:${field.name.trim().toLowerCase()}`;
    if (field.name.trim() !== "" && seen.has(key)) {
      problems.push(`มีช่อง "${label}" ซ้ำกันในกลุ่มเดียวกัน`);
    }
    seen.add(key);
  }

  return [...new Set(problems)];
}
