"use server";

import { revalidatePath } from "next/cache";
import { SEED_DOCUMENT_TYPES } from "@/domain/seeds";
import { getDocumentService } from "@/server/container";
import { loadDemoFixtures } from "@/server/demo-fixtures";
import { UserFacingError } from "@/server/document-service";

export type ResetResult = { ok: true; loaded: number } | { ok: false; error: string };

export async function resetDemoData(confirmation: string): Promise<ResetResult> {
  try {
    const result = await getDocumentService().resetDemoData({
      confirmation,
      seedTypes: SEED_DOCUMENT_TYPES,
      fixtures: await loadDemoFixtures(),
    });
    revalidatePath("/", "layout");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof UserFacingError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "รีเซ็ตไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
}
