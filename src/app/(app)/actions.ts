"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDocumentService } from "@/server/container";
import { UserFacingError } from "@/server/document-service";

type Result = { error: string | null };

function failure(error: unknown): Result {
  if (error instanceof UserFacingError) return { error: error.message };
  console.error(error);
  return { error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง" };
}

export async function deleteDocuments(ids: string[]): Promise<Result> {
  try {
    await getDocumentService().deleteDocuments(ids);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/");
  return { error: null };
}

// From the detail page: delete this Document, then go back to the list.
export async function deleteDocumentAndReturn(id: string): Promise<Result> {
  try {
    await getDocumentService().deleteDocuments([id]);
  } catch (error) {
    return failure(error);
  }
  redirect("/");
}
