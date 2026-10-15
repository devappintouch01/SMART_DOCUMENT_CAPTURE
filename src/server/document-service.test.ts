import { describe, expect, it } from "vitest";
import type { DocumentSummary } from "@/domain/types";
import { createDocumentService } from "./document-service";
import { FakeAiReader } from "./testing/fake-ai-reader";
import { InMemoryStore } from "./testing/in-memory-store";

function setup() {
  const store = new InMemoryStore();
  const service = createDocumentService({ store, ai: new FakeAiReader() });
  return { store, service };
}

function document(overrides: Partial<DocumentSummary>): DocumentSummary {
  return {
    id: "doc",
    fileName: "inv_001.pdf",
    mimeType: "application/pdf",
    documentTypeId: null,
    documentTypeName: null,
    status: "queued",
    failureReason: null,
    openReviewFlagCount: 0,
    uploadedAt: new Date("2026-10-15T08:00:00Z"),
    ...overrides,
  };
}

describe("listDocuments", () => {
  it("returns an empty list when nothing has been uploaded", async () => {
    const { service } = setup();
    expect(await service.listDocuments()).toEqual([]);
  });

  it("lists the newest upload first", async () => {
    const { store, service } = setup();
    store.documents = [
      document({ id: "old", uploadedAt: new Date("2026-10-14T08:00:00Z") }),
      document({ id: "new", uploadedAt: new Date("2026-10-15T08:00:00Z") }),
    ];

    const ids = (await service.listDocuments()).map((d) => d.id);

    expect(ids).toEqual(["new", "old"]);
  });
});
