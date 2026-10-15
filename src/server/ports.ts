import type { DocumentSummary } from "@/domain/types";

// The Document service reaches Supabase only through this port.
export interface Store {
  listDocuments(): Promise<DocumentSummary[]>;
}

// The Document service reaches the AI only through this port. Operations
// (classify, extract, proposeDocumentType) are added by the tickets that
// need them.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AiReader {}
