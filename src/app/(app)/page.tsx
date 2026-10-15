import type { Metadata } from "next";
import Link from "next/link";
import type { DocumentListItem } from "@/domain/types";
import { getDocumentService } from "@/server/container";
import { AutoRefresh } from "./auto-refresh";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "รายการเอกสาร" };
export const dynamic = "force-dynamic";

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

export default async function ResultListPage() {
  const documents = await getDocumentService().listDocuments();
  const working = documents.some((d) => d.status === "queued" || d.status === "extracting");

  return (
    <section>
      <AutoRefresh active={working} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">รายการเอกสาร</h1>
        <Link
          href="/upload"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          อัปโหลดเอกสาร
        </Link>
      </div>

      {documents.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-black/15 bg-white p-12 text-center">
          <p className="font-medium">ยังไม่มีเอกสาร</p>
          <p className="mt-1 text-sm text-neutral-500">
            อัปโหลดใบเสร็จ ใบกำกับภาษี หรือใบเบิกสินค้า แล้ว AI จะถอดข้อมูลให้
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-black/10 rounded-xl border border-black/10 bg-white">
          {documents.map((document) => (
            <li key={document.id}>
              <Link
                href={`/documents/${document.id}`}
                className="flex items-center gap-4 px-4 py-3 text-sm hover:bg-neutral-50"
              >
              <Thumbnail document={document} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{document.fileName}</p>
                <p className="text-neutral-500">{document.documentTypeName ?? "ยังไม่ระบุประเภท"}</p>
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
      )}
    </section>
  );
}
