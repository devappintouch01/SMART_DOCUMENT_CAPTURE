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
  documentTypeId: string | null;
  documentTypeName: string | null;
  status: ExtractionStatus;
  failureReason: string | null;
  openReviewFlagCount: number;
  uploadedAt: Date;
};
