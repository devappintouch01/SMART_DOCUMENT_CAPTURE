import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { countOpenFlags, type ExtractedData } from "@/domain/extracted-data";
import type {
  DocumentSummary,
  DocumentType,
  ExtractionStatus,
  FieldKind,
  FieldScope,
} from "@/domain/types";
import type { ClaimedDocument, NewDocument, Store, UploadTarget } from "./ports";

const BUCKET = "documents";
const SIGNED_URL_SECONDS = 60 * 60;

const DOCUMENT_COLUMNS =
  "id, file_name, mime_type, storage_path, page_count, document_type_id, status, failure_reason, extracted_data, uploaded_at, document_types!documents_document_type_id_fkey(name)";

type DocumentRow = {
  id: string;
  file_name: string;
  mime_type: string;
  storage_path: string;
  page_count: number | null;
  document_type_id: string | null;
  status: ExtractionStatus;
  failure_reason: string | null;
  extracted_data: ExtractedData | null;
  uploaded_at: string;
  document_types: { name: string } | null;
};

type ClaimedRow = {
  id: string;
  storage_path: string;
  mime_type: string;
  document_type_id: string | null;
  attempt_count: number;
};

type DocumentTypeRow = {
  id: string;
  name: string;
  is_seed: boolean;
  fields: {
    id: string;
    scope: FieldScope;
    name: string;
    kind: FieldKind;
    description: string | null;
    position: number;
  }[];
};

function toSummary(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    documentTypeId: row.document_type_id,
    documentTypeName: row.document_types?.name ?? null,
    status: row.status,
    failureReason: row.failure_reason,
    openReviewFlagCount: countOpenFlags(row.extracted_data),
    uploadedAt: new Date(row.uploaded_at),
  };
}

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

  async listDocumentTypes(): Promise<DocumentType[]> {
    const { data, error } = await this.db
      .from("document_types")
      .select("id, name, is_seed, fields(id, scope, name, kind, description, position)")
      .order("created_at", { ascending: true })
      .returns<DocumentTypeRow[]>();
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      isSeed: row.is_seed,
      fields: [...row.fields]
        .sort((a, b) => a.position - b.position)
        .map((f) => ({
          id: f.id,
          scope: f.scope,
          name: f.name,
          kind: f.kind,
          description: f.description,
          position: f.position,
        })),
    }));
  }

  async listDocuments(): Promise<DocumentSummary[]> {
    const { data, error } = await this.db
      .from("documents")
      .select(DOCUMENT_COLUMNS)
      .order("uploaded_at", { ascending: false })
      .returns<DocumentRow[]>();
    if (error) throw error;
    return data.map(toSummary);
  }

  async getDocument(id: string) {
    const { data, error } = await this.db
      .from("documents")
      .select(DOCUMENT_COLUMNS)
      .eq("id", id)
      .maybeSingle<DocumentRow>();
    if (error) throw error;
    if (!data) return null;
    return {
      ...toSummary(data),
      pageCount: data.page_count,
      extractedData: data.extracted_data,
    };
  }

  async createUploadTarget(storagePath: string): Promise<UploadTarget> {
    const { data, error } = await this.db.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error) throw error;
    return { storagePath, signedUrl: data.signedUrl };
  }

  async insertDocuments(documents: NewDocument[]): Promise<string[]> {
    const { data, error } = await this.db
      .from("documents")
      .insert(
        documents.map((doc) => ({
          file_name: doc.fileName,
          storage_path: doc.storagePath,
          mime_type: doc.mimeType,
          page_count: doc.pageCount,
          requested_document_type_id: doc.requestedDocumentTypeId,
          document_type_id: doc.documentTypeId,
        })),
      )
      .select("id");
    if (error) throw error;
    return data.map((row) => row.id as string);
  }

  async createSignedUrls(storagePaths: string[]): Promise<Record<string, string>> {
    const { data, error } = await this.db.storage
      .from(BUCKET)
      .createSignedUrls(storagePaths, SIGNED_URL_SECONDS);
    if (error) throw error;

    const urls: Record<string, string> = {};
    for (const item of data) {
      if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
    }
    return urls;
  }

  async downloadFile(storagePath: string): Promise<Uint8Array> {
    const { data, error } = await this.db.storage.from(BUCKET).download(storagePath);
    if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  }

  async claimQueuedDocuments(maxConcurrent: number): Promise<ClaimedDocument[]> {
    const { data, error } = await this.db.rpc("claim_documents", {
      max_concurrent: maxConcurrent,
    });
    if (error) throw error;
    return ((data ?? []) as ClaimedRow[]).map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      mimeType: row.mime_type,
      documentTypeId: row.document_type_id,
      attemptCount: row.attempt_count,
    }));
  }

  async completeExtraction(id: string, data: ExtractedData): Promise<void> {
    const { error } = await this.db
      .from("documents")
      .update({
        status: "done",
        extracted_data: data,
        failure_reason: null,
        extracting_since: null,
      })
      .eq("id", id)
      .eq("status", "extracting");
    if (error) throw error;
  }

  async requeueExtraction(id: string, nextAttemptAt: Date): Promise<void> {
    const { error } = await this.db
      .from("documents")
      .update({
        status: "queued",
        next_attempt_at: nextAttemptAt.toISOString(),
        extracting_since: null,
      })
      .eq("id", id)
      .eq("status", "extracting");
    if (error) throw error;
  }

  async listStaleExtractions(cutoff: Date) {
    const { data, error } = await this.db
      .from("documents")
      .select("id, attempt_count")
      .eq("status", "extracting")
      .lt("extracting_since", cutoff.toISOString());
    if (error) throw error;
    return data.map((row) => ({ id: row.id as string, attemptCount: row.attempt_count as number }));
  }

  async setClassifiedDocumentType(id: string, documentTypeId: string): Promise<void> {
    const { error } = await this.db
      .from("documents")
      .update({ document_type_id: documentTypeId })
      .eq("id", id)
      .eq("status", "extracting");
    if (error) throw error;
  }

  async requeueForRerun(id: string, documentTypeId: string | null): Promise<boolean> {
    const { data, error } = await this.db
      .from("documents")
      .update({
        status: "queued",
        document_type_id: documentTypeId,
        requested_document_type_id: documentTypeId,
        extracted_data: null,
        failure_reason: null,
        attempt_count: 0,
        next_attempt_at: null,
      })
      .eq("id", id)
      .in("status", ["done", "failed"])
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async resetFailedExtraction(id: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("documents")
      .update({ status: "queued", attempt_count: 0, failure_reason: null, next_attempt_at: null })
      .eq("id", id)
      .eq("status", "failed")
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async failExtraction(id: string, reason: string): Promise<void> {
    const { error } = await this.db
      .from("documents")
      .update({ status: "failed", failure_reason: reason, extracting_since: null })
      .eq("id", id)
      .eq("status", "extracting");
    if (error) throw error;
  }
}
