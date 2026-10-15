"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { canSelect, selectAllIds, selectionTypeId } from "@/domain/selection";
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

export function ResultList({ documents, offset }: { documents: DocumentListItem[]; offset: number }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Only Documents still on screen count as selected (a delete can remove rows
  // underneath a selection).
  const visibleIds = useMemo(() => new Set(documents.map((d) => d.id)), [documents]);
  const chosen = useMemo(() => [...selected].filter((id) => visibleIds.has(id)), [selected, visibleIds]);

  // Everything ticked shares one Document Type, so once a row is ticked the
  // rows of other types stay visible but cannot be ticked. A Document that has
  // no type yet can never be ticked.
  const lockedTypeId = selectionTypeId(documents, chosen);
  const lockedTypeName = documents.find((d) => d.documentTypeId === lockedTypeId)?.documentTypeName ?? null;
  const allIds = selectAllIds(documents, lockedTypeId);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  // Excel export needs finished Documents; say what is wrong instead of just
  // greying the button out.
  const exportProblem = useMemo(() => {
    const picked = documents.filter((d) => chosen.includes(d.id));
    const notDone = picked.filter((d) => d.status !== "done").length;
    return notDone > 0 ? `ยังมี ${notDone} ใบที่อ่านไม่เสร็จหรือล้มเหลว ส่งออกได้เฉพาะใบที่เสร็จแล้ว` : null;
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

  const hasSelection = chosen.length > 0;
  const canExport = hasSelection && !exportProblem;
  const actionBase = "rounded-md border px-3 py-1.5 font-medium transition-colors";

  return (
    <div className="mt-4">
      <div className="flex min-h-10 flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2" title="เลือกทุกใบที่เป็นประเภทเดียวกับใบแรกที่เลือก">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={allIds.length === 0}
            onChange={() => setSelected(allSelected ? new Set() : new Set(allIds))}
            className="h-4 w-4 accent-primary disabled:opacity-40"
          />
          เลือกทั้งหมด
        </label>
        <span className="text-neutral-500">
          {hasSelection ? `เลือกแล้ว ${chosen.length} ใบ${lockedTypeName ? ` (${lockedTypeName})` : ""}` : "ยังไม่ได้เลือก"}
        </span>

        {/* Always shown; they switch on once something is ticked. */}
        <a
          href={canExport ? `/api/documents/export?ids=${chosen.join(",")}` : undefined}
          aria-disabled={!canExport}
          className={`${actionBase} ml-auto border-green-600 text-green-800 ${
            canExport ? "hover:bg-green-50" : "pointer-events-none cursor-not-allowed opacity-40"
          }`}
        >
          ส่งออก Excel
        </a>
        <button
          type="button"
          disabled={!hasSelection || confirming}
          onClick={() => setConfirming(true)}
          className={`${actionBase} border-red-300 text-red-700 ${
            hasSelection && !confirming ? "hover:bg-red-50" : "cursor-not-allowed opacity-40"
          }`}
        >
          ลบที่เลือก
        </button>

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
      {hasSelection && exportProblem && (
        <p className="mt-1 text-sm text-amber-800">ส่งออก Excel ไม่ได้: {exportProblem}</p>
      )}

      <ul className="mt-2 divide-y divide-black/10 rounded-xl border border-black/10 bg-white">
        {documents.map((document, index) => {
          const selectable = canSelect(document, lockedTypeId);
          const reason =
            document.documentTypeId === null
              ? "ยังไม่ระบุประเภท จึงเลือกไม่ได้"
              : !selectable
                ? `เลือกได้เฉพาะประเภท "${lockedTypeName}" เหมือนที่เลือกไว้`
                : undefined;
          return (
            <li key={document.id} className="flex items-center">
              {document.documentTypeId === null ? (
                // No type, so nothing to export: no checkbox, but the column stays aligned.
                <span className="mx-4 h-4 w-4 shrink-0" title={reason} aria-hidden="true" />
              ) : (
                <input
                  type="checkbox"
                  checked={selected.has(document.id)}
                  disabled={!selectable}
                  onChange={() => toggle(document.id)}
                  aria-label={`เลือก ${document.fileName}`}
                  title={reason}
                  className="mx-4 h-4 w-4 shrink-0 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                />
              )}
              <span className="w-8 shrink-0 text-right text-sm text-neutral-400 tabular-nums" aria-label="ลำดับ">
                {offset + index + 1}
              </span>
              <Link
                href={`/documents/${document.id}`}
                className="flex min-w-0 flex-1 items-center gap-4 py-3 pr-4 pl-4 text-sm hover:bg-neutral-50"
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
          );
        })}
      </ul>
    </div>
  );
}
