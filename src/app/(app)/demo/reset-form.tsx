"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DEMO_RESET_PHRASE } from "@/domain/demo";
import { resetDemoData } from "./actions";

export function ResetForm() {
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = phrase.trim() === DEMO_RESET_PHRASE;

  return (
    <div className="mt-5 border-t border-black/10 pt-4">
      <label className="block text-sm">
        พิมพ์คำว่า <b>{DEMO_RESET_PHRASE}</b> เพื่อยืนยัน
        <input
          value={phrase}
          onChange={(event) => setPhrase(event.target.value)}
          disabled={pending}
          className="mt-1 block w-48 rounded-md border border-black/15 px-3 py-2 outline-none focus:border-primary"
        />
      </label>
      <button
        type="button"
        disabled={!ready || pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setLoaded(null);
            const result = await resetDemoData(phrase);
            if (result.ok) {
              setLoaded(result.loaded);
              setPhrase("");
            } else {
              setError(result.error);
            }
          })
        }
        className="mt-3 rounded-md bg-red-700 px-5 py-2 font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "กำลังรีเซ็ต…" : "รีเซ็ตข้อมูล demo"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {loaded !== null && (
        <p role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          รีเซ็ตแล้ว โหลดเอกสารตัวอย่าง {loaded} ใบ{" "}
          <Link href="/" className="font-medium underline">
            ไปที่รายการเอกสาร
          </Link>
        </p>
      )}
    </div>
  );
}
