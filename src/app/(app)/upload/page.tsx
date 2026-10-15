import type { Metadata } from "next";
import { getDocumentService } from "@/server/container";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "อัปโหลดเอกสาร" };
export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const documentTypes = await getDocumentService().listDocumentTypes();

  return (
    <section>
      <h1 className="text-2xl font-semibold">อัปโหลดเอกสาร</h1>
      <p className="mt-1 text-sm text-neutral-500">
        เลือกประเภทเอกสาร แล้วลากไฟล์ PDF หรือรูปภาพมาวางได้หลายไฟล์พร้อมกัน
      </p>
      <UploadForm
        documentTypes={documentTypes.map((t) => ({ id: t.id, name: t.name }))}
      />
    </section>
  );
}
