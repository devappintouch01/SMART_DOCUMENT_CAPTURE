// What one call to an AI model cost and how long it took, and the roll-up the
// superadmin report shows. Money is stored in USD and shown in baht at a fixed
// rate (the exchange rate is a setting, not a live lookup).

export const USD_TO_THB = 35;
// The aim: reading one Document should cost no more than this (baht).
export const TARGET_BAHT_PER_DOCUMENT = 0.5;

export type AiOperation = "classify" | "extract" | "propose";

export type AiCall = {
  id: string;
  // Null for a call not tied to a Document, or whose Document was deleted.
  documentId: string | null;
  operation: AiOperation;
  provider: string;
  model: string;
  startedAt: Date;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  status: "ok" | "error";
  error: string | null;
  // Filled in afterwards for old Documents: the model is assumed, tokens, cost
  // and time are unknown.
  isLegacy: boolean;
};

export type NewAiCall = Omit<AiCall, "id" | "isLegacy">;

export function toBaht(usd: number): number {
  return usd * USD_TO_THB;
}

export type ModelUsage = {
  provider: string;
  model: string;
  calls: number;
  failedCalls: number;
  // Calls with real measurements (not legacy rows).
  measuredCalls: number;
  documents: number;
  totalCostUsd: number;
  // Average cost of everything spent on one Document (classify + extract + retries).
  avgCostPerDocumentUsd: number | null;
  // Average API time of a successful extract call.
  avgExtractMs: number | null;
};

const average = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

// What the superadmin sees on a result list row: what reading the Document cost
// in total and which model did the reading (the latest successful extract call,
// else the latest call of any kind).
export type DocumentAiSummary = { costUsd: number | null; model: string | null };

export function summarizeByDocument(calls: AiCall[]): Record<string, DocumentAiSummary> {
  const byDocument = new Map<string, AiCall[]>();
  for (const call of calls) {
    if (call.documentId) byDocument.set(call.documentId, [...(byDocument.get(call.documentId) ?? []), call]);
  }
  const result: Record<string, DocumentAiSummary> = {};
  for (const [documentId, group] of byDocument) {
    const newestFirst = [...group].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const reader = newestFirst.find((c) => c.operation === "extract" && c.status === "ok") ?? newestFirst[0];
    const measured = group.filter((c) => c.costUsd !== null);
    result[documentId] = {
      costUsd: measured.length > 0 ? measured.reduce((sum, c) => sum + (c.costUsd ?? 0), 0) : null,
      model: reader?.model ?? null,
    };
  }
  return result;
}

// Average cost of reading one Document across every model, counting only
// Documents with a measured cost. Null when nothing has been measured yet.
export function averageCostPerDocument(calls: AiCall[]): number | null {
  const byDocument = new Map<string, number>();
  for (const call of calls) {
    if (call.documentId && call.costUsd !== null) {
      byDocument.set(call.documentId, (byDocument.get(call.documentId) ?? 0) + call.costUsd);
    }
  }
  return average([...byDocument.values()]);
}

// One row per provider + model, most calls first.
export function summarizeAiCalls(calls: AiCall[]): ModelUsage[] {
  const groups = new Map<string, AiCall[]>();
  for (const call of calls) {
    const key = `${call.provider}\u0000${call.model}`;
    groups.set(key, [...(groups.get(key) ?? []), call]);
  }

  return [...groups.values()]
    .map((group) => {
      const costByDocument = new Map<string, number>();
      for (const call of group) {
        if (call.documentId && call.costUsd !== null) {
          costByDocument.set(call.documentId, (costByDocument.get(call.documentId) ?? 0) + call.costUsd);
        }
      }
      return {
        provider: group[0].provider,
        model: group[0].model,
        calls: group.length,
        failedCalls: group.filter((c) => c.status === "error").length,
        measuredCalls: group.filter((c) => !c.isLegacy).length,
        documents: new Set(group.flatMap((c) => (c.documentId ? [c.documentId] : []))).size,
        totalCostUsd: group.reduce((sum, c) => sum + (c.costUsd ?? 0), 0),
        avgCostPerDocumentUsd: average([...costByDocument.values()]),
        avgExtractMs: average(
          group.flatMap((c) => (c.operation === "extract" && c.status === "ok" && c.durationMs !== null ? [c.durationMs] : [])),
        ),
      };
    })
    .sort((a, b) => b.calls - a.calls);
}
