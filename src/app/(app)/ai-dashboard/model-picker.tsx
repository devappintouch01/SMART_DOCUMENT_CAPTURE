"use client";

import { useState, useTransition } from "react";
import { saveExtractionModel } from "./actions";

export type ModelOption = {
  id: string;
  label: string;
  note: string;
  // List price, USD per million tokens.
  inputPerMTok: number;
  outputPerMTok: number;
  // Measured average cost of one Document with this model (baht), or null.
  measuredBahtPerDocument: string | null;
};

type Props = {
  options: ModelOption[];
  current: string;
  source: "setting" | "default";
};

// Superadmin only: which Claude model reads newly uploaded Documents.
export function ModelPicker({ options, current, source }: Props) {
  const [selected, setSelected] = useState(current);
  const [saved, setSaved] = useState(current);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = selected !== saved;

  function save() {
    startTransition(async () => {
      const result = await saveExtractionModel(selected);
      setError(result.error);
      if (!result.error) {
        setSaved(selected);
        setMessage("บันทึกแล้ว เอกสารที่อ่านต่อจากนี้จะใช้โมเดลนี้");
      }
    });
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-5">
      <h2 className="text-base font-semibold">โมเดลที่ใช้อ่านเอกสาร</h2>
      <p className="mt-1 text-sm text-neutral-500">
        {source === "setting"
          ? "ใช้ค่าที่เลือกไว้ในหน้านี้"
          : "ยังไม่ได้เลือกในหน้านี้ จึงใช้ค่า AI_EXTRACTION_MODEL จาก env"}{" "}
        · ค่าที่เลือกที่นี่มีผลเหนือ env · ใช้กับทุกคน และกับเอกสารที่อ่านหลังจากนี้ (รวมการอ่านซ้ำ)
      </p>

      <div role="radiogroup" aria-label="โมเดลที่ใช้อ่านเอกสาร" className="mt-4 grid gap-3 md:grid-cols-3">
        {options.map((option) => {
          const active = option.id === selected;
          return (
            <label
              key={option.id}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-4 text-sm transition-colors ${
                active ? "border-primary bg-primary-soft" : "border-black/15 hover:border-black/30"
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="extraction-model"
                  value={option.id}
                  checked={active}
                  disabled={pending}
                  onChange={() => {
                    setSelected(option.id);
                    setMessage(null);
                    setError(null);
                  }}
                  className="h-4 w-4 accent-primary"
                />
                {option.label}
                {option.id === saved && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-normal text-green-800">
                    ใช้อยู่
                  </span>
                )}
              </span>
              <span className="text-neutral-500">{option.note}</span>
              <span className="text-xs text-neutral-500">
                ${option.inputPerMTok} เข้า / ${option.outputPerMTok} ออก ต่อล้าน token
              </span>
              <span className="text-xs text-neutral-700">
                {option.measuredBahtPerDocument
                  ? `วัดได้เฉลี่ย ${option.measuredBahtPerDocument} ต่อเอกสาร`
                  : "ยังไม่มีข้อมูลที่วัดได้"}
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="rounded-md bg-primary px-4 py-1.5 font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก…" : "ใช้โมเดลนี้"}
        </button>
        {message && !dirty && <span className="text-green-700">{message}</span>}
        {error && (
          <span role="alert" className="text-red-700">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
