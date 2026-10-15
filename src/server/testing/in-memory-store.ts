import type { DocumentSummary } from "@/domain/types";
import type { Store } from "../ports";

export class InMemoryStore implements Store {
  documents: DocumentSummary[] = [];

  async listDocuments(): Promise<DocumentSummary[]> {
    return this.documents.map((d) => ({ ...d }));
  }
}
