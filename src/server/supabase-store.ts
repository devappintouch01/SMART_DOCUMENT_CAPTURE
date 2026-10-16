import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AiCall, NewAiCall } from "@/domain/ai-usage";
import { countOpenFlags, type ExtractedData } from "@/domain/extracted-data";
import type {
  DocumentSummary,
  DocumentType,
  ExtractionStatus,
  FieldKind,
  FieldScope,
} from "@/domain/types";
import type { ClaimedDocument, FieldInput, NewDocument, Store, UploadTarget } from "./ports";

const BUCKET = "documents";
const SIGNED_URL_SECONDS = 60 * 60;

// The list never loads extracted_data (it is the bulk of the payload); the open
// flag count is kept in its own column instead.
const DOCUMENT_COLUMNS =
  "id, file_name, mime_type, storage_path, page_count, document_type_id, status, failure_reason, open_flag_count, uploaded_at, document_types!documents_document_type_id_fkey(name)";
const DOCUMENT_DETAIL_COLUMNS = DOCUMENT_COLUMNS + ", extracted_data, completed_at";

type DocumentRow = {
  id: string;
  file_name: string;
  mime_type: string;
  storage_path: string;
  page_count: number | null;
  document_type_id: string | null;
  status: ExtractionStatus;
  failure_reason: string | null;
  open_flag_count: number;
  extracted_data?: ExtractedData | null;
  completed_at?: string | null;
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

const AI_CALL_COLUMNS =
  "id, document_id, operation, provider, model, started_at, duration_ms, input_tokens, output_tokens, cost_usd, status, error, is_legacy";

type AiCallRow = {
  id: string;
  document_id: string | null;
  operation: AiCall["operation"];
  provider: string;
  model: string;
  started_at: string;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  // numeric comes back as a string or a number depending on the driver.
  cost_usd: string | number | null;
  status: AiCall["status"];
  error: string | null;
  is_legacy: boolean;
};

function toAiCall(row: AiCallRow): AiCall {
  return {
    id: row.id,
    documentId: row.document_id,
    operation: row.operation,
    provider: row.provider,
    model: row.model,
    startedAt: new Date(row.started_at),
    durationMs: row.duration_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    status: row.status,
    error: row.error,
    isLegacy: row.is_legacy,
  };
}

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
    openReviewFlagCount: row.open_flag_count,
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
      .select(DOCUMENT_DETAIL_COLUMNS)
      .eq("id", id)
      .maybeSingle<DocumentRow>();
    if (error) throw error;
    if (!data) return null;
    return {
      ...toSummary(data),
      pageCount: data.page_count,
      extractedData: data.extracted_data ?? null,
      completedAt: data.completed_at ? new Date(data.completed_at) : null,
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

  async deleteAllDocuments(): Promise<void> {
    const { error } = await this.db.from("documents").delete().not("id", "is", null);
    if (error) throw error;

    // Every stored file sits at the top level of the bucket.
    for (let round = 0; round < 50; round++) {
      const { data, error: listError } = await this.db.storage.from(BUCKET).list("", { limit: 1000 });
      if (listError) throw listError;
      const names = data.filter((f) => f.id).map((f) => f.name);
      if (names.length === 0) return;
      const { error: removeError } = await this.db.storage.from(BUCKET).remove(names);
      if (removeError) throw removeError;
    }
  }

  async deleteNonSeedDocumentTypes(): Promise<void> {
    const { error } = await this.db.from("document_types").delete().eq("is_seed", false);
    if (error) throw error;
  }

  async restoreSeedDocumentTypes(types: DocumentType[]): Promise<void> {
    for (const type of types) {
      const { error } = await this.db
        .from("document_types")
        .upsert({ id: type.id, name: type.name, is_seed: true, updated_at: new Date().toISOString() });
      if (error) throw error;

      const { error: fieldsError } = await this.db.from("fields").upsert(
        type.fields.map((f) => ({
          id: f.id,
          document_type_id: type.id,
          scope: f.scope,
          name: f.name,
          kind: f.kind,
          description: f.description,
          position: f.position,
        })),
      );
      if (fieldsError) throw fieldsError;

      // Fields the user added to a seeded type go away; the originals stay.
      const keep = type.fields.map((f) => f.id);
      const { error: pruneError } = await this.db
        .from("fields")
        .delete()
        .eq("document_type_id", type.id)
        .not("id", "in", `(${keep.join(",")})`);
      if (pruneError) throw pruneError;
    }
  }

  async uploadFile(storagePath: string, bytes: Uint8Array, mimeType: string): Promise<void> {
    const { error } = await this.db.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
    if (error) throw error;
  }

  async insertCompletedDocument(
    input: NewDocument & { extractedData: ExtractedData; uploadedAt: Date },
  ): Promise<string> {
    const { data, error } = await this.db
      .from("documents")
      .insert({
        file_name: input.fileName,
        storage_path: input.storagePath,
        mime_type: input.mimeType,
        page_count: input.pageCount,
        requested_document_type_id: input.requestedDocumentTypeId,
        document_type_id: input.documentTypeId,
        status: "done",
        extracted_data: input.extractedData,
        open_flag_count: countOpenFlags(input.extractedData),
        is_demo_seed: true,
        uploaded_at: input.uploadedAt.toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async createDocumentType(input: { name: string; fields: FieldInput[] }): Promise<string> {
    const { data, error } = await this.db
      .from("document_types")
      .insert({ name: input.name, is_seed: false })
      .select("id")
      .single();
    if (error) throw error;
    const id = data.id as string;

    const { error: fieldsError } = await this.db.from("fields").insert(
      input.fields.map((f, position) => ({
        document_type_id: id,
        scope: f.scope,
        name: f.name,
        kind: f.kind,
        description: f.description || null,
        position,
      })),
    );
    if (fieldsError) {
      // No transaction through the API: undo the half-created type.
      await this.db.from("document_types").delete().eq("id", id);
      throw fieldsError;
    }
    return id;
  }

  async updateDocumentType(id: string, input: { name: string; fields: FieldInput[] }): Promise<void> {
    const { error: nameError } = await this.db
      .from("document_types")
      .update({ name: input.name, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (nameError) throw nameError;

    const keep = input.fields.filter((f) => f.id).map((f) => f.id as string);
    const { data: current, error: listError } = await this.db.from("fields").select("id").eq("document_type_id", id);
    if (listError) throw listError;
    const removed = current.map((r) => r.id as string).filter((fieldId) => !keep.includes(fieldId));
    if (removed.length > 0) {
      const { error } = await this.db.from("fields").delete().in("id", removed);
      if (error) throw error;
    }

    for (const [position, f] of input.fields.entries()) {
      if (f.id) {
        // Scope is never changed for an existing Field: stored values would no
        // longer line up with it.
        const { error } = await this.db
          .from("fields")
          .update({ name: f.name, kind: f.kind, description: f.description || null, position })
          .eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await this.db.from("fields").insert({
          document_type_id: id,
          scope: f.scope,
          name: f.name,
          kind: f.kind,
          description: f.description || null,
          position,
        });
        if (error) throw error;
      }
    }
  }

  async deleteDocumentType(id: string): Promise<void> {
    // The documents foreign keys restrict this if a Document still uses the type.
    const { error } = await this.db.from("document_types").delete().eq("id", id);
    if (error) throw error;
  }

  async listExtractedData(documentTypeId: string) {
    const { data, error } = await this.db
      .from("documents")
      .select("id, extracted_data")
      .eq("document_type_id", documentTypeId)
      .eq("status", "done")
      .not("extracted_data", "is", null);
    if (error) throw error;
    return data.map((row) => ({ id: row.id as string, extractedData: row.extracted_data as ExtractedData }));
  }

  async countDocumentsByType(): Promise<Record<string, number>> {
    const { data, error } = await this.db.from("documents").select("document_type_id");
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const row of data) {
      const typeId = row.document_type_id as string | null;
      if (typeId) counts[typeId] = (counts[typeId] ?? 0) + 1;
    }
    return counts;
  }

  async deleteDocuments(ids: string[]): Promise<number> {
    const { data: rows, error: findError } = await this.db
      .from("documents")
      .select("id, storage_path")
      .in("id", ids);
    if (findError) throw findError;
    if (rows.length === 0) return 0;

    const found = rows.map((r) => r.id as string);
    const { error } = await this.db.from("documents").delete().in("id", found);
    if (error) throw error;

    const { error: storageError } = await this.db.storage
      .from(BUCKET)
      .remove(rows.map((r) => r.storage_path as string));
    // The rows are already gone; an orphaned file is harmless, so only log it.
    if (storageError) console.error("could not remove stored files", storageError);
    return found.length;
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
        open_flag_count: countOpenFlags(data),
        failure_reason: null,
        extracting_since: null,
        completed_at: new Date().toISOString(),
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

  async saveExtractedData(id: string, data: ExtractedData): Promise<boolean> {
    const { data: rows, error } = await this.db
      .from("documents")
      .update({ extracted_data: data, open_flag_count: countOpenFlags(data) })
      .eq("id", id)
      .eq("status", "done")
      .select("id");
    if (error) throw error;
    return rows.length > 0;
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
        open_flag_count: 0,
        failure_reason: null,
        attempt_count: 0,
        next_attempt_at: null,
        completed_at: null,
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
      .update({ status: "queued", attempt_count: 0, failure_reason: null, next_attempt_at: null, completed_at: null })
      .eq("id", id)
      .eq("status", "failed")
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async failExtraction(id: string, reason: string): Promise<void> {
    const { error } = await this.db
      .from("documents")
      .update({
        status: "failed",
        failure_reason: reason,
        extracting_since: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "extracting");
    if (error) throw error;
  }

  async recordAiCall(call: NewAiCall): Promise<void> {
    const { error } = await this.db.from("ai_calls").insert({
      document_id: call.documentId,
      operation: call.operation,
      provider: call.provider,
      model: call.model,
      started_at: call.startedAt.toISOString(),
      duration_ms: call.durationMs,
      input_tokens: call.inputTokens,
      output_tokens: call.outputTokens,
      cost_usd: call.costUsd,
      status: call.status,
      error: call.error,
    });
    if (error) throw error;
  }

  async listAiCalls(documentId: string): Promise<AiCall[]> {
    const { data, error } = await this.db
      .from("ai_calls")
      .select(AI_CALL_COLUMNS)
      .eq("document_id", documentId)
      .order("started_at", { ascending: true })
      .returns<AiCallRow[]>();
    if (error) throw error;
    return data.map(toAiCall);
  }

  async listAllAiCalls(): Promise<AiCall[]> {
    const { data, error } = await this.db
      .from("ai_calls")
      .select(AI_CALL_COLUMNS)
      .order("started_at", { ascending: false })
      .limit(10000)
      .returns<AiCallRow[]>();
    if (error) throw error;
    return data.map(toAiCall);
  }

  async getSetting(key: string): Promise<string | null> {
    const { data, error } = await this.db.from("app_settings").select("value").eq("key", key).maybeSingle();
    if (error) throw error;
    return (data?.value as string | undefined) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const { error } = await this.db
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async sumAiCostByDocument(documentIds: string[]): Promise<Record<string, number>> {
    if (documentIds.length === 0) return {};
    const { data, error } = await this.db
      .from("ai_calls")
      .select("document_id, cost_usd")
      .in("document_id", documentIds)
      .not("cost_usd", "is", null);
    if (error) throw error;
    const totals: Record<string, number> = {};
    for (const row of data) {
      const id = row.document_id as string;
      totals[id] = (totals[id] ?? 0) + Number(row.cost_usd);
    }
    return totals;
  }
}
