import type { DocumentSummary } from "@/domain/types";
import type { AiReader, Store } from "./ports";

export type DocumentService = ReturnType<typeof createDocumentService>;

// The only entry point pages and API routes use for Documents and Document
// Types. Tests drive it with the fakes in ./testing.
export function createDocumentService(deps: { store: Store; ai: AiReader }) {
  const { store } = deps;

  return {
    async listDocuments(): Promise<DocumentSummary[]> {
      const documents = await store.listDocuments();
      return [...documents].sort(
        (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
      );
    },
  };
}
