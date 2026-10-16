import "server-only";
import { ClaudeAiReader } from "./claude-ai-reader";
import {
  createDocumentService,
  DEFAULT_EXTRACTION_CONCURRENCY,
  type DocumentService,
} from "./document-service";
import { SupabaseStore } from "./supabase-store";

let service: DocumentService | undefined;

// Wires the Document service to the real adapters.
export function getDocumentService(): DocumentService {
  const store = SupabaseStore.fromEnv();
  service ??= createDocumentService({
    store,
    ai: new ClaudeAiReader(undefined, undefined, undefined, (call) => store.recordAiCall(call)),
    concurrency:
      Number(process.env.EXTRACTION_CONCURRENCY) || DEFAULT_EXTRACTION_CONCURRENCY,
  });
  return service;
}
