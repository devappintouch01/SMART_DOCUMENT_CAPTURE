// Browser-only helpers for the upload page.

export async function readPageCount(file: File, mimeType: string): Promise<number> {
  if (mimeType !== "application/pdf") return 1;

  // pdf-lib is loaded on demand so it never weighs on the other pages.
  const { PDFDocument } = await import("pdf-lib");
  const document = await PDFDocument.load(await file.arrayBuffer(), {
    ignoreEncryption: true,
  });
  return document.getPageCount();
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
