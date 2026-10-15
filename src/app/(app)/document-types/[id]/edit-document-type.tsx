"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FieldInput } from "@/server/ports";
import { deleteDocumentType, updateDocumentType } from "../actions";
import { DocumentTypeEditor } from "../document-type-editor";

type Props = {
  documentType: { id: string; name: string; documentCount: number; fields: FieldInput[] };
  takenNames: string[];
};

export function EditDocumentType({ documentType, takenNames }: Props) {
  const router = useRouter();
  const { id, documentCount } = documentType;

  // Warn only when saving would change Documents that already exist.
  function confirmBeforeSave(_name: string, fields: FieldInput[]): string | null {
    if (documentCount === 0) return null;
    const keptIds = new Set(fields.flatMap((f) => (f.id ? [f.id] : [])));
    const removed = documentType.fields.filter((f) => f.id && !keptIds.has(f.id));
    const retyped = fields.filter((f) => {
      const before = documentType.fields.find((x) => x.id === f.id);
      return before && before.kind !== f.kind;
    });
    const lines: string[] = [];
    if (removed.length > 0) {
      lines.push(
        `ลบช่อง ${removed.map((f) => `"${f.name}"`).join(", ")} ค่าที่อ่านไว้ในช่องนี้จะถูกลบจากเอกสารเดิม ${documentCount} ใบ และกู้คืนไม่ได้`,
      );
    }
    if (retyped.length > 0) {
      lines.push(
        `เปลี่ยนชนิดช่อง ${retyped.map((f) => `"${f.name}"`).join(", ")} ค่าที่อ่านไว้จะถูกอ่านใหม่ตามชนิดใหม่ ค่าที่ไม่เข้ากับชนิดใหม่จะกลายเป็นว่าง`,
      );
    }
    return lines.length > 0 ? lines.join("\n") : null;
  }

  // Kept here, not in the editor: the editor is rebuilt after every save so new
  // Fields pick up their ids, and would take its own message with it.
  const [saved, setSaved] = useState(false);

  return (
    <div className="mt-6 space-y-8">
      <div className="space-y-4">
        {saved && (
          <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            บันทึกแล้ว
          </p>
        )}
        <DocumentTypeEditor
          key={JSON.stringify([documentType.name, documentType.fields])}
          initialName={documentType.name}
          initialFields={documentType.fields}
          takenNames={takenNames}
          submitLabel="บันทึกการแก้ไข"
          confirmBeforeSave={confirmBeforeSave}
          onSubmit={async (name, fields) => {
            setSaved(false);
            const result = await updateDocumentType(id, { name, fields });
            if (result.error) return { error: result.error };
            setSaved(true);
            router.refresh();
            return { error: null, stay: true };
          }}
        />
      </div>
      <DeleteTypeSection id={id} documentCount={documentCount} />
    </div>
  );
}

function DeleteTypeSection({ id, documentCount }: { id: string; documentCount: number }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-red-200 bg-white p-4 text-sm">
      <h2 className="font-medium text-red-800">ลบประเภทเอกสารนี้</h2>
      {documentCount > 0 ? (
        <p className="mt-1 text-neutral-600">
          ลบไม่ได้ เพราะยังมีเอกสาร {documentCount} ใบใช้ประเภทนี้อยู่{" "}
          <Link href={`/?type=${id}`} className="text-primary hover:underline">
            ดูเอกสารเหล่านั้น
          </Link>{" "}
          แล้วลบ หรือเปลี่ยนประเภทของเอกสารก่อน
        </p>
      ) : !confirming ? (
        <div className="mt-2">
          <p className="text-neutral-600">ยังไม่มีเอกสารใช้ประเภทนี้ ลบได้</p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50"
          >
            ลบประเภทเอกสาร
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-red-800">
          ลบประเภทนี้พร้อมรายการช่อง? ย้อนกลับไม่ได้
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteDocumentType(id);
                if (result.error) setError(result.error);
              })
            }
            className="rounded-md bg-red-700 px-3 py-1 font-medium text-white hover:bg-red-800 disabled:opacity-60"
          >
            {pending ? "กำลังลบ…" : "ยืนยันลบ"}
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="px-2 py-1">
            ยกเลิก
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </div>
  );
}
