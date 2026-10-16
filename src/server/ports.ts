import type { AiCall, NewAiCall } from "@/domain/ai-usage";
import type { ExtractedData, RawValue } from "@/domain/extracted-data";
import type {
  DocumentDetail,
  DocumentSummary,
  DocumentType,
  FieldKind,
  FieldScope,
} from "@/domain/types";

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
  // Creates a Document Type with its Fields (positions follow the list order)
  // and returns its id.
  createDocumentType(input: { name: string; fields: FieldInput[] }): Promise<string>;
  // Renames the type and makes its Fields match the list: Fields with an id are
  // updated in place, Fields without one are added, Fields not listed are
  // deleted. Positions follow the list order.
  updateDocumentType(id: string, input: { name: string; fields: FieldInput[] }): Promise<void>;
  // Deletes a type with no Documents (its Fields go with it).
  deleteDocumentType(id: string): Promise<void>;
  // Extracted data of the done Documents of one type.
  listExtractedData(documentTypeId: string): Promise<{ id: string; extractedData: ExtractedData }[]>;
  // --- demo reset ---
  // Removes every Document and every stored file.
  deleteAllDocuments(): Promise<void>;
  deleteNonSeedDocumentTypes(): Promise<void>;
  // Makes the given seeded types (with their original Fields) exist again.
  restoreSeedDocumentTypes(types: DocumentType[]): Promise<void>;
  uploadFile(storagePath: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  // A Document that is already Done, with its data and a chosen upload time.
  insertCompletedDocument(
    input: NewDocument & { extractedData: ExtractedData; uploadedAt: Date },
  ): Promise<string>;
  // Number of Documents per Document Type id.
  countDocumentsByType(): Promise<Record<string, number>>;
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
  // --- app settings (superadmin changes them) ---
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  // --- AI call log (superadmin only) ---
  recordAiCall(call: NewAiCall): Promise<void>;
  listAiCalls(documentId: string): Promise<AiCall[]>;
  listAllAiCalls(): Promise<AiCall[]>;
  // Total measured cost (USD) per Document id; Documents with no measured cost are left out.
  sumAiCostByDocument(documentIds: string[]): Promise<Record<string, number>>;
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

// A Field as the user edits it; position comes from the order of the list.
export type FieldInput = {
  // Set for a Field that already exists, so editing keeps its values; absent
  // for a new Field.
  id?: string;
  scope: FieldScope;
  name: string;
  kind: FieldKind;
  description: string;
};

export type DocumentTypeProposal = {
  // Thai, e.g. "ใบวางบิล".
  name: string;
  fields: FieldInput[];
};

export type ClassificationOutput = {
  // null when no Document Type fits.
  documentTypeId: string | null;
  // Thai, shown to the user when nothing fits.
  reason: string;
};

// Which Document an AI call is for, so the call log can tie them together.
export type AiCallContext = { documentId?: string };

// The Document service reaches the AI only through this port.
export interface AiReader {
  classify(
    file: DocumentFile,
    documentTypes: DocumentType[],
    context?: AiCallContext,
  ): Promise<ClassificationOutput>;
  // Suggests a name and Fields for a Document Type from one example document.
  proposeDocumentType(file: DocumentFile, context?: AiCallContext): Promise<DocumentTypeProposal>;
  extract(file: DocumentFile, documentType: DocumentType, context?: AiCallContext): Promise<ExtractionOutput>;
}
