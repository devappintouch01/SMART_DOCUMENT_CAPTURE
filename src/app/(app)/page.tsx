import type { Metadata } from "next";
import Link from "next/link";
import { pageSizeFromParam } from "@/domain/paging";
import type { DocumentFilter, ExtractionStatus } from "@/domain/types";
import { getRole } from "@/lib/session";
import { getDocumentService } from "@/server/container";
import { AutoRefresh } from "./auto-refresh";
import { ListFilters } from "./list-filters";
import { Pagination } from "./pagination";
import { ResultList } from "./result-list";

export const metadata: Metadata = { title: "รายการเอกสาร" };
export const dynamic = "force-dynamic";

const STATUSES: ExtractionStatus[] = ["queued", "extracting", "done", "failed"];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ResultListPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const status = first(params.status);
  const filter: DocumentFilter = {
    documentTypeId: first(params.type) || undefined,
    status: STATUSES.find((s) => s === status),
    search: first(params.q) || undefined,
  };
  const filtered = Boolean(filter.documentTypeId || filter.status || filter.search);

  const service = getDocumentService();
  const sizeParam = pageSizeFromParam(first(params.size));
  const [result, documentTypes] = await Promise.all([
    service.listDocumentsPage(filter, {
      page: Number(first(params.page)) || 1,
      pageSize: sizeParam === "all" ? "all" : Number(sizeParam),
    }),
    service.listDocumentTypes(),
  ]);
  const documents = result.items;
  // Cost and model per Document are for the superadmin only; nobody else's request reads them.
  const aiInfo =
    (await getRole()) === "superadmin" ? await service.getDocumentAiSummaries(documents.map((d) => d.id)) : undefined;
  const working = documents.some((d) => d.status === "queued" || d.status === "extracting");

  return (
    <section>
      <AutoRefresh active={working} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">รายการเอกสาร</h1>
        <Link
          href="/upload"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          อัปโหลดเอกสาร
        </Link>
      </div>

      <ListFilters documentTypes={documentTypes.map((t) => ({ id: t.id, name: t.name }))} />

      {result.total === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-black/15 bg-white p-12 text-center">
          <p className="font-medium">{filtered ? "ไม่พบเอกสารที่ตรงกับตัวกรอง" : "ยังไม่มีเอกสาร"}</p>
          <p className="mt-1 text-sm text-neutral-500">
            {filtered
              ? "ลองเปลี่ยนคำค้นหา หรือกด ล้างตัวกรอง"
              : "อัปโหลดใบเสร็จ ใบกำกับภาษี หรือใบเบิกสินค้า แล้ว AI จะถอดข้อมูลให้"}
          </p>
        </div>
      ) : (
        <>
          <ResultList
            // A new selection whenever the page, size or filter changes.
            key={JSON.stringify([result.page, sizeParam, filter])}
            documents={documents}
            offset={result.offset}
            aiInfo={aiInfo}
          />
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            size={sizeParam}
            offset={result.offset}
            shown={documents.length}
          />
        </>
      )}
    </section>
  );
}
