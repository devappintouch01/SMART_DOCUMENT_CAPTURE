import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  DocumentSummary,
  DocumentType,
  ExtractionStatus,
  FieldKind,
  FieldScope,
} from "@/domain/types";
import type { NewDocument, Store, UploadTarget } from "./ports";

const BUCKET = "documents";
const SIGNED_URL_SECONDS = 60 * 60;

type DocumentRow = {
  id: string;
  file_name: string;
  mime_type: string;
  storage_path: string;
  document_type_id: string | null;
  status: ExtractionStatus;
  failure_reason: string | null;
  uploaded_at: string;
  document_types: { name: string } | null;
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
      .select(
        "id, file_name, mime_type, storage_path, document_type_id, status, failure_reason, uploaded_at, document_types!documents_document_type_id_fkey(name)",
      )
      .order("uploaded_at", { ascending: false })
      .returns<DocumentRow[]>();
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      storagePath: row.storage_path,
      documentTypeId: row.document_type_id,
      documentTypeName: row.document_types?.name ?? null,
      status: row.status,
      failureReason: row.failure_reason,
      // Review Flags arrive with ticket 06.
      openReviewFlagCount: 0,
      uploadedAt: new Date(row.uploaded_at),
    }));
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
}
