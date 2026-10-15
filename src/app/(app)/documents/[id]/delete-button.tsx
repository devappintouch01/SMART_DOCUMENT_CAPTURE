"use client";

import { useState, useTransition } from "react";
import { deleteDocumentAndReturn } from "../../actions";

export function DeleteButton({ documentId }: { documentId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
      >
        ลบเอกสาร
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800">
      ลบเอกสารนี้พร้อมไฟล์ต้นฉบับ? ย้อนกลับไม่ได้
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteDocumentAndReturn(documentId);
            if (result.error) setError(result.error);
          })
        }
        className="rounded-md bg-red-700 px-3 py-1 font-medium text-white hover:bg-red-800 disabled:opacity-60"
      >
        {pending ? "กำลังลบ…" : "ยืนยันลบ"}
      </button>
      <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="px-2 py-1">
        ยกเลิก
      </button>
      {error && <span>{error}</span>}
    </span>
  );
}
