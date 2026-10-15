import type { DocumentSummary, DocumentType } from "@/domain/types";

export type UploadTarget = {
  storagePath: string;
  // Where the browser PUTs the file bytes; carries its own short-lived token.
  signedUrl: string;
};

export type NewDocument = {
  fileName: string;
  storagePath: string;
  mimeType: string;
  pageCount: number;
  requestedDocumentTypeId: string | null;
  documentTypeId: string | null;
};

// The Document service reaches Supabase only through this port.
export interface Store {
  listDocumentTypes(): Promise<DocumentType[]>;
  listDocuments(): Promise<DocumentSummary[]>;
  createUploadTarget(storagePath: string): Promise<UploadTarget>;
  insertDocuments(documents: NewDocument[]): Promise<string[]>;
  // Short-lived URLs for viewing stored files, keyed by storage path.
  createSignedUrls(storagePaths: string[]): Promise<Record<string, string>>;
}

// The Document service reaches the AI only through this port. Operations
// (classify, extract, proposeDocumentType) are added by the tickets that
// need them.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AiReader {}
