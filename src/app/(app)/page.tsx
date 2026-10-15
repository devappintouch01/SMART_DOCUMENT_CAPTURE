import type { Metadata } from "next";
import { getDocumentService } from "@/server/container";

export const metadata: Metadata = { title: "รายการเอกสาร" };
export const dynamic = "force-dynamic";

export default async function ResultListPage() {
  const documents = await getDocumentService().listDocuments();

  return (
    <section>
      <h1 className="text-2xl font-semibold">รายการเอกสาร</h1>

      {documents.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-black/15 p-12 text-center dark:border-white/15">
          <p className="font-medium">ยังไม่มีเอกสาร</p>
          <p className="mt-1 text-sm text-neutral-500">
            อัปโหลดใบเสร็จ ใบกำกับภาษี หรือใบเบิกสินค้า แล้ว AI จะถอดข้อมูลให้
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-black/10 rounded-xl border border-black/10 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-neutral-900">
          {documents.map((document) => (
            <li key={document.id} className="flex justify-between px-4 py-3 text-sm">
              <span>{document.fileName}</span>
              <span className="text-neutral-500">{document.documentTypeName ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
