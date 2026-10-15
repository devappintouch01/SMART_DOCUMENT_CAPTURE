import { randomUUID } from "node:crypto";
import type { DocumentListItem, DocumentType } from "@/domain/types";
import {
  extensionFor,
  validateBatchSize,
  validateFileMeta,
  type FileMeta,
} from "@/domain/upload-limits";
import type { AiReader, Store, UploadTarget } from "./ports";

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

// The only entry point pages and API routes use for Documents and Document
// Types. Tests drive it with the fakes in ./testing.
export function createDocumentService(deps: { store: Store; ai: AiReader }) {
  const { store } = deps;

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
    // file.
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
  };
}
