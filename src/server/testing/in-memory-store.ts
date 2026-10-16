import { randomUUID } from "node:crypto";
import type { AiCall, NewAiCall } from "@/domain/ai-usage";
import { countOpenFlags, type ExtractedData } from "@/domain/extracted-data";
import type { DocumentSummary, DocumentType, ExtractionStatus } from "@/domain/types";
import type { ClaimedDocument, FieldInput, NewDocument, Store, UploadTarget } from "../ports";

export type StoredDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  pageCount: number | null;
  requestedDocumentTypeId: string | null;
  documentTypeId: string | null;
  status: ExtractionStatus;
  failureReason: string | null;
  attemptCount: number;
  nextAttemptAt: Date | null;
  extractingSince: Date | null;
  extractedData: ExtractedData | null;
  uploadedAt: Date;
  completedAt?: Date | null;
};

export class InMemoryStore implements Store {
  documentTypes: DocumentType[] = [];
  documents: StoredDocument[] = [];
  files = new Map<string, Uint8Array>();
  uploadTargets: string[] = [];
  aiCalls: AiCall[] = [];
  now = () => new Date();

  addDocument(overrides: Partial<StoredDocument> = {}): StoredDocument {
    const document: StoredDocument = {
      id: randomUUID(),
      fileName: "inv_001.pdf",
      mimeType: "application/pdf",
      storagePath: `${randomUUID()}.pdf`,
      pageCount: 1,
      requestedDocumentTypeId: null,
      documentTypeId: null,
      status: "queued",
      failureReason: null,
      attemptCount: 0,
      nextAttemptAt: null,
      extractingSince: null,
      extractedData: null,
      uploadedAt: this.now(),
      ...overrides,
    };
    this.documents.push(document);
    if (!this.files.has(document.storagePath)) {
      this.files.set(document.storagePath, new TextEncoder().encode(document.fileName));
    }
    return document;
  }

  private summary(d: StoredDocument): DocumentSummary {
    return {
      id: d.id,
      fileName: d.fileName,
      mimeType: d.mimeType,
      storagePath: d.storagePath,
      documentTypeId: d.documentTypeId,
      documentTypeName: this.documentTypes.find((t) => t.id === d.documentTypeId)?.name ?? null,
      status: d.status,
      failureReason: d.failureReason,
      openReviewFlagCount: countOpenFlags(d.extractedData),
      uploadedAt: d.uploadedAt,
    };
  }

  async listDocumentTypes(): Promise<DocumentType[]> {
    return structuredClone(this.documentTypes);
  }

  async listDocuments(): Promise<DocumentSummary[]> {
    return this.documents.map((d) => this.summary(d));
  }

  async getDocument(id: string) {
    const d = this.documents.find((doc) => doc.id === id);
    if (!d) return null;
    return {
      ...this.summary(d),
      pageCount: d.pageCount,
      extractedData: structuredClone(d.extractedData),
      completedAt: d.completedAt ?? null,
    };
  }

  async createUploadTarget(storagePath: string): Promise<UploadTarget> {
    this.uploadTargets.push(storagePath);
    return { storagePath, signedUrl: `memory://upload/${storagePath}` };
  }

  async insertDocuments(documents: NewDocument[]): Promise<string[]> {
    return documents.map((doc) => this.addDocument({ ...doc }).id);
  }

  async createSignedUrls(storagePaths: string[]): Promise<Record<string, string>> {
    return Object.fromEntries(storagePaths.map((p) => [p, `memory://view/${p}`]));
  }

  async downloadFile(storagePath: string): Promise<Uint8Array> {
    const bytes = this.files.get(storagePath);
    if (!bytes) throw new Error(`no file at ${storagePath}`);
    return bytes;
  }

  async deleteAllDocuments(): Promise<void> {
    this.documents = [];
    this.files.clear();
  }

  async deleteNonSeedDocumentTypes(): Promise<void> {
    this.documentTypes = this.documentTypes.filter((t) => t.isSeed);
  }

  async restoreSeedDocumentTypes(types: DocumentType[]): Promise<void> {
    for (const seed of types) {
      const clone = structuredClone(seed);
      const index = this.documentTypes.findIndex((t) => t.id === seed.id);
      if (index >= 0) this.documentTypes[index] = clone;
      else this.documentTypes.push(clone);
    }
  }

  async uploadFile(storagePath: string, bytes: Uint8Array): Promise<void> {
    this.files.set(storagePath, bytes);
  }

  async insertCompletedDocument(
    input: NewDocument & { extractedData: ExtractedData; uploadedAt: Date },
  ): Promise<string> {
    const { extractedData, uploadedAt, ...doc } = input;
    return this.addDocument({ ...doc, status: "done", extractedData, uploadedAt }).id;
  }

  async createDocumentType(input: { name: string; fields: FieldInput[] }): Promise<string> {
    const id = randomUUID();
    this.documentTypes.push({
      id,
      name: input.name,
      isSeed: false,
      fields: input.fields.map((f, position) => ({
        id: randomUUID(),
        scope: f.scope,
        name: f.name,
        kind: f.kind,
        description: f.description || null,
        position,
      })),
    });
    return id;
  }

