"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDocumentService } from "@/server/container";
import { UserFacingError } from "@/server/document-service";

export async function retryExtraction(id: string): Promise<{ error: string | null }> {
  try {
    const service = getDocumentService();
    await service.retryExtraction(id);
    after(() => service.processQueue());
  } catch (error) {
    if (error instanceof UserFacingError) return { error: error.message };
    console.error(error);
    return { error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง" };
  }
  revalidatePath(`/documents/${id}`);
  return { error: null };
}

export async function rerunExtraction(
  id: string,
  documentTypeId: string,
): Promise<{ error: string | null }> {
  try {
    const service = getDocumentService();
    await service.rerunExtraction(id, documentTypeId);
    after(() => service.processQueue());
  } catch (error) {
    if (error instanceof UserFacingError) return { error: error.message };
    console.error(error);
    return { error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง" };
  }
  revalidatePath(`/documents/${id}`);
  return { error: null };
}
