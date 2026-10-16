import "server-only";
import { ClaudeAiReader, DEFAULT_EXTRACTION_MODEL } from "./claude-ai-reader";
import { resolveExtractionModel } from "./ai-settings";
import {
  createDocumentService,
  DEFAULT_EXTRACTION_CONCURRENCY,
  type DocumentService,
} from "./document-service";
import { SupabaseStore } from "./supabase-store";

let service: DocumentService | undefined;

// Wires the Document service to the real adapters.
export function getDocumentService(): DocumentService {
  if (service) return service;
  const store = SupabaseStore.fromEnv();
  // Used until the superadmin picks a model on the AI dashboard.
  const fallbackModel = process.env.AI_EXTRACTION_MODEL || DEFAULT_EXTRACTION_MODEL;
  service = createDocumentService({
    store,
    ai: new ClaudeAiReader(
      undefined,
      async () => (await resolveExtractionModel(store, fallbackModel)).model,
      undefined,
      (call) => store.recordAiCall(call),
    ),
    fallbackExtractionModel: fallbackModel,
    concurrency:
      Number(process.env.EXTRACTION_CONCURRENCY) || DEFAULT_EXTRACTION_CONCURRENCY,
  });
  return service;
}
