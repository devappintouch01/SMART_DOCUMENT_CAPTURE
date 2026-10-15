"use server";

import { after } from "next/server";
import { getDocumentService } from "@/server/container";
import { UserFacingError, type RegisteredFile } from "@/server/document-service";
import type { DocumentTypeProposal, FieldInput } from "@/server/ports";

function describe(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  console.error(error);
  return "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง";
}

export type ProposeResult =
  | { ok: true; proposal: DocumentTypeProposal; previewUrl: string | null }
  | { ok: false; error: string };

export async function proposeDocumentType(input: {
  storagePath: string;
  mimeType: string;
}): Promise<ProposeResult> {
  try {
    const service = getDocumentService();
    const proposal = await service.proposeDocumentType(input);
    return { ok: true, proposal, previewUrl: await service.fileUrl(input.storagePath) };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

export type CreateResult =
  | { ok: true; documentTypeId: string; documentId: string | null }
  | { ok: false; error: string };

export async function createDocumentType(input: {
  name: string;
  fields: FieldInput[];
  sample: RegisteredFile | null;
}): Promise<CreateResult> {
  try {
    const service = getDocumentService();
    const created = await service.createDocumentType(input);
    // The Sample Document starts reading right away.
    if (created.documentId) after(() => service.processQueue());
    return { ok: true, ...created };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}
