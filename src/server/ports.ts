import type { ExtractedData, RawValue } from "@/domain/extracted-data";
import type { DocumentDetail, DocumentSummary, DocumentType } from "@/domain/types";

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

// A Document that was just moved to Extracting and is ours to work on.
export type ClaimedDocument = {
  id: string;
  storagePath: string;
  mimeType: string;
  documentTypeId: string | null;
  attemptCount: number;
};

// The Document service reaches Supabase only through this port.
export interface Store {
  listDocumentTypes(): Promise<DocumentType[]>;
  listDocuments(): Promise<DocumentSummary[]>;
  getDocument(id: string): Promise<Omit<DocumentDetail, "documentType" | "fileUrl"> | null>;
  createUploadTarget(storagePath: string): Promise<UploadTarget>;
  insertDocuments(documents: NewDocument[]): Promise<string[]>;
  // Short-lived URLs for viewing stored files, keyed by storage path.
  createSignedUrls(storagePaths: string[]): Promise<Record<string, string>>;
  downloadFile(storagePath: string): Promise<Uint8Array>;
  // Removes the Documents and their stored files; returns how many Documents
  // existed.
  deleteDocuments(ids: string[]): Promise<number>;
  // Atomically moves Queued Documents to Extracting while fewer than
  // maxConcurrent are Extracting, and returns the ones it moved.
  claimQueuedDocuments(maxConcurrent: number): Promise<ClaimedDocument[]>;
  completeExtraction(id: string, data: ExtractedData): Promise<void>;
  failExtraction(id: string, reason: string): Promise<void>;
  // Extracting → Queued, claimable again from nextAttemptAt.
  requeueExtraction(id: string, nextAttemptAt: Date): Promise<void>;
  // Extractions that have been running since before the cutoff.
  listStaleExtractions(cutoff: Date): Promise<{ id: string; attemptCount: number }[]>;
  // Replaces a Done Document's extracted data (Corrections, confirmed flags).
  saveExtractedData(id: string, data: ExtractedData): Promise<boolean>;
  // Failed → Queued with the attempt count reset; false if it was not Failed.
  resetFailedExtraction(id: string): Promise<boolean>;
  // Records the Document Type Classification picked for an Extracting Document.
  setClassifiedDocumentType(id: string, documentTypeId: string): Promise<void>;
  // Done or Failed → Queued for a fresh Extraction with the given Document
  // Type (null asks for Classification). Clears extracted data, Corrections
  // included. False if the Document is Queued or Extracting.
  requeueForRerun(id: string, documentTypeId: string | null): Promise<boolean>;
}

export type DocumentFile = { bytes: Uint8Array; mimeType: string };

export type ExtractionOutput =
  | {
      kind: "extracted";
      // Keyed by Field id.
      header: Record<string, RawValue>;
      lineItems: Record<string, RawValue>[];
    }
  | { kind: "unreadable"; reason: string };

// Every failure the AI reader raises says whether retrying could help, so the
// Document service never needs to know about HTTP status codes.
export class AiReaderError extends Error {
  constructor(
    readonly retryable: boolean,
    // Thai, safe to show the user.
    readonly userMessage: string,
    options?: { cause?: unknown },
  ) {
    super(userMessage, options);
  }
}

export type ClassificationOutput = {
  // null when no Document Type fits.
  documentTypeId: string | null;
  // Thai, shown to the user when nothing fits.
  reason: string;
};

// The Document service reaches the AI only through this port.
export interface AiReader {
  classify(file: DocumentFile, documentTypes: DocumentType[]): Promise<ClassificationOutput>;
  extract(file: DocumentFile, documentType: DocumentType): Promise<ExtractionOutput>;
}
