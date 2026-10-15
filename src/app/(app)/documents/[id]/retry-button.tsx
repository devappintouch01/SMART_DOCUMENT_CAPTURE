"use client";

import { useState, useTransition } from "react";
import { retryExtraction } from "./actions";

export function RetryButton({ documentId }: { documentId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await retryExtraction(documentId);
            setError(result.error);
          })
        }
        className="rounded-md bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
      >
        {pending ? "กำลังส่งเข้าคิว…" : "ลองใหม่"}
      </button>
      {error && <p className="mt-2 text-sm">{error}</p>}
    </div>
  );
}
