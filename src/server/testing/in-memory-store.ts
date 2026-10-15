import { randomUUID } from "node:crypto";
import type { DocumentSummary, DocumentType } from "@/domain/types";
import type { NewDocument, Store, UploadTarget } from "../ports";

export class InMemoryStore implements Store {
  documentTypes: DocumentType[] = [];
  documents: DocumentSummary[] = [];
  uploadTargets: string[] = [];
  now = () => new Date();

  async listDocumentTypes(): Promise<DocumentType[]> {
    return this.documentTypes.map((t) => ({ ...t, fields: [...t.fields] }));
  }

  async listDocuments(): Promise<DocumentSummary[]> {
    return this.documents.map((d) => ({ ...d }));
  }

  async createUploadTarget(storagePath: string): Promise<UploadTarget> {
    this.uploadTargets.push(storagePath);
    return { storagePath, signedUrl: `memory://upload/${storagePath}` };
  }

  async insertDocuments(documents: NewDocument[]): Promise<string[]> {
    return documents.map((doc) => {
      const id = randomUUID();
      const type = this.documentTypes.find((t) => t.id === doc.documentTypeId);
      this.documents.push({
        id,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        storagePath: doc.storagePath,
        documentTypeId: doc.documentTypeId,
        documentTypeName: type?.name ?? null,
        status: "queued",
        failureReason: null,
        openReviewFlagCount: 0,
        uploadedAt: this.now(),
      });
      return id;
    });
  }

  async createSignedUrls(storagePaths: string[]): Promise<Record<string, string>> {
    return Object.fromEntries(storagePaths.map((p) => [p, `memory://view/${p}`]));
  }
}
