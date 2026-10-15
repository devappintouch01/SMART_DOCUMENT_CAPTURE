import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DocumentSummary, ExtractionStatus } from "@/domain/types";
import type { Store } from "./ports";

type DocumentRow = {
  id: string;
  file_name: string;
  mime_type: string;
  document_type_id: string | null;
  status: ExtractionStatus;
  failure_reason: string | null;
  uploaded_at: string;
  document_types: { name: string } | null;
};

export class SupabaseStore implements Store {
  constructor(private readonly db: SupabaseClient) {}

  static fromEnv(): SupabaseStore {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }
    return new SupabaseStore(
      createClient(url, key, { auth: { persistSession: false } }),
    );
  }

  async listDocuments(): Promise<DocumentSummary[]> {
    const { data, error } = await this.db
      .from("documents")
      .select(
        "id, file_name, mime_type, document_type_id, status, failure_reason, uploaded_at, document_types!documents_document_type_id_fkey(name)",
      )
      .order("uploaded_at", { ascending: false })
      .returns<DocumentRow[]>();
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      documentTypeId: row.document_type_id,
      documentTypeName: row.document_types?.name ?? null,
      status: row.status,
      failureReason: row.failure_reason,
      // Review Flags arrive with ticket 06.
      openReviewFlagCount: 0,
      uploadedAt: new Date(row.uploaded_at),
    }));
  }
}
