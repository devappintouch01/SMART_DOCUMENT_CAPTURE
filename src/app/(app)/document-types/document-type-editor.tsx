"use client";

import { useState } from "react";
import { FIELD_KINDS, validateDocumentTypeDraft } from "@/domain/document-type-rules";
import type { FieldKind, FieldScope } from "@/domain/types";
import type { FieldInput } from "@/server/ports";

type Row = FieldInput & { key: string };

const withKeys = (fields: FieldInput[]): Row[] =>
  fields.map((f) => ({ ...f, key: crypto.randomUUID() }));

const inputClass =
  "w-full rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm outline-none focus:border-primary";

type Props = {
  initialName: string;
  initialFields: FieldInput[];
  // Names of the other Document Types, so a duplicate is caught before saving.
  takenNames: string[];
  submitLabel: string;
  onSubmit: (name: string, fields: FieldInput[]) => Promise<{ error: string | null }>;
};

// Name and Fields of a Document Type: Header Fields (one value per document)
// and Line Item Fields (the columns of the item table), each with a Field Kind
// and an optional description that tells the AI which value to pick.
export function DocumentTypeEditor({ initialName, initialFields, takenNames, submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState<Row[]>(() => withKeys(initialFields));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (key: string, changes: Partial<FieldInput>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  const remove = (key: string) => setRows((current) => current.filter((r) => r.key !== key));
  const add = (scope: FieldScope) =>
    setRows((current) => [
      ...current,
      { key: crypto.randomUUID(), scope, name: "", kind: "text", description: "" },
    ]);

  // Move within the same group only: header and Line Item order are separate.
  function move(key: string, direction: -1 | 1) {
    setRows((current) => {
      const index = current.findIndex((r) => r.key === key);
      const scope = current[index].scope;
      let target = index + direction;
      while (target >= 0 && target < current.length && current[target].scope !== scope) target += direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function submit() {
    const fields = rows.map((r) => ({ scope: r.scope, name: r.name, kind: r.kind, description: r.description }));
    const problems = validateDocumentTypeDraft(name, fields, takenNames);
    if (problems.length > 0) {
      setError(problems.join("\n"));
      return;
    }
    setSaving(true);
    setError(null);
    const result = await onSubmit(name.trim(), fields);
    // On success the caller navigates away; only an error brings us back here.
    if (result.error) {
      setError(result.error);
      setSaving(false);
    }
  }

  const section = (scope: FieldScope, title: string, hint: string) => {
    const group = rows.filter((r) => r.scope === scope);
    return (
      <div className="rounded-xl border border-black/10 bg-white">
        <div className="border-b border-black/10 px-4 py-3">
          <h2 className="font-medium">{title}</h2>
          <p className="text-sm text-neutral-500">{hint}</p>
        </div>
        <ul className="divide-y divide-black/5">
          {group.map((row, index) => (
            <li key={row.key} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_9rem_2fr_auto] sm:items-start">
              <input
                value={row.name}
                onChange={(event) => update(row.key, { name: event.target.value })}
                placeholder="ชื่อช่อง"
                aria-label="ชื่อช่อง"
                className={inputClass}
              />
              <select
                value={row.kind}
                onChange={(event) => update(row.key, { kind: event.target.value as FieldKind })}
                aria-label="ชนิดข้อมูล"
                className={inputClass}
              >
                {FIELD_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
              <input
                value={row.description}
                onChange={(event) => update(row.key, { description: event.target.value })}
                placeholder="บอก AI ว่าให้อ่านค่าไหน (ไม่บังคับ)"
                aria-label="คำอธิบายช่อง"
                className={inputClass}
              />
              <div className="flex items-center gap-1 text-neutral-500">
                <button
                  type="button"
                  onClick={() => move(row.key, -1)}
                  disabled={index === 0}
                  aria-label="เลื่อนขึ้น"
                  className="rounded px-2 py-1 hover:bg-neutral-100 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(row.key, 1)}
                  disabled={index === group.length - 1}
                  aria-label="เลื่อนลง"
                  className="rounded px-2 py-1 hover:bg-neutral-100 disabled:opacity-30"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={() => remove(row.key)}
                  aria-label="ลบช่อง"
                  className="rounded px-2 py-1 hover:bg-neutral-100 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
          {group.length === 0 && <li className="px-4 py-3 text-sm text-neutral-400">ยังไม่มีช่อง</li>}
        </ul>
        <div className="border-t border-black/10 px-4 py-2">
          <button type="button" onClick={() => add(scope)} className="text-sm text-primary hover:underline">
            + เพิ่มช่อง
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <label className="block text-sm">
        ชื่อประเภทเอกสาร
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="เช่น ใบวางบิล"
          className={`${inputClass} mt-1 max-w-md`}
        />
      </label>

      {section("header", "ข้อมูลหลัก", "ค่าที่มีค่าเดียวต่อเอกสาร เช่น เลขที่เอกสาร วันที่ ผู้ขาย ยอดรวม")}
      {section("line_item", "รายการ (ตาราง)", "คอลัมน์ของตารางรายการ ได้ 1 ค่าต่อ 1 แถว ถ้าเอกสารไม่มีตารางไม่ต้องใส่")}

      {error && (
        <p role="alert" className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving}
        className="rounded-md bg-primary px-5 py-2 font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "กำลังบันทึก…" : submitLabel}
      </button>
    </div>
  );
}
