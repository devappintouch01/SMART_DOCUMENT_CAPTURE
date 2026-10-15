import { randomUUID } from "node:crypto";
import {
  toExtractedValue,
  type ExtractedData,
  type ExtractedRow,
  type RawValue,
} from "@/domain/extracted-data";
import type {
  DocumentDetail,
  DocumentListItem,
  DocumentType,
  FieldScope,
} from "@/domain/types";
import {
  extensionFor,
  validateBatchSize,
  validateFileMeta,
  type FileMeta,
} from "@/domain/upload-limits";
import {
  AiReaderError,
  type AiReader,
  type ClaimedDocument,
  type Store,
  type UploadTarget,
} from "./ports";

export type DocumentService = ReturnType<typeof createDocumentService>;

// Thrown when the caller sent something the user can fix; the message is Thai
// and safe to show.
export class UserFacingError extends Error {}

export type RegisteredFile = {
  storagePath: string;
  fileName: string;
  mimeType: string;
  pageCount: number;
};

export const DEFAULT_EXTRACTION_CONCURRENCY = 4;

const GENERIC_FAILURE = "เกิดข้อผิดพลาดระหว่างอ่านเอกสาร";

function toRows(
  documentType: DocumentType,
  scope: FieldScope,
  rows: Record<string, RawValue>[],
): ExtractedRow[] {
  const fields = documentType.fields.filter((f) => f.scope === scope);
  return rows.map((row) =>
    Object.fromEntries(
      fields.map((field) => [
        field.id,
        toExtractedValue(field.kind, row[field.id] ?? { value: null, flagReason: null }),
      ]),
    ),
  );
}

// The only entry point pages and API routes use for Documents and Document
// Types. Tests drive it with the fakes in ./testing.
export function createDocumentService(deps: {
  store: Store;
  ai: AiReader;
  concurrency?: number;
}) {
  const { store, ai } = deps;
  const concurrency = deps.concurrency ?? DEFAULT_EXTRACTION_CONCURRENCY;

  async function runExtraction(document: ClaimedDocument, types: DocumentType[]) {
    const documentType = types.find((t) => t.id === document.documentTypeId);
    if (!documentType) {
      await store.failExtraction(document.id, "ไม่พบประเภทเอกสาร");
      return;
    }

    try {
      const bytes = await store.downloadFile(document.storagePath);
      const output = await ai.extract({ bytes, mimeType: document.mimeType }, documentType);
      if (output.kind === "unreadable") {
        await store.failExtraction(document.id, output.reason);
        return;
      }
      const data: ExtractedData = {
        header: toRows(documentType, "header", [output.header])[0],
        lineItems: toRows(documentType, "line_item", output.lineItems),
      };
      await store.completeExtraction(document.id, data);
    } catch (error) {
      // Retrying transient failures arrives with ticket 04.
      if (!(error instanceof AiReaderError)) console.error(error);
      const reason = error instanceof AiReaderError ? error.userMessage : GENERIC_FAILURE;
      await store.failExtraction(document.id, reason);
    }
  }

  return {
    async listDocumentTypes(): Promise<DocumentType[]> {
      return store.listDocumentTypes();
    },

    async listDocuments(): Promise<DocumentListItem[]> {
      const documents = [...(await store.listDocuments())].sort(
        (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
      );
      const imagePaths = documents
        .filter((d) => d.mimeType.startsWith("image/"))
        .map((d) => d.storagePath);
      const urls = imagePaths.length ? await store.createSignedUrls(imagePaths) : {};
      return documents.map((d) => ({ ...d, previewUrl: urls[d.storagePath] ?? null }));
    },

    async getDocument(id: string): Promise<DocumentDetail | null> {
      const document = await store.getDocument(id);
      if (!document) return null;
      const [types, urls] = await Promise.all([
        store.listDocumentTypes(),
        store.createSignedUrls([document.storagePath]),
      ]);
      return {
        ...document,
        documentType: types.find((t) => t.id === document.documentTypeId) ?? null,
        fileUrl: urls[document.storagePath] ?? null,
      };
    },

    // Step 1 of an upload: check the batch and hand out one signed upload
    // target per file, in the same order.
    async requestUploads(files: FileMeta[]): Promise<UploadTarget[]> {
      const batchProblem = validateBatchSize(files.length);
      if (batchProblem) throw new UserFacingError(batchProblem);

      for (const file of files) {
        const problem = validateFileMeta(file);
        if (problem) throw new UserFacingError(`${file.fileName}: ${problem}`);
      }

      return Promise.all(
        files.map((file) =>
          // Storage keys stay ASCII; the real name lives on the Document.
          store.createUploadTarget(`${randomUUID()}.${extensionFor(file.mimeType)}`),
        ),
      );
    },

    // Step 2: the browser finished uploading; create one Queued Document per
    // file. The caller then triggers processQueue in the background.
    async registerUploads(input: {
      documentTypeId: string;
      files: RegisteredFile[];
    }): Promise<{ documentIds: string[] }> {
      const batchProblem = validateBatchSize(input.files.length);
      if (batchProblem) throw new UserFacingError(batchProblem);

      const types = await store.listDocumentTypes();
      if (!types.some((t) => t.id === input.documentTypeId)) {
        throw new UserFacingError("ไม่พบประเภทเอกสารที่เลือก");
      }

      const documentIds = await store.insertDocuments(
        input.files.map((file) => ({
          fileName: file.fileName,
          storagePath: file.storagePath,
          mimeType: file.mimeType,
          pageCount: file.pageCount,
          requestedDocumentTypeId: input.documentTypeId,
          documentTypeId: input.documentTypeId,
        })),
      );
      return { documentIds };
    },

    // Runs Extractions until nothing claimable is left. Safe to call from
    // several places at once: the Store hands each Document to one caller.
    async processQueue(): Promise<void> {
      let types: DocumentType[] | null = null;
      for (;;) {
        const claimed = await store.claimQueuedDocuments(concurrency);
        if (claimed.length === 0) return;
        types ??= await store.listDocumentTypes();
        const knownTypes = types;
        await Promise.all(claimed.map((document) => runExtraction(document, knownTypes)));
      }
    },
  };
}
