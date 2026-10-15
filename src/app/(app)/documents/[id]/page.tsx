import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ExtractedRow, ExtractedValue } from "@/domain/extracted-data";
import { formatValue } from "@/domain/format";
import type { Field } from "@/domain/types";
import { getDocumentService } from "@/server/container";
import { AutoRefresh } from "../../auto-refresh";
import { StatusBadge } from "../../status-badge";
import { OriginalViewer } from "./original-viewer";
import { RerunPanel } from "./rerun-panel";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "รายละเอียดเอกสาร" };
export const dynamic = "force-dynamic";
// The retry action starts an Extraction in the background.
export const maxDuration = 300;

function Value({ field, entry }: { field: Field; entry: ExtractedValue | undefined }) {
  const shown = formatValue(field.kind, entry?.value ?? null);
  const flagged = entry?.flag?.status === "open";
  return (
    <span
      title={flagged ? entry?.flag?.reason : undefined}
      className={flagged ? "rounded bg-amber-100 px-1" : undefined}
    >
      {shown || <span className="text-neutral-400">—</span>}
    </span>
  );
}

export default async function DocumentDetailPage({ params }: PageProps<"/documents/[id]">) {
  const { id } = await params;
  const service = getDocumentService();
  const [document, documentTypes] = await Promise.all([
    service.getDocument(id),
    service.listDocumentTypes(),
  ]);
  if (!document) notFound();

  const fields = document.documentType?.fields ?? [];
  const headerFields = fields.filter((f) => f.scope === "header");
  const lineFields = fields.filter((f) => f.scope === "line_item");
  const data = document.extractedData;
  const working = document.status === "queued" || document.status === "extracting";

  return (
    <section>
      <AutoRefresh active={working} />
      <Link href="/" className="text-sm text-neutral-500 hover:text-foreground">
        ← รายการเอกสาร
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold break-all">{document.fileName}</h1>
        <StatusBadge status={document.status} reason={document.failureReason} />
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        {document.documentType?.name ?? "ยังไม่ระบุประเภท"}
        {document.pageCount ? ` · ${document.pageCount} หน้า` : ""}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <OriginalViewer url={document.fileUrl} mimeType={document.mimeType} />

        <div className="space-y-6">
          {!working && (
            <RerunPanel
              documentId={document.id}
              currentTypeId={document.documentTypeId}
              documentTypes={documentTypes.map((t) => ({ id: t.id, name: t.name }))}
            />
          )}
          {document.status === "failed" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              อ่านเอกสารไม่สำเร็จ: {document.failureReason}
              <RetryButton documentId={document.id} />
            </div>
          )}
          {working && (
            <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              AI กำลังอ่านเอกสาร หน้านี้จะอัปเดตเองเมื่อเสร็จ
            </p>
          )}

          {data && (
            <>
              <div className="rounded-xl border border-black/10 bg-white">
                <h2 className="border-b border-black/10 px-4 py-3 font-medium">ข้อมูลหลัก</h2>
                <dl className="divide-y divide-black/5">
                  {headerFields.map((field) => (
                    <div key={field.id} className="grid grid-cols-5 gap-3 px-4 py-2 text-sm">
                      <dt className="col-span-2 text-neutral-500">{field.name}</dt>
                      <dd className="col-span-3">
                        <Value field={field} entry={data.header[field.id]} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {lineFields.length > 0 && (
                <div className="rounded-xl border border-black/10 bg-white">
                  <h2 className="border-b border-black/10 px-4 py-3 font-medium">
                    รายการ ({data.lineItems.length})
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-neutral-500">
                        <tr>
                          {lineFields.map((field) => (
                            <th key={field.id} className="px-3 py-2 font-normal whitespace-nowrap">
                              {field.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {data.lineItems.map((row: ExtractedRow, index) => (
                          <tr key={index}>
                            {lineFields.map((field) => (
                              <td
                                key={field.id}
                                className={`px-3 py-2 ${field.kind === "amount" || field.kind === "number" ? "text-right whitespace-nowrap tabular-nums" : "min-w-32"}`}
                              >
                                <Value field={field} entry={row[field.id]} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
