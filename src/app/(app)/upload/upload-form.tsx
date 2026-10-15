"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  MAX_FILES_PER_BATCH,
  resolveMimeType,
  validateFileMeta,
} from "@/domain/upload-limits";
import { readPageCount, uploadToSignedUrl } from "@/lib/browser-upload";
import { registerUploads, requestUploads } from "./actions";

type Props = { documentTypes: { id: string; name: string }[] };

type Entry = {
  key: string;
  file: File;
  mimeType: string;
  pageCount: number;
  // "ready" → waiting to upload; "failed" can be retried
  status: "ready" | "uploading" | "done" | "failed" | "rejected";
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
  const [documentTypeId, setDocumentTypeId] = useState(documentTypes[0]?.id ?? "");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const patch = (key: string, changes: Partial<Entry>) =>
    setEntries((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...changes } : entry)),
    );

  async function addFiles(fileList: FileList | File[]) {
    setNotice(null);
    const incoming = Array.from(fileList);
    const room = MAX_FILES_PER_BATCH - entries.filter((e) => e.status !== "rejected").length;
    if (incoming.length > room) {
      setNotice(`อัปโหลดได้ครั้งละไม่เกิน ${MAX_FILES_PER_BATCH} ไฟล์ จึงเพิ่มได้อีก ${Math.max(room, 0)} ไฟล์`);
    }

    const added: Entry[] = [];
    for (const file of incoming.slice(0, Math.max(room, 0))) {
      const mimeType = resolveMimeType(file.name, file.type);
      let pageCount = 1;
      let message: string | null = null;
      try {
        pageCount = await readPageCount(file, mimeType);
      } catch {
        message = "ไฟล์ PDF เสียหรืออ่านไม่ได้";
      }
      message ??= validateFileMeta({
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
        pageCount,
      });
      added.push({
        key: crypto.randomUUID(),
        file,
        mimeType,
        pageCount,
        status: message ? "rejected" : "ready",
        progress: 0,
        message,
      });
    }
    setEntries((current) => [...current, ...added]);
  }

  async function upload() {
    const pending = entries.filter((e) => e.status === "ready" || e.status === "failed");
    if (pending.length === 0 || !documentTypeId) return;
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
        setBusy(false);
        return;
      }
      if (succeeded.length === pending.length) {
        router.push("/");
        return;
      }
      setNotice(`อัปโหลดสำเร็จ ${succeeded.length} ไฟล์ ที่เหลือยังไม่สำเร็จ`);
    }
    setBusy(false);
  }

  const readyCount = entries.filter((e) => e.status === "ready" || e.status === "failed").length;

  return (
    <div className="mt-6 space-y-5">
      <label className="block max-w-sm text-sm">
        ประเภทเอกสาร
        <select
          value={documentTypeId}
          onChange={(event) => setDocumentTypeId(event.target.value)}
          disabled={busy}
          className="mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2"
        >
          {documentTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>

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
        className={`cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
          dragging ? "border-blue-600 bg-blue-50" : "border-black/20 bg-white hover:border-blue-400"
        }`}
      >
        <p className="font-medium">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
        <p className="mt-1 text-sm text-neutral-500">
          PDF, JPG, PNG, WebP · ไฟล์ละไม่เกิน 10 MB · PDF ไม่เกิน 10 หน้า · ครั้งละไม่เกิน{" "}
          {MAX_FILES_PER_BATCH} ไฟล์
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            if (event.target.files) void addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {notice && (
        <p role="alert" className="text-sm text-red-600">
          {notice}
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
              </div>
              <div className="w-40 shrink-0 text-right">
                {entry.status === "uploading" && (
                  <div className="h-2 overflow-hidden rounded-full bg-black/10">
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{ width: `${Math.round(entry.progress * 100)}%` }}
                    />
                  </div>
                )}
                {entry.status === "done" && <span className="text-green-700">อัปโหลดแล้ว</span>}
                {entry.status === "ready" && <span className="text-neutral-500">พร้อมอัปโหลด</span>}
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
          className="rounded-md bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "กำลังอัปโหลด…" : readyCount > 0 ? `อัปโหลด ${readyCount} ไฟล์` : "อัปโหลด"}
        </button>
        <Link href="/" className="text-sm text-neutral-500 hover:text-foreground">
          ไปที่รายการเอกสาร
        </Link>
      </div>
    </div>
  );
}
