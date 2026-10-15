"use client";

import { useState } from "react";

// The original file beside the extracted values: PDFs use the browser's own
// page-by-page viewer; images can be zoomed with a click.
export function OriginalViewer({ url, mimeType }: { url: string | null; mimeType: string }) {
  const [zoomed, setZoomed] = useState(false);

  if (!url) {
    return (
      <div className="flex h-96 items-center justify-center rounded-xl border border-black/10 bg-white text-sm text-neutral-500">
        เปิดไฟล์ต้นฉบับไม่ได้
      </div>
    );
  }

  if (mimeType === "application/pdf") {
    return (
      <iframe
        src={url}
        title="เอกสารต้นฉบับ"
        className="h-[80vh] w-full rounded-xl border border-black/10 bg-white"
      />
    );
  }

  return (
    <div className="h-[80vh] overflow-auto rounded-xl border border-black/10 bg-white">
      <button
        type="button"
        onClick={() => setZoomed((z) => !z)}
        className={`block ${zoomed ? "w-[200%] cursor-zoom-out" : "w-full cursor-zoom-in"}`}
        aria-label={zoomed ? "ย่อภาพ" : "ขยายภาพ"}
      >
        {/* Short-lived signed URL from Storage, so next/image has nothing to optimise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="เอกสารต้นฉบับ" className="w-full" />
      </button>
    </div>
  );
}
