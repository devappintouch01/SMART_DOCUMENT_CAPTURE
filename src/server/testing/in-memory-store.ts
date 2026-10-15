import { randomUUID } from "node:crypto";
import { countOpenFlags, type ExtractedData } from "@/domain/extracted-data";
import type { DocumentSummary, DocumentType, ExtractionStatus } from "@/domain/types";
import type { ClaimedDocument, NewDocument, Store, UploadTarget } from "../ports";

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
};

export class InMemoryStore implements Store {
  documentTypes: DocumentType[] = [];
  documents: StoredDocument[] = [];
  files = new Map<string, Uint8Array>();
  uploadTargets: string[] = [];
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
  }

  async failExtraction(id: string, reason: string): Promise<void> {
    const d = this.documents.find((doc) => doc.id === id && doc.status === "extracting");
    if (!d) return;
    d.status = "failed";
    d.failureReason = reason;
    d.extractingSince = null;
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

  async resetFailedExtraction(id: string): Promise<boolean> {
    const d = this.documents.find((doc) => doc.id === id && doc.status === "failed");
    if (!d) return false;
    d.status = "queued";
    d.attemptCount = 0;
    d.failureReason = null;
    d.nextAttemptAt = null;
    return true;
  }
}
