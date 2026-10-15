"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { DocumentListItem } from "@/domain/types";
import { deleteDocuments } from "./actions";
import { StatusBadge } from "./status-badge";

// th-TH uses the Buddhist Era; the year must be written out in full (2569).
const uploadedAtFormat = new Intl.DateTimeFormat("th-TH", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Bangkok",
});

function Thumbnail({ document }: { document: DocumentListItem }) {
  if (document.previewUrl) {
    return (
      // Short-lived signed URL from Storage, so next/image has nothing to optimise.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={document.previewUrl}
        alt=""
        className="h-12 w-12 rounded-md border border-black/10 object-cover"
      />
    );
  }
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-md border border-black/10 bg-red-50 text-xs font-semibold text-red-700">
      PDF
    </span>
  );
}

export function ResultList({ documents }: { documents: DocumentListItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Only Documents still on screen count as selected (a filter or a delete
  // can remove rows underneath a selection).
  const visibleIds = useMemo(() => new Set(documents.map((d) => d.id)), [documents]);
  const chosen = useMemo(() => [...selected].filter((id) => visibleIds.has(id)), [selected, visibleIds]);
  const allSelected = documents.length > 0 && chosen.length === documents.length;

  // Excel export needs finished Documents of one Document Type; say what is
  // wrong instead of just greying the button out.
  const exportProblem = useMemo(() => {
    const picked = documents.filter((d) => chosen.includes(d.id));
    const notDone = picked.filter((d) => d.status !== "done").length;
    if (notDone > 0) return `ยังมี ${notDone} ใบที่อ่านไม่เสร็จหรือล้มเหลว ส่งออกได้เฉพาะใบที่เสร็จแล้ว`;
    const types = new Set(picked.map((d) => d.documentTypeName));
    if (types.size > 1) return `เลือกปนกัน ${types.size} ประเภท (${[...types].join(", ")}) เลือกประเภทเดียวกันเท่านั้น เพราะคอลัมน์ไม่เหมือนกัน`;
    return null;
  }, [documents, chosen]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function remove() {
    startTransition(async () => {
      const result = await deleteDocuments(chosen);
      setError(result.error);
      if (!result.error) {
        setSelected(new Set());
        setConfirming(false);
      }
    });
  }

  return (
    <div className="mt-4">
      <div className="flex min-h-10 flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(documents.map((d) => d.id)))}
            className="h-4 w-4 accent-primary"
          />
          เลือกทั้งหมด
        </label>
        {chosen.length > 0 && !confirming && (
          <>
            <span className="text-neutral-500">เลือกแล้ว {chosen.length} ใบ</span>
            <a
              href={exportProblem ? undefined : `/api/documents/export?ids=${chosen.join(",")}`}
              aria-disabled={exportProblem !== null}
              className={`rounded-md border border-green-600 px-3 py-1 font-medium text-green-800 ${
                exportProblem ? "pointer-events-none opacity-40" : "hover:bg-green-50"
              }`}
            >
              ส่งออก Excel
            </a>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-md border border-red-300 px-3 py-1 text-red-700 hover:bg-red-50"
            >
              ลบที่เลือก
            </button>
          </>
        )}
        {confirming && (
          <span className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-red-800">
            ลบ {chosen.length} ใบ พร้อมไฟล์ต้นฉบับ? ย้อนกลับไม่ได้
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md bg-red-700 px-3 py-1 font-medium text-white hover:bg-red-800 disabled:opacity-60"
            >
              {pending ? "กำลังลบ…" : "ยืนยันลบ"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="px-2 py-1">
              ยกเลิก
            </button>
          </span>
        )}
        {error && <span className="text-red-700">{error}</span>}
      </div>
      {chosen.length > 0 && exportProblem && (
        <p className="mt-1 text-sm text-amber-800">ส่งออก Excel ไม่ได้: {exportProblem}</p>
      )}

      <ul className="mt-2 divide-y divide-black/10 rounded-xl border border-black/10 bg-white">
        {documents.map((document) => (
          <li key={document.id} className="flex items-center">
            <input
              type="checkbox"
              checked={selected.has(document.id)}
              onChange={() => toggle(document.id)}
              aria-label={`เลือก ${document.fileName}`}
              className="mx-4 h-4 w-4 shrink-0 accent-primary"
            />
            <Link
              href={`/documents/${document.id}`}
              className="flex min-w-0 flex-1 items-center gap-4 py-3 pr-4 text-sm hover:bg-neutral-50"
            >
              <Thumbnail document={document} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{document.fileName}</p>
                <p className="text-neutral-500">{document.documentTypeName ?? "ยังไม่ระบุประเภท"}</p>
                {document.status === "failed" && document.failureReason && (
                  <p className="truncate text-red-700">{document.failureReason}</p>
                )}
              </div>
              <StatusBadge status={document.status} reason={document.failureReason} />
              {document.openReviewFlagCount > 0 && (
                <span className="text-xs text-amber-700" title="ช่องที่ควรตรวจ">
                  ⚠ {document.openReviewFlagCount}
                </span>
              )}
              <span className="hidden w-36 text-right text-neutral-500 sm:block">
                {uploadedAtFormat.format(document.uploadedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
