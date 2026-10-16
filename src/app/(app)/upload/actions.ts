"use server";

import { after } from "next/server";
import type { FileMeta } from "@/domain/upload-limits";
import { getDocumentService } from "@/server/container";
import { UserFacingError, type RegisteredFile } from "@/server/document-service";

export type RequestUploadsResult =
  | { ok: true; targets: { storagePath: string; signedUrl: string }[] }
  | { ok: false; error: string };

export type RegisterUploadsResult =
  | { ok: true; documentIds: string[] }
  | { ok: false; error: string };

function describe(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  console.error(error);
  return "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง";
}

export async function requestUploads(files: FileMeta[]): Promise<RequestUploadsResult> {
  try {
    return { ok: true, targets: await getDocumentService().requestUploads(files) };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

// Which picked files (by SHA-256) are already stored; the page marks them as duplicates.
export async function findDuplicates(
  hashes: string[],
): Promise<Record<string, { id: string; fileName: string }>> {
  try {
    return await getDocumentService().findDuplicates(hashes);
  } catch (error) {
    console.error(error);
    // Duplicate detection is a convenience; never block uploading because of it.
    return {};
  }
}

export async function registerUploads(input: {
  documentTypeId: string;
  files: RegisteredFile[];
}): Promise<RegisterUploadsResult> {
  try {
    const service = getDocumentService();
    const result = await service.registerUploads(input);
    // Start reading right away; the result list's polling picks up anything
    // this run doesn't finish.
    after(() => service.processQueue());
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}
