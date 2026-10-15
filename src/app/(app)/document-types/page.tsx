import type { Metadata } from "next";
import Link from "next/link";
import { getDocumentService } from "@/server/container";

export const metadata: Metadata = { title: "ประเภทเอกสาร" };
export const dynamic = "force-dynamic";

export default async function DocumentTypesPage() {
  const types = await getDocumentService().listDocumentTypesWithCounts();

  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ประเภทเอกสาร</h1>
        <Link
          href="/document-types/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          สร้างประเภทใหม่
        </Link>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        แต่ละประเภทคือรายการช่องที่อยากได้จากเอกสาร ไม่ผูกกับหน้าตาหรือตำแหน่งบนกระดาษ เอกสารจากร้านไหนก็ใช้ประเภทเดียวกันได้
      </p>

      <ul className="mt-6 divide-y divide-black/10 rounded-xl border border-black/10 bg-white">
        {types.map((type) => {
          const header = type.fields.filter((f) => f.scope === "header");
          const lines = type.fields.filter((f) => f.scope === "line_item");
          return (
            <li key={type.id} className="px-4 py-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <h2 className="font-medium">
                  <Link href={`/document-types/${type.id}`} className="hover:text-primary hover:underline">
                    {type.name}
                  </Link>
                </h2>
                {type.isSeed && (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">ตัวเริ่มต้น</span>
                )}
                <span className="text-sm text-neutral-500">
                  ข้อมูลหลัก {header.length} ช่อง · รายการ {lines.length} ช่อง
                </span>
                <Link
                  href={`/?type=${type.id}`}
                  className="ml-auto text-sm text-primary hover:underline"
                >
                  {type.documentCount} เอกสาร
                </Link>
              </div>
              <p className="mt-2 text-sm text-neutral-500">
                {header.map((f) => f.name).join(" · ")}
                {lines.length > 0 && (
                  <span className="text-neutral-400"> | ตาราง: {lines.map((f) => f.name).join(" · ")}</span>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
