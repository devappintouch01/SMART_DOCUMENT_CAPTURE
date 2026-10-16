// Domain vocabulary follows CONTEXT.md.

// "long_text" is text that can span several lines (notes, addresses); the
// result page gives it a box that grows, where "text" is a one-line input.
export type FieldKind = "text" | "long_text" | "number" | "date" | "amount";

export type FieldScope = "header" | "line_item";

export type Field = {
  id: string;
  scope: FieldScope;
  name: string;
  kind: FieldKind;
  description: string | null;
  position: number;
};

export type DocumentType = {
  id: string;
  name: string;
  isSeed: boolean;
  fields: Field[];
};

export type ExtractionStatus = "queued" | "extracting" | "done" | "failed";

export type DocumentSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  documentTypeId: string | null;
  documentTypeName: string | null;
  status: ExtractionStatus;
  failureReason: string | null;
  openReviewFlagCount: number;
  uploadedAt: Date;
};

// A row on the result list: the summary plus a short-lived image URL for the
// thumbnail (PDFs have none).
export type DocumentListItem = DocumentSummary & { previewUrl: string | null };

// Everything the result detail page shows for one Document.
export type DocumentDetail = DocumentSummary & {
  pageCount: number | null;
  documentType: DocumentType | null;
  extractedData: import("./extracted-data").ExtractedData | null;
  // Short-lived URL for viewing the original file.
  fileUrl: string | null;
  // When the Extraction finished; null while it is running and for old Documents.
  completedAt: Date | null;
};

// What the result list narrows down to; every part is optional and they combine.
export type DocumentFilter = {
  documentTypeId?: string;
  status?: ExtractionStatus;
  // Case-insensitive part of the file name.
  search?: string;
};

// A Document Type with how many Documents use it, for the Document Types page.
export type DocumentTypeSummary = DocumentType & { documentCount: number };
