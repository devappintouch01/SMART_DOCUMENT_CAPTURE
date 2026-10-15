import type { Metadata } from "next";
import { getDocumentService } from "@/server/container";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "อัปโหลดเอกสาร" };
export const dynamic = "force-dynamic";
// Server actions on this page start Extractions in the background.
export const maxDuration = 300;

export default async function UploadPage() {
  const documentTypes = await getDocumentService().listDocumentTypes();

  return (
    <section>
      <h1 className="text-2xl font-semibold">อัปโหลดเอกสาร</h1>
      <p className="mt-1 text-sm text-neutral-500">
        ลากไฟล์ PDF หรือรูปภาพมาวางได้หลายไฟล์พร้อมกัน ให้ AI ตรวจประเภทให้ หรือเลือกประเภทเอง
      </p>
      <UploadForm
        documentTypes={documentTypes.map((t) => ({ id: t.id, name: t.name }))}
      />
    </section>
  );
}
