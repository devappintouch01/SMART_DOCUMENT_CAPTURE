import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocumentService } from "@/server/container";
import { EditDocumentType } from "./edit-document-type";

export const metadata: Metadata = { title: "แก้ไขประเภทเอกสาร" };
export const dynamic = "force-dynamic";

export default async function EditDocumentTypePage({ params }: PageProps<"/document-types/[id]">) {
  const { id } = await params;
  const types = await getDocumentService().listDocumentTypesWithCounts();
  const type = types.find((t) => t.id === id);
  if (!type) notFound();

  return (
    <section>
      <Link href="/document-types" className="text-sm text-neutral-500 hover:text-foreground">
        ← ประเภทเอกสาร
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{type.name}</h1>
        {type.isSeed && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">ตัวเริ่มต้น</span>
        )}
        <Link href={`/?type=${type.id}`} className="text-sm text-primary hover:underline">
          {type.documentCount} เอกสาร
        </Link>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        เปลี่ยนชื่อช่องได้โดยค่าที่อ่านไว้ไม่หาย ช่องที่เพิ่มใหม่จะว่างในเอกสารเดิมจนกว่าจะกดอ่านใหม่ ส่วนช่องที่ลบจะลบค่าในเอกสารเดิมด้วย
      </p>

      <EditDocumentType
        documentType={{
          id: type.id,
          name: type.name,
          documentCount: type.documentCount,
          fields: type.fields.map((f) => ({
            id: f.id,
            scope: f.scope,
            name: f.name,
            kind: f.kind,
            description: f.description ?? "",
          })),
        }}
        takenNames={types.filter((t) => t.id !== id).map((t) => t.name)}
      />
    </section>
  );
}
