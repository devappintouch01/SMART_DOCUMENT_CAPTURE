import "server-only";
import { createDocumentService, type DocumentService } from "./document-service";
import type { AiReader } from "./ports";
import { SupabaseStore } from "./supabase-store";

let service: DocumentService | undefined;

// Wires the Document service to the real adapters.
export function getDocumentService(): DocumentService {
  // The Claude adapter replaces this placeholder in ticket 03.
  const ai: AiReader = {};
  service ??= createDocumentService({ store: SupabaseStore.fromEnv(), ai });
  return service;
}
