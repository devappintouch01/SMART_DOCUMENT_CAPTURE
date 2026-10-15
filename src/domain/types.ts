// Domain vocabulary follows CONTEXT.md.

export type FieldKind = "text" | "number" | "date" | "amount";

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
