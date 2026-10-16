"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { canSelect, selectAllIds } from "@/domain/selection";
import type { DocumentListItem } from "@/domain/types";
import { formatBaht } from "./ai-format";
import { deleteDocuments } from "./actions";
import { recallPicked, rememberPicked, type Picked } from "./selection-memory";
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

const PREVIEW_WIDTH = 380;
const PREVIEW_HEIGHT = 500;

// The original file next to the pointer while it rests on a thumbnail. Follows the
// pointer, flips to its left near the right edge, and never takes the hover.
function HoverPreview({ document, x, y }: { document: DocumentListItem; x: number; y: number }) {
  if (!document.fileUrl) return null;
  const left = x + 24 + PREVIEW_WIDTH > window.innerWidth - 12 ? x - 24 - PREVIEW_WIDTH : x + 24;
  const top = Math.min(Math.max(8, y - PREVIEW_HEIGHT / 3), Math.max(8, window.innerHeight - PREVIEW_HEIGHT - 8));
  const isPdf = document.mimeType === "application/pdf";
  return (
    <div
      aria-hidden="true"
      style={{ left, top, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
      className="pointer-events-none fixed z-50 overflow-hidden rounded-xl border border-black/15 bg-white shadow-2xl"
    >
      {isPdf ? (
        <iframe
          src={`${document.fileUrl}#toolbar=0&navpanes=0&view=FitH`}
          title={`ตัวอย่าง ${document.fileName}`}
          className="h-full w-full"
          tabIndex={-1}
        />
      ) : (
        // Short-lived signed URL from Storage, so next/image has nothing to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={document.fileUrl} alt="" className="h-full w-full object-contain" />
      )}
    </div>
  );
}

type Props = {
  documents: DocumentListItem[];
  offset: number;
  // Total cost (USD) of reading each Document, by id. Only given to the superadmin.
  costs?: Record<string, number>;
};

export function ResultList({ documents, offset, costs }: Props) {
  // Hover preview: wait a moment so passing over a thumbnail does not load the file.
  const [hovered, setHovered] = useState<{ document: DocumentListItem; x: number; y: number } | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopHover = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHovered(null);
  };
  const startHover = (document: DocumentListItem) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered({ document, ...pointer.current }), 350);
  };
  const moveHover = (event: React.MouseEvent) => {
    pointer.current = { x: event.clientX, y: event.clientY };
    setHovered((current) => (current ? { ...current, ...pointer.current } : current));
  };

  const [picked, setPickedState] = useState<Record<string, Picked>>(recallPicked);
  const setPicked = (next: Record<string, Picked>) => {
    rememberPicked(next);
    setPickedState(next);
  };
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = useMemo(() => Object.keys(picked), [picked]);

  // Everything ticked shares one Document Type, so once a row is ticked the
  // rows of other types stay visible but cannot be ticked. A Document that has
  // no type yet can never be ticked.
  const first = chosen.length > 0 ? picked[chosen[0]] : null;
  const lockedTypeId = first?.documentTypeId ?? null;
  const lockedTypeName = first?.documentTypeName ?? null;
  // "Select all" works on the rows of this page.
  const allIds = selectAllIds(documents, lockedTypeId);
  const allSelected = allIds.length > 0 && allIds.every((id) => id in picked);
  const chosenHere = documents.filter((d) => d.id in picked).length;

  // Excel export needs finished Documents; say what is wrong instead of just
  // greying the button out.
  const exportProblem = useMemo(() => {
    const notDone = Object.values(picked).filter((p) => p.status !== "done").length;
    return notDone > 0 ? `ยังมี ${notDone} ใบที่อ่านไม่เสร็จหรือล้มเหลว ส่งออกได้เฉพาะใบที่เสร็จแล้ว` : null;
  }, [picked]);

  const entryOf = (d: DocumentListItem): Picked => ({
    documentTypeId: d.documentTypeId,
    documentTypeName: d.documentTypeName,
    status: d.status,
  });

  const toggle = (document: DocumentListItem) => {
    const next = { ...picked };
    if (document.id in next) delete next[document.id];
    else next[document.id] = entryOf(document);
    setPicked(next);
  };

  function toggleAll() {
    const next = { ...picked };
    for (const id of allIds) delete next[id];
    if (!allSelected) for (const d of documents) if (allIds.includes(d.id)) next[d.id] = entryOf(d);
    setPicked(next);
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteDocuments(chosen);
      setError(result.error);
      if (!result.error) {
        setPicked({});
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
            onChange={toggleAll}
            className="h-4 w-4 accent-primary disabled:opacity-40"
          />
          เลือกทั้งหมด
        </label>
        <span className="text-neutral-500">
          {hasSelection ? `เลือกแล้ว ${chosen.length} ใบ${lockedTypeName ? ` (${lockedTypeName})` : ""}${chosen.length !== chosenHere ? ` · ในหน้านี้ ${chosenHere}` : ""}` : "ยังไม่ได้เลือก"}
        </span>
        {hasSelection && (
          <button
            type="button"
            onClick={() => setPicked({})}
            className="text-primary underline-offset-2 hover:underline"
          >
            ยกเลิกการเลือก
          </button>
        )}

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
            // Once something is ticked, rows that cannot be added are greyed out (still openable).
            <li
              key={document.id}
              className={`flex items-center ${hasSelection && !selectable ? "bg-neutral-100 opacity-50" : ""}`}
            >
              {document.documentTypeId === null ? (
                // No type, so nothing to export: no checkbox, but the column stays aligned.
                <span className="mx-4 h-4 w-4 shrink-0" title={reason} aria-hidden="true" />
              ) : (
                <input
                  type="checkbox"
                  checked={document.id in picked}
                  disabled={!selectable}
                  onChange={() => toggle(document)}
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
                {/* The preview opens only from the thumbnail, not from the whole row. */}
                <span
                  className="shrink-0"
                  onMouseEnter={() => startHover(document)}
                  onMouseMove={moveHover}
                  onMouseLeave={stopHover}
                >
                  <Thumbnail document={document} />
                </span>
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
                {costs && (
                  <span className="w-24 shrink-0 text-right text-xs text-neutral-600" title="ค่าใช้จ่าย AI รวมของเอกสารนี้ (superadmin)">
                    {formatBaht(costs[document.id] ?? null)}
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
      {hovered && <HoverPreview document={hovered.document} x={hovered.x} y={hovered.y} />}
    </div>
  );
}