  async updateDocumentType(id: string, input: { name: string; fields: FieldInput[] }): Promise<void> {
    const type = this.documentTypes.find((t) => t.id === id);
    if (!type) throw new Error("no such type");
    type.name = input.name;
    type.fields = input.fields.map((f, position) => {
      const existing = f.id ? type.fields.find((x) => x.id === f.id) : undefined;
      return {
        id: existing?.id ?? randomUUID(),
        scope: existing?.scope ?? f.scope,
        name: f.name,
        kind: f.kind,
        description: f.description || null,
        position,
      };
    });
  }

  async deleteDocumentType(id: string): Promise<void> {
    if (this.documents.some((d) => d.documentTypeId === id)) throw new Error("type in use");
    this.documentTypes = this.documentTypes.filter((t) => t.id !== id);
  }

  async listExtractedData(documentTypeId: string) {
    return this.documents
      .filter((d) => d.documentTypeId === documentTypeId && d.status === "done" && d.extractedData)
      .map((d) => ({ id: d.id, extractedData: structuredClone(d.extractedData!) }));
  }

  async countDocumentsByType(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const d of this.documents) {
      if (d.documentTypeId) counts[d.documentTypeId] = (counts[d.documentTypeId] ?? 0) + 1;
    }
    return counts;
  }

  async deleteDocuments(ids: string[]): Promise<number> {
    const doomed = this.documents.filter((d) => ids.includes(d.id));
    for (const d of doomed) this.files.delete(d.storagePath);
    this.documents = this.documents.filter((d) => !ids.includes(d.id));
    return doomed.length;
  }

  async claimQueuedDocuments(maxConcurrent: number): Promise<ClaimedDocument[]> {
    const extracting = this.documents.filter((d) => d.status === "extracting").length;
    const slots = maxConcurrent - extracting;
    if (slots <= 0) return [];
    const now = this.now();
    const claimed = this.documents
      .filter((d) => d.status === "queued" && (!d.nextAttemptAt || d.nextAttemptAt <= now))
      .sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime())
      .slice(0, slots);
    for (const d of claimed) {
      d.status = "extracting";
      d.extractingSince = now;
      d.attemptCount += 1;
    }
    return claimed.map((d) => ({
      id: d.id,
      storagePath: d.storagePath,
      mimeType: d.mimeType,
      documentTypeId: d.documentTypeId,
      attemptCount: d.attemptCount,
    }));
  }

  async completeExtraction(id: string, data: ExtractedData): Promise<void> {
    const d = this.documents.find((doc) => doc.id === id && doc.status === "extracting");
    if (!d) return;
    d.status = "done";
    d.extractedData = structuredClone(data);
    d.failureReason = null;
    d.extractingSince = null;
    d.completedAt = this.now();
  }

  async failExtraction(id: string, reason: string): Promise<void> {
    const d = this.documents.find((doc) => doc.id === id && doc.status === "extracting");
    if (!d) return;
    d.status = "failed";
    d.failureReason = reason;
    d.extractingSince = null;
    d.completedAt = this.now();
  }

  async requeueExtraction(id: string, nextAttemptAt: Date): Promise<void> {
    const d = this.documents.find((doc) => doc.id === id && doc.status === "extracting");
    if (!d) return;
    d.status = "queued";
    d.nextAttemptAt = nextAttemptAt;
    d.extractingSince = null;
  }

  async listStaleExtractions(cutoff: Date) {
    return this.documents
      .filter((d) => d.status === "extracting" && d.extractingSince && d.extractingSince < cutoff)
      .map((d) => ({ id: d.id, attemptCount: d.attemptCount }));
  }

  async saveExtractedData(id: string, data: ExtractedData): Promise<boolean> {
    const d = this.documents.find((doc) => doc.id === id && doc.status === "done");
    if (!d) return false;
    d.extractedData = structuredClone(data);
    return true;
  }

  async setClassifiedDocumentType(id: string, documentTypeId: string): Promise<void> {
    const d = this.documents.find((doc) => doc.id === id && doc.status === "extracting");
    if (d) d.documentTypeId = documentTypeId;
  }

  async requeueForRerun(id: string, documentTypeId: string | null): Promise<boolean> {
    const d = this.documents.find(
      (doc) => doc.id === id && (doc.status === "done" || doc.status === "failed"),
    );
    if (!d) return false;
    Object.assign(d, {
      status: "queued",
      documentTypeId,
      requestedDocumentTypeId: documentTypeId,
      extractedData: null,
      failureReason: null,
      attemptCount: 0,
      nextAttemptAt: null,
      completedAt: null,
    });
    return true;
  }

  async resetFailedExtraction(id: string): Promise<boolean> {
    const d = this.documents.find((doc) => doc.id === id && doc.status === "failed");
    if (!d) return false;
    d.status = "queued";
    d.attemptCount = 0;
    d.failureReason = null;
    d.nextAttemptAt = null;
    d.completedAt = null;
    return true;
  }

  async recordAiCall(call: NewAiCall): Promise<void> {
    this.aiCalls.push({ ...call, id: crypto.randomUUID(), isLegacy: false });
  }

  async listAiCalls(documentId: string): Promise<AiCall[]> {
    return this.aiCalls.filter((c) => c.documentId === documentId);
  }

  async listAllAiCalls(): Promise<AiCall[]> {
    return [...this.aiCalls];
  }
}
