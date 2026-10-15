"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { CorrectionInput, FlagTarget } from "@/domain/corrections";
import { getDocumentService } from "@/server/container";
import { UserFacingError } from "@/server/document-service";

type Result = { error: string | null };

function failure(error: unknown): Result {
  if (error instanceof UserFacingError) return { error: error.message };
  console.error(error);
  return { error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง" };
}

export async function retryExtraction(id: string): Promise<Result> {
  try {
    const service = getDocumentService();
    await service.retryExtraction(id);
    after(() => service.processQueue());
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/documents/${id}`);
  return { error: null };
}

export async function rerunExtraction(id: string, documentTypeId: string): Promise<Result> {
  try {
    const service = getDocumentService();
    await service.rerunExtraction(id, documentTypeId);
    after(() => service.processQueue());
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/documents/${id}`);
  return { error: null };
}

export async function saveCorrections(id: string, input: CorrectionInput): Promise<Result> {
  try {
    await getDocumentService().saveCorrections(id, input);
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/documents/${id}`);
  return { error: null };
}

export async function confirmReviewFlags(id: string, targets: FlagTarget[]): Promise<Result> {
  try {
    await getDocumentService().confirmReviewFlags(id, targets);
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/documents/${id}`);
  return { error: null };
}
