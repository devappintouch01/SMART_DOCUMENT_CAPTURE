"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { isHeic, MAX_FILES_PER_BATCH } from "@/domain/upload-limits";
import { Select } from "@/components/select";
import { hashFile, prepareFile, uploadToSignedUrl } from "@/lib/browser-upload";
import { registerUploads, requestUploads } from "./actions";

type Props = { documentTypes: { id: string; name: string }[] };

type Entry = {
  key: string;
  file: File;
  mimeType: string;
  pageCount: number;
  // SHA-256 of the file bytes, to spot the same file picked twice in one round
  // (null when the browser cannot compute it).
  hash: string | null;
  // "ready" → waiting to upload; "failed" can be retried; "duplicate" is skipped
  // unless the person chooses to upload it anyway.
  status: "ready" | "uploading" | "done" | "failed" | "rejected" | "duplicate";
  // Why it counts as a duplicate (kept after "upload anyway" as a note).
  duplicateNote: string | null;
  progress: number;
  message: string | null;
};

const CONCURRENT_UPLOADS = 3;

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function UploadForm({ documentTypes }: Props) {
  // "auto" = ให้ AI เลือกประเภทเอกสารให้ (AUTO_CLASSIFY in the Document service).
  const [documentTypeId, setDocumentTypeId] = useState("auto");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // A second click before the first upload has re-rendered must not start another round.
  const uploading = useRef(false);
  const router = useRouter();

  const patch = (key: string, changes: Partial<Entry>) =>
    setEntries((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...changes } : entry)),
    );

  async function addFiles(fileList: FileList | File[]) {
    setNotice(null);
    const incoming = Array.from(fileList);
    const room =
      MAX_FILES_PER_BATCH - entries.filter((e) => e.status !== "rejected" && e.status !== "duplicate").length;
    if (incoming.length > room) {
      setNotice(`อัปโหลดได้ครั้งละไม่เกิน ${MAX_FILES_PER_BATCH} ไฟล์ จึงเพิ่มได้อีก ${Math.max(room, 0)} ไฟล์`);
    }

    const picked = incoming.slice(0, Math.max(room, 0));
    if (picked.some((f) => isHeic(f.name, f.type))) setConverting(true);

    const added: Entry[] = [];
    for (const original of picked) {
      const { file, mimeType, pageCount, problem } = await prepareFile(original);
      added.push({
        key: crypto.randomUUID(),
        file,
        mimeType,
        pageCount,
        hash: problem ? null : await hashFile(file),
        status: problem ? "rejected" : "ready",
        duplicateNote: null,
        progress: 0,
        message: problem,
      });
    }
    setConverting(false);

    // The same content already in this round's list (picked twice, or already
    // uploaded in this round) is skipped. Files stored by earlier rounds are not
    // checked: uploading one again on purpose is fine.
    const seen = new Map(entries.filter((e) => e.hash && e.status !== "rejected").map((e) => [e.hash as string, e.file.name]));
    for (const entry of added) {
      if (!entry.hash || entry.status === "rejected") continue;
      const inList = seen.get(entry.hash);
      if (inList) {
        entry.status = "duplicate";
        entry.duplicateNote = `ไฟล์นี้ซ้ำกับ ${inList} ที่เลือกไว้ในรอบนี้`;
      } else {
        seen.set(entry.hash, entry.file.name);
      }
    }
    setEntries((current) => [...current, ...added]);
  }

  async function upload() {
    const pending = entries.filter((e) => e.status === "ready" || e.status === "failed");
    if (pending.length === 0 || !documentTypeId || uploading.current) return;
    uploading.current = true;
    setBusy(true);
    setNotice(null);

    const requested = await requestUploads(
      pending.map((e) => ({
        fileName: e.file.name,
        mimeType: e.mimeType,
        sizeBytes: e.file.size,
        pageCount: e.pageCount,
      })),
    );
    if (!requested.ok) {
      setNotice(requested.error);
      uploading.current = false;
      setBusy(false);
      return;
    }

    const succeeded: { entry: Entry; storagePath: string }[] = [];
    let next = 0;
    async function worker() {
      while (next < pending.length) {
        const index = next++;
        const entry = pending[index];
        const target = requested.ok ? requested.targets[index] : undefined;
        if (!target) continue;
        patch(entry.key, { status: "uploading", progress: 0, message: null });
        try {
          await uploadToSignedUrl(target.signedUrl, entry.file, entry.mimeType, (fraction) =>
            patch(entry.key, { progress: fraction }),
          );
          succeeded.push({ entry, storagePath: target.storagePath });
          patch(entry.key, { status: "done", progress: 1 });
        } catch {
          patch(entry.key, { status: "failed", message: "อัปโหลดไม่สำเร็จ กดอัปโหลดอีกครั้งเพื่อลองใหม่" });
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENT_UPLOADS }, worker));

    if (succeeded.length > 0) {
      const registered = await registerUploads({
        documentTypeId,
        files: succeeded.map(({ entry, storagePath }) => ({
          storagePath,
          fileName: entry.file.name,
          mimeType: entry.mimeType,
          pageCount: entry.pageCount,
        })),
      });
      if (!registered.ok) {
        setNotice(registered.error);
        uploading.current = false;
        setBusy(false);
        return;
      }
      if (succeeded.length === pending.length) {
        router.push("/");
        return;
      }
      setNotice(`อัปโหลดสำเร็จ ${succeeded.length} ไฟล์ ที่เหลือยังไม่สำเร็จ`);
    }
    uploading.current = false;
    setBusy(false);
  }

  const readyCount = entries.filter((e) => e.status === "ready" || e.status === "failed").length;
  const duplicateCount = entries.filter((e) => e.status === "duplicate").length;
  const rejectedCount = entries.filter((e) => e.status === "rejected").length;
  const counted = entries.length - duplicateCount - rejectedCount;
  const doneCount = entries.filter((e) => e.status === "done").length;

  return (
    <div className="mt-6 space-y-5">
      <div className="max-w-sm text-sm">
        <span className="mb-1 block">ประเภทเอกสาร</span>
        <Select
          value={documentTypeId}
          onChange={setDocumentTypeId}
          disabled={busy}
          size="lg"
          block
          ariaLabel="ประเภทเอกสาร"
          options={[{ value: "auto", label: "ให้ AI เลือกประเภทเอกสารให้" }, ...documentTypes.map((t) => ({ value: t.id, label: t.name }))]}
        />
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void addFiles(event.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") input.current?.click();
        }}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-colors ${dragging ? "border-primary bg-primary-soft" : "border-black/20 bg-white hover:border-primary"
          }`}
      >
        <p className="font-medium">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
        <p className="mt-1 text-sm text-neutral-500">
          PDF, JPG, PNG, WebP, HEIC (จาก iPhone) · ไฟล์ละไม่เกิน 10 MB · PDF ไม่เกิน 10 หน้า · ครั้งละไม่เกิน{" "}
          {MAX_FILES_PER_BATCH} ไฟล์
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          className="hidden"
          onChange={(event) => {
            if (event.target.files) void addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {converting && (
        <p className="text-sm text-neutral-600">กำลังแปลงภาพ HEIC จาก iPhone เป็น JPG…</p>
      )}
      {notice && (
        <p role="alert" className="text-sm text-red-600">
          {notice}
        </p>
      )}

      {entries.length > 0 && (
        <p className="text-sm text-neutral-600" aria-live="polite">
          <span className="font-medium text-foreground">
            {counted}/{MAX_FILES_PER_BATCH}
          </span>{" "}
          ไฟล์ที่จะอัปโหลด
          {busy && counted > 0 && ` · อัปโหลดแล้ว ${doneCount}/${counted}`}
          {duplicateCount > 0 && <span className="text-amber-700"> · ซ้ำ {duplicateCount}</span>}
          {rejectedCount > 0 && <span className="text-red-600"> · ใช้ไม่ได้ {rejectedCount}</span>}
        </p>
      )}

      {entries.length > 0 && (
        <ul className="divide-y divide-black/10 rounded-xl border border-black/10 bg-white">
          {entries.map((entry) => (
            <li key={entry.key} className="flex items-center gap-4 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{entry.file.name}</p>
                <p className="text-neutral-500">
                  {formatSize(entry.file.size)}
                  {entry.mimeType === "application/pdf" && entry.status !== "rejected"
                    ? ` · ${entry.pageCount} หน้า`
                    : ""}
                </p>
                {entry.message && <p className="mt-0.5 text-red-600">{entry.message}</p>}
                {entry.duplicateNote && <p className="mt-0.5 text-amber-700">{entry.duplicateNote}</p>}
              </div>
              <div className="w-40 shrink-0 text-right">
                {entry.status === "uploading" && (
                  <div className="h-2 overflow-hidden rounded-full bg-black/10">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.round(entry.progress * 100)}%` }}
                    />
                  </div>
                )}
                {entry.status === "done" && <span className="text-green-700">อัปโหลดแล้ว</span>}
                {entry.status === "ready" && <span className="text-neutral-500">พร้อมอัปโหลด</span>}
                {entry.status === "duplicate" && (
                  <button
                    type="button"
                    disabled={busy || counted >= MAX_FILES_PER_BATCH}
                    onClick={() => patch(entry.key, { status: "ready" })}
                    className="rounded-md border border-amber-400 px-2 py-1 text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                  >
                    อัปโหลดซ้ำ
                  </button>
                )}
              </div>
              {!busy && entry.status !== "done" && (
                <button
                  type="button"
                  aria-label={`เอา ${entry.file.name} ออก`}
                  onClick={() => setEntries((current) => current.filter((e) => e.key !== entry.key))}
                  className="text-neutral-400 hover:text-red-600"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void upload()}
          disabled={busy || readyCount === 0}
          className="rounded-md bg-primary px-5 py-2 font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? `กำลังอัปโหลด… ${doneCount}/${counted}` : readyCount > 0 ? `อัปโหลด ${readyCount} ไฟล์` : "อัปโหลด"}
        </button>
        <Link href="/" className="text-sm text-neutral-500 hover:text-foreground">
          ไปที่รายการเอกสาร
        </Link>
      </div>
    </div>
  );
}
