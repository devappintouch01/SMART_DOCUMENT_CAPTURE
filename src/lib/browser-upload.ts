import { heicToJpegName, isHeic, resolveMimeType, validateFileMeta } from "@/domain/upload-limits";

// Browser-only helpers for the upload page.

// iPhone HEIC/HEIF photo → JPEG, entirely in the browser. The converter is
// loaded on demand: it is large and most uploads never need it.
export async function convertHeicToJpeg(file: File): Promise<File> {
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!blob) throw new Error("empty conversion result");
  return new File([blob], heicToJpegName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
}

// SHA-256 of the file bytes as hex, or null where the browser has no Web Crypto
// (it needs https or localhost).
export async function hashFile(file: File): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function readPageCount(file: File, mimeType: string): Promise<number> {
  if (mimeType !== "application/pdf") return 1;

  // pdf-lib is loaded on demand so it never weighs on the other pages.
  const { PDFDocument } = await import("pdf-lib");
  const document = await PDFDocument.load(await file.arrayBuffer(), {
    ignoreEncryption: true,
  });
  return document.getPageCount();
}

export type PreparedFile = {
  // The file to upload: the converted JPEG for a HEIC photo, else the original.
  file: File;
  mimeType: string;
  pageCount: number;
  // Thai message when the file cannot be uploaded, else null.
  problem: string | null;
};

// Everything the browser does to a picked file before upload: convert HEIC,
// work out its type and page count, and check the limits.
export async function prepareFile(original: File): Promise<PreparedFile> {
  let file = original;
  if (isHeic(file.name, file.type)) {
    try {
      file = await convertHeicToJpeg(file);
    } catch {
      return {
        file: original,
        mimeType: resolveMimeType(original.name, original.type),
        pageCount: 1,
        problem: "แปลงไฟล์ HEIC เป็น JPG ไม่สำเร็จ ลองถ่ายภาพใหม่ หรือแปลงเป็น JPG ก่อนอัปโหลด",
      };
    }
  }

  const mimeType = resolveMimeType(file.name, file.type);
  let pageCount = 1;
  try {
    pageCount = await readPageCount(file, mimeType);
  } catch {
    return { file, mimeType, pageCount, problem: "ไฟล์ PDF เสียหรืออ่านไม่ได้" };
  }
  const problem = validateFileMeta({ fileName: file.name, mimeType, sizeBytes: file.size, pageCount });
  return { file, mimeType, pageCount, problem };
}

// PUTs the file straight to Supabase Storage. XMLHttpRequest is used because
// fetch cannot report upload progress.
export function uploadToSignedUrl(
  signedUrl: string,
  file: File,
  mimeType: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", signedUrl);
    request.setRequestHeader("content-type", mimeType);
    request.setRequestHeader("cache-control", "max-age=3600");
    request.setRequestHeader("x-upsert", "false");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKey) request.setRequestHeader("apikey", anonKey);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`upload failed (${request.status})`));
    };
    request.onerror = () => reject(new Error("network error"));
    request.send(file);
  });
}
