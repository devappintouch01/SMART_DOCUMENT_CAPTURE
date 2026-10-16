"use server";

import { revalidatePath } from "next/cache";
import { getRole } from "@/lib/session";
import { getDocumentService } from "@/server/container";
import { UserFacingError } from "@/server/document-service";

export type SaveModelResult = { error: string | null };

// Superadmin only. The page hides the control from everyone else, but a server
// action can be called directly, so the role is checked here as well.
export async function saveExtractionModel(modelId: string): Promise<SaveModelResult> {
  if ((await getRole()) !== "superadmin") return { error: "เฉพาะ superadmin เท่านั้น" };
  try {
    await getDocumentService().setExtractionModel(modelId);
  } catch (error) {
    if (error instanceof UserFacingError) return { error: error.message };
    console.error(error);
    return { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
  revalidatePath("/ai-dashboard");
  return { error: null };
}
