import { EXTRACTION_MODEL_SETTING, isExtractionModel } from "@/domain/ai-models";
import type { Store } from "./ports";

export type ModelChoice = {
  model: string;
  // "setting": picked by the superadmin; "default": the AI_EXTRACTION_MODEL
  // environment variable (or the built-in default) because nothing was picked.
  source: "setting" | "default";
};

// Which model reads Documents right now. A pick the superadmin saved wins; an
// id that is not on the list (an old or edited value) is ignored.
export async function resolveExtractionModel(store: Store, fallback: string): Promise<ModelChoice> {
  const chosen = await store.getSetting(EXTRACTION_MODEL_SETTING).catch(() => null);
  if (chosen && isExtractionModel(chosen)) return { model: chosen, source: "setting" };
  return { model: fallback, source: "default" };
}
