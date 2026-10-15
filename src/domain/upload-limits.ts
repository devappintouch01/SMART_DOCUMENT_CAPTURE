// Upload limits (spec: Limits). The browser checks these first and the
// Document service checks them again.

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;
export const MAX_FILES_PER_BATCH = 20;

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type FileMeta = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
};

const mimeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Some browsers report an empty type; fall back to the file extension.
export function resolveMimeType(fileName: string, reportedType: string): string {
  if (reportedType) return reportedType;
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return mimeByExtension[extension] ?? "";
}

export function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

// Returns a Thai message for the first problem, or null when the file is fine.
export function validateFileMeta(meta: FileMeta): string | null {
  if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(meta.mimeType)) {
    return "รองรับเฉพาะไฟล์ PDF, JPG, PNG และ WebP";
  }
  if (meta.sizeBytes > MAX_FILE_BYTES) {
    return "ไฟล์ใหญ่เกิน 10 MB";
  }
  if (meta.sizeBytes <= 0) {
    return "ไฟล์ว่างเปล่า";
  }
  if (meta.mimeType === "application/pdf" && meta.pageCount > MAX_PDF_PAGES) {
    return `PDF ยาวเกิน ${MAX_PDF_PAGES} หน้า`;
  }
  return null;
}

export function validateBatchSize(count: number): string | null {
  if (count === 0) return "ยังไม่ได้เลือกไฟล์";
  if (count > MAX_FILES_PER_BATCH) {
    return `อัปโหลดได้ครั้งละไม่เกิน ${MAX_FILES_PER_BATCH} ไฟล์`;
  }
  return null;
}
