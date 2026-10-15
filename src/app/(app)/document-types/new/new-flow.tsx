"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { readPageCount, uploadToSignedUrl } from "@/lib/browser-upload";
import { resolveMimeType, validateFileMeta } from "@/domain/upload-limits";
import type { FieldInput } from "@/server/ports";
import { requestUploads } from "../../upload/actions";
import { OriginalViewer } from "../../documents/[id]/original-viewer";
import { createDocumentType, proposeDocumentType } from "../actions";
import { DocumentTypeEditor } from "../document-type-editor";

type Sample = { storagePath: string; fileName: string; mimeType: string; pageCount: number };

type Stage =
  | { kind: "pick" }
  | { kind: "working"; message: string }
  | { kind: "edit"; sample: Sample | null; previewUrl: string | null; name: string; fields: FieldInput[]; note: string | null };

// 1) drop a Sample Document, 2) the AI drafts Fields, 3) the user edits and
// saves; the Sample Document then becomes the first Document of the new type.
export function NewDocumentTypeFlow({ takenNames }: { takenNames: string[] }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function start(file: File) {
    setError(null);
    const mimeType = resolveMimeType(file.name, file.type);
    setStage({ kind: "working", message: "กำลังตรวจไฟล์…" });

    let pageCount = 1;
    try {
      pageCount = await readPageCount(file, mimeType);
    } catch {
      setStage({ kind: "pick" });
      setError("ไฟล์ PDF เสียหรืออ่านไม่ได้");
      return;
    }
    const problem = validateFileMeta({ fileName: file.name, mimeType, sizeBytes: file.size, pageCount });
    if (problem) {
      setStage({ kind: "pick" });
      setError(problem);
      return;
    }

    setStage({ kind: "working", message: "กำลังอัปโหลดเอกสารตัวอย่าง…" });
    const requested = await requestUploads([{ fileName: file.name, mimeType, sizeBytes: file.size, pageCount }]);
    if (!requested.ok) {
      setStage({ kind: "pick" });
      setError(requested.error);
      return;
    }
    const target = requested.targets[0];
    try {
      await uploadToSignedUrl(target.signedUrl, file, mimeType, () => {});
    } catch {
      setStage({ kind: "pick" });
      setError("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
      return;
    }

    const sample: Sample = { storagePath: target.storagePath, fileName: file.name, mimeType, pageCount };
    setStage({ kind: "working", message: "AI กำลังอ่านเอกสารตัวอย่างและร่างรายการช่อง (ประมาณ 20–40 วินาที)…" });
    const proposed = await proposeDocumentType({ storagePath: sample.storagePath, mimeType });
    if (proposed.ok) {
      setStage({
        kind: "edit",
        sample,
        previewUrl: proposed.previewUrl,
        name: proposed.proposal.name,
        fields: proposed.proposal.fields,
        note: null,
      });
    } else {
      // The file is already stored, so the user can still fill the Fields in by hand.
      setStage({
        kind: "edit",
        sample,
        previewUrl: null,
        name: "",
        fields: [],
        note: `AI ร่างช่องให้ไม่สำเร็จ (${proposed.error}) กรอกช่องเองได้เลย`,
      });
    }
  }

  if (stage.kind === "working") {
    return (
      <div className="mt-6 rounded-xl border border-black/10 bg-white p-12 text-center">
        <p className="font-medium">{stage.message}</p>
        <p className="mt-1 text-sm text-neutral-500">อย่าเพิ่งปิดหน้านี้</p>
      </div>
    );
  }

  if (stage.kind === "edit") {
    const { sample } = stage;
    return (
      <div className="mt-4">
        {stage.note && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{stage.note}</p>
        )}
        <p className="mb-4 text-sm text-neutral-500">
          {sample
            ? "AI ร่างช่องจากเอกสารตัวอย่างให้แล้ว แก้ชื่อ ชนิด เพิ่ม ลบ หรือเรียงลำดับได้ แล้วกดบันทึก ระบบจะอ่านเอกสารตัวอย่างนี้ให้ทันที"
            : "ตั้งชื่อและเพิ่มช่องที่ต้องการ แล้วกดบันทึก"}
        </p>
        <div className={sample ? "grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""}>
          {sample && <OriginalViewer url={stage.previewUrl} mimeType={sample.mimeType} />}
          <DocumentTypeEditor
            initialName={stage.name}
            initialFields={stage.fields}
            takenNames={takenNames}
            submitLabel={sample ? "บันทึกและอ่านเอกสารตัวอย่าง" : "บันทึกประเภทเอกสาร"}
            onSubmit={async (name, fields) => {
              const result = await createDocumentType({ name, fields, sample });
              if (!result.ok) return { error: result.error };
              router.push(result.documentId ? `/documents/${result.documentId}` : "/document-types");
              return { error: null };
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-neutral-500">
        อัปโหลดเอกสารตัวอย่าง 1 ใบ ให้ AI ร่างรายการช่องให้ จากนั้นแก้ให้ตรงกับที่ต้องการ ใช้ได้กับเอกสารจากทุกร้านที่เป็นประเภทเดียวกัน
      </p>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void start(file);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") input.current?.click();
        }}
        className={`mt-4 cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
          dragging ? "border-primary bg-primary-soft" : "border-black/20 bg-white hover:border-primary"
        }`}
      >
        <p className="font-medium">ลากเอกสารตัวอย่างมาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
        <p className="mt-1 text-sm text-neutral-500">PDF, JPG, PNG, WebP · ไฟล์ละไม่เกิน 10 MB · PDF ไม่เกิน 10 หน้า</p>
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void start(file);
            event.target.value = "";
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => setStage({ kind: "edit", sample: null, previewUrl: null, name: "", fields: [], note: null })}
        className="mt-4 text-sm text-neutral-500 hover:text-foreground hover:underline"
      >
        สร้างโดยไม่มีเอกสารตัวอย่าง (กรอกช่องเอง)
      </button>
    </div>
  );
}
