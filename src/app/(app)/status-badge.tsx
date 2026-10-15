import type { ExtractionStatus } from "@/domain/types";

const LABELS: Record<ExtractionStatus, { text: string; className: string }> = {
  queued: { text: "รอคิว", className: "bg-neutral-100 text-neutral-700" },
  extracting: { text: "กำลังอ่าน", className: "bg-blue-100 text-blue-800" },
  done: { text: "เสร็จ", className: "bg-green-100 text-green-800" },
  failed: { text: "ล้มเหลว", className: "bg-red-100 text-red-800" },
};

export function StatusBadge({
  status,
  reason,
}: {
  status: ExtractionStatus;
  reason?: string | null;
}) {
  const label = LABELS[status];
  return (
    <span
      title={reason ?? undefined}
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${label.className}`}
    >
      {label.text}
    </span>
  );
}
