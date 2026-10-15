"use client";

import { useState, useTransition } from "react";
import { rerunExtraction } from "./actions";

type Props = {
  documentId: string;
  currentTypeId: string | null;
  documentTypes: { id: string; name: string }[];
};

// Change the Document Type and/or read the Document again. Re-running replaces
// every value, Corrections included, so it asks before going ahead.
export function RerunPanel({ documentId, currentTypeId, documentTypes }: Props) {
  const [typeId, setTypeId] = useState(currentTypeId ?? "auto");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const result = await rerunExtraction(documentId, typeId);
      setError(result.error);
      setConfirming(false);
    });

  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1">
          <span className="text-neutral-500">ประเภทเอกสาร</span>
          <select
            value={typeId}
            onChange={(event) => {
              setTypeId(event.target.value);
              setConfirming(false);
            }}
            disabled={pending}
            className="select-lg mt-1 w-full border border-black/15 px-3 py-2"
          >
            <option value="auto">ให้ AI ตรวจให้</option>
            {documentTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={pending}
            className="rounded-md border border-black/15 px-4 py-2 font-medium hover:bg-neutral-50 disabled:opacity-60"
          >
            {typeId === (currentTypeId ?? "auto") ? "อ่านใหม่" : "เปลี่ยนประเภทและอ่านใหม่"}
          </button>
        )}
      </div>

      {confirming && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-amber-900">
            AI จะอ่านเอกสารนี้ใหม่ ค่าทั้งหมดรวมถึงค่าที่คุณแก้ไว้จะถูกแทนที่
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={run}
              disabled={pending}
              className="rounded-md bg-amber-600 px-4 py-1.5 font-medium text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {pending ? "กำลังส่งเข้าคิว…" : "ยืนยัน อ่านใหม่"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-md px-4 py-1.5 text-neutral-600 hover:bg-amber-100"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </div>
  );
}
