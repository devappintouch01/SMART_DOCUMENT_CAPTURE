import type { Metadata } from "next";
import { getDocumentService } from "@/server/container";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "รีเซ็ตข้อมูล demo" };
export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const service = getDocumentService();
  const [documents, types] = await Promise.all([service.listDocuments(), service.listDocumentTypesWithCounts()]);
  const custom = types.filter((t) => !t.isSeed);

  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-semibold">รีเซ็ตข้อมูล demo</h1>
      <p className="mt-1 text-sm text-neutral-500">
        ใช้ก่อนนำเสนอ เพื่อกลับไปสถานะสะอาด มีเอกสารตัวอย่างที่อ่านเสร็จแล้วรออยู่ และไม่เรียก AI เลย (ทำเสร็จทันที ไม่เสียค่าใช้จ่าย)
      </p>

      <div className="mt-6 rounded-xl border border-red-200 bg-white p-5">
        <h2 className="font-medium text-red-800">สิ่งที่จะถูกลบ ย้อนกลับไม่ได้</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>
            เอกสารทั้งหมด <b>{documents.length}</b> ใบ พร้อมไฟล์ต้นฉบับ และค่าที่แก้ไขไว้
          </li>
          <li>
            ประเภทเอกสารที่สร้างเพิ่มเอง <b>{custom.length}</b> ประเภท
            {custom.length > 0 && <span className="text-neutral-500"> ({custom.map((t) => t.name).join(", ")})</span>}
          </li>
          <li>การแก้ช่องของประเภทเริ่มต้น 3 ประเภท จะกลับเป็นค่าเดิม</li>
        </ul>
        <h2 className="mt-4 font-medium">สิ่งที่จะได้</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>ประเภทเริ่มต้น 3 ประเภท: ใบเสร็จรับเงิน ใบกำกับภาษี ใบเบิกสินค้า</li>
          <li>เอกสารตัวอย่างปลอม 6 ใบที่อ่านเสร็จแล้ว (มีลายมือ 2 ใบ มีช่องที่ AI ไม่มั่นใจ และมีใบที่รวมใบกำกับภาษี/ใบเสร็จ)</li>
        </ul>
        <ResetForm />
      </div>
    </section>
  );
}
