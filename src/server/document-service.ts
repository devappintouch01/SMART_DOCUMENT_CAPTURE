import { randomUUID } from "node:crypto";
import { applyCorrections, confirmFlags, type CorrectionInput, type FlagTarget } from "@/domain/corrections";
import {
  toExtractedValue,
  type ExtractedData,
  type ExtractedRow,
  type RawValue,
} from "@/domain/extracted-data";
import type {
  DocumentDetail,
  DocumentFilter,
  DocumentListItem,
  DocumentType,
  DocumentTypeSummary,
  FieldScope,
} from "@/domain/types";
import { validateDocumentTypeDraft } from "@/domain/document-type-rules";
import { DEMO_RESET_PHRASE, type DemoFixture, type DemoValue } from "@/domain/demo";
import { migrateExtractedData } from "@/domain/document-type-migration";
import {
  ACCEPTED_MIME_TYPES,
  extensionFor,
  validateBatchSize,
  validateFileMeta,
  type FileMeta,
} from "@/domain/upload-limits";
import { buildDocumentWorkbook, buildMultiWorkbook } from "./excel";
import {
  AiReaderError,
  type AiReader,
  type ClaimedDocument,
  type DocumentTypeProposal,
  type FieldInput,
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

// One first try plus three retries for transient failures (spec: Background
// processing). Index n is the wait after the (n+1)th failed attempt.
export const RETRY_DELAYS_MS = [10_000, 30_000, 90_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
// An Extraction still running after this long is treated as abandoned (its
// serverless invocation was cut off) and goes back to the queue.
export const ABANDONED_AFTER_MS = 5 * 60_000;

const GENERIC_FAILURE = "เกิดข้อผิดพลาดระหว่างอ่านเอกสาร";
export const NO_MATCHING_TYPE = "ไม่พบประเภทเอกสารที่ตรงกัน";

// What the upload page sends when the user picks "ให้ AI ตรวจให้".
export const AUTO_CLASSIFY = "auto";
const ABANDONED_FAILURE = "อ่านเอกสารนานผิดปกติ กรุณากดลองใหม่";

// A fixture's values as stored data, built the same way as an AI result so the
// example Documents carry normalised values and Review Flags.
function fixtureData(fixture: DemoFixture, type: DocumentType): ExtractedData {
  const toRaw = (value: DemoValue | undefined): RawValue => {
    if (value === undefined) return { value: null, flagReason: null };
    const text = typeof value === "string" ? value : value.v;
    const flag = typeof value === "string" ? null : (value.flag ?? null);
    return { value: text === "" ? null : text, flagReason: flag };
  };
  const row = (scope: FieldScope, values: Record<string, DemoValue>): ExtractedRow => {
    const known = new Set(type.fields.filter((f) => f.scope === scope).map((f) => f.name));
    for (const name of Object.keys(values)) {
      if (!known.has(name)) throw new Error(`fixture ${fixture.fileName}: no ${scope} Field "${name}"`);
    }
    return Object.fromEntries(
      type.fields
        .filter((f) => f.scope === scope)
        .map((f) => [f.id, toExtractedValue(f.kind, toRaw(values[f.name]))]),
    );
  };
  return {
    header: row("header", fixture.header),
    lineItems: fixture.lineItems.map((item) => row("line_item", item)),
  };
}

// The AI's draft, tidied so the editor never starts with blank, duplicate or
// out-of-range fields.
function cleanProposal(proposal: DocumentTypeProposal): DocumentTypeProposal {
  const kinds = ["text", "number", "date", "amount"];
  const seen = new Set<string>();
  const fields: FieldInput[] = [];
  for (const field of proposal.fields) {
    const name = field.name.trim().slice(0, 60);
    const key = `${field.scope}:${name.toLowerCase()}`;
    if (name === "" || seen.has(key)) continue;
    seen.add(key);
    fields.push({
      scope: field.scope === "line_item" ? "line_item" : "header",
      name,
      kind: kinds.includes(field.kind) ? field.kind : "text",
      description: field.description.trim().slice(0, 300),
    });
  }
  return { name: proposal.name.trim().slice(0, 80), fields: fields.slice(0, 60) };
}

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
  now?: () => Date;
}) {
  const { store, ai } = deps;
  const concurrency = deps.concurrency ?? DEFAULT_EXTRACTION_CONCURRENCY;
  const now = deps.now ?? (() => new Date());

  // A failed attempt either waits and goes back to the queue or, once the
  // attempts are used up, ends the Extraction as Failed.
  async function retryOrFail(id: string, attemptCount: number, reason: string) {
    if (attemptCount >= MAX_ATTEMPTS) {
      await store.failExtraction(id, reason);
      return;
    }
    const delay = RETRY_DELAYS_MS[Math.min(attemptCount, RETRY_DELAYS_MS.length) - 1];
    await store.requeueExtraction(id, new Date(now().getTime() + delay));
  }

  async function loadDone(id: string, action = "แก้ไข") {
    const document = await store.getDocument(id);
    if (!document || document.status !== "done" || !document.extractedData) {
      throw new UserFacingError(`${action}ได้เฉพาะเอกสารที่อ่านเสร็จแล้ว`);
    }
    const documentType = (await store.listDocumentTypes()).find((t) => t.id === document.documentTypeId);
    if (!documentType) throw new UserFacingError("ไม่พบประเภทเอกสาร");
    return { document, documentType };
  }

  async function reclaimAbandoned() {
    const cutoff = new Date(now().getTime() - ABANDONED_AFTER_MS);
    for (const stale of await store.listStaleExtractions(cutoff)) {
      await retryOrFail(stale.id, stale.attemptCount, ABANDONED_FAILURE);
    }
  }

  async function runExtraction(document: ClaimedDocument, types: DocumentType[]) {
    try {
      const bytes = await store.downloadFile(document.storagePath);
      const file = { bytes, mimeType: document.mimeType };

      // ADR 0003: a cheap Classification first, only when no type was chosen.
      // A retry after a later failure keeps the type already picked.
      let documentTypeId = document.documentTypeId;
      if (!documentTypeId) {
        const classified = await ai.classify(file, types);
        const match = types.find((t) => t.id === classified.documentTypeId);
        if (!match) {
          await store.failExtraction(document.id, `${NO_MATCHING_TYPE}: ${classified.reason}`);
          return;
        }
        await store.setClassifiedDocumentType(document.id, match.id);
        documentTypeId = match.id;
      }

      const documentType = types.find((t) => t.id === documentTypeId);
      if (!documentType) {
        await store.failExtraction(document.id, "ไม่พบประเภทเอกสาร");
        return;
      }
      const output = await ai.extract(file, documentType);
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
      if (!(error instanceof AiReaderError)) console.error(error);
      const reason = error instanceof AiReaderError ? error.userMessage : GENERIC_FAILURE;
      // Unknown errors (storage hiccups, network) are worth another try.
      const retryable = error instanceof AiReaderError ? error.retryable : true;
      if (retryable) await retryOrFail(document.id, document.attemptCount, reason);
      else await store.failExtraction(document.id, reason);
    }
  }

  return {
    // Puts a Failed Extraction back in the queue with a fresh set of attempts.
    // The caller then triggers processQueue in the background.
    async retryExtraction(id: string): Promise<void> {
      const requeued = await store.resetFailedExtraction(id);
      if (!requeued) throw new UserFacingError("ลองใหม่ได้เฉพาะเอกสารที่อ่านไม่สำเร็จ");
    },

    // Saves what the user changed on the result detail page. Changed values
    // become Corrections and settle their Review Flags; invalid values reject
    // the whole save with a Thai message per problem.
    async saveCorrections(id: string, input: CorrectionInput): Promise<void> {
      const { document, documentType } = await loadDone(id);
      const result = applyCorrections(document.extractedData!, documentType.fields, input);
      if (!result.ok) throw new UserFacingError(result.problems.join("\n"));
      await store.saveExtractedData(id, result.data);
    },

    // The Document as an Excel workbook, using Corrections where there are any.
    async exportDocument(id: string): Promise<{ fileName: string; bytes: Uint8Array }> {
      const { document, documentType } = await loadDone(id, "ส่งออก");
      const bytes = await buildDocumentWorkbook(documentType, document.extractedData!);
      const baseName = document.fileName.replace(/\.[^.]+$/, "") || "export";
      return { fileName: `${baseName}.xlsx`, bytes };
    },

    // Several Documents of one Document Type as a single workbook, oldest
    // upload first. Mixed types or Documents that are not done are refused.
    async exportDocuments(ids: string[]): Promise<{ fileName: string; bytes: Uint8Array }> {
      const unique = [...new Set(ids)];
      if (unique.length === 0) throw new UserFacingError("ยังไม่ได้เลือกเอกสาร");

      const loaded = await Promise.all(unique.map((id) => store.getDocument(id)));
      const documents = loaded.filter((d) => d !== null);
      if (documents.length !== unique.length) throw new UserFacingError("ไม่พบเอกสารบางใบที่เลือก");

      const notDone = documents.filter((d) => d.status !== "done" || !d.extractedData);
      if (notDone.length > 0) {
        throw new UserFacingError(`ส่งออกได้เฉพาะเอกสารที่อ่านเสร็จแล้ว (ยังไม่เสร็จ ${notDone.length} ใบ)`);
      }
      const typeIds = new Set(documents.map((d) => d.documentTypeId));
      if (typeIds.size > 1) {
        throw new UserFacingError("เลือกเอกสารที่เป็นประเภทเดียวกันเท่านั้น เพราะแต่ละประเภทมีคอลัมน์ไม่เหมือนกัน");
      }

      const documentType = (await store.listDocumentTypes()).find((t) => t.id === documents[0].documentTypeId);
      if (!documentType) throw new UserFacingError("ไม่พบประเภทเอกสาร");

      const ordered = [...documents].sort(
        (a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime() || a.id.localeCompare(b.id),
      );
      const bytes = await buildMultiWorkbook(
        documentType,
        ordered.map((d) => ({ fileName: d.fileName, data: d.extractedData! })),
      );
      return { fileName: `${documentType.name}_${ordered.length}ใบ.xlsx`, bytes };
    },

    // Removes Documents together with their stored files. Safe to call for ids
    // that are already gone.
    async deleteDocuments(ids: string[]): Promise<{ deleted: number }> {
      if (ids.length === 0) throw new UserFacingError("ยังไม่ได้เลือกเอกสาร");
      return { deleted: await store.deleteDocuments(ids) };
    },

    // Marks Review Flags as checked without changing the values.
    async confirmReviewFlags(id: string, targets: FlagTarget[]): Promise<void> {
      const { document } = await loadDone(id);
      await store.saveExtractedData(id, confirmFlags(document.extractedData!, targets));
    },

    // Re-runs the Extraction, optionally with a different Document Type
    // (AUTO_CLASSIFY asks the AI to choose again). Replaces every value,
    // Corrections included. The caller then triggers processQueue.
    async rerunExtraction(id: string, documentTypeId: string): Promise<void> {
      let typeId: string | null = null;
      if (documentTypeId !== AUTO_CLASSIFY) {
        const types = await store.listDocumentTypes();
        if (!types.some((t) => t.id === documentTypeId)) {
          throw new UserFacingError("ไม่พบประเภทเอกสารที่เลือก");
        }
        typeId = documentTypeId;
      }
      const requeued = await store.requeueForRerun(id, typeId);
      if (!requeued) throw new UserFacingError("เอกสารนี้กำลังอ่านอยู่ รอให้เสร็จก่อนจึงอ่านใหม่ได้");
    },

    async listDocumentTypes(): Promise<DocumentType[]> {
      return store.listDocumentTypes();
    },

    async listDocumentTypesWithCounts(): Promise<DocumentTypeSummary[]> {
      const [types, counts] = await Promise.all([store.listDocumentTypes(), store.countDocumentsByType()]);
      return types.map((type) => ({ ...type, documentCount: counts[type.id] ?? 0 }));
    },

    // Renames a Document Type and changes its Fields. Documents already read are
    // brought in line: values of deleted Fields are dropped everywhere, values of
    // a Field whose kind changed are re-read as the new kind, and renamed or new
    // Fields keep working because values are keyed by Field id.
    async updateDocumentType(id: string, input: { name: string; fields: FieldInput[] }): Promise<void> {
      const types = await store.listDocumentTypes();
      const type = types.find((t) => t.id === id);
      if (!type) throw new UserFacingError("ไม่พบประเภทเอกสาร");

      const problems = validateDocumentTypeDraft(
        input.name,
        input.fields,
        types.filter((t) => t.id !== id).map((t) => t.name),
      );
      for (const field of input.fields) {
        if (!field.id) continue;
        const existing = type.fields.find((f) => f.id === field.id);
        if (!existing) problems.push(`ช่อง "${field.name}" ไม่ได้อยู่ในประเภทนี้`);
        else if (existing.scope !== field.scope) problems.push(`ย้ายช่อง "${existing.name}" ข้ามกลุ่มไม่ได้ ให้ลบแล้วเพิ่มช่องใหม่`);
      }
      if (problems.length > 0) throw new UserFacingError(problems.join("\n"));

      const keptIds = new Set(input.fields.flatMap((f) => (f.id ? [f.id] : [])));
      const changes = {
        removedFieldIds: new Set(type.fields.filter((f) => !keptIds.has(f.id)).map((f) => f.id)),
        kindChanges: new Map(
          input.fields.flatMap((f) => {
            const existing = f.id ? type.fields.find((x) => x.id === f.id) : undefined;
            return existing && existing.kind !== f.kind ? [[existing.id, f.kind] as const] : [];
          }),
        ),
      };

      await store.updateDocumentType(id, {
        name: input.name.trim(),
        fields: input.fields.map((f) => ({ ...f, name: f.name.trim(), description: f.description.trim() })),
      });

      if (changes.removedFieldIds.size > 0 || changes.kindChanges.size > 0) {
        for (const document of await store.listExtractedData(id)) {
          const migrated = migrateExtractedData(document.extractedData, changes);
          if (migrated.changed) await store.saveExtractedData(document.id, migrated.data);
        }
      }
    },

    // Returns the app to a clean demo state: every Document and every
    // non-seeded Document Type is deleted, the seeded types get their original
    // Fields back, and each fixture is loaded as a finished Document. The AI is
    // never called. Fixtures are checked before anything is deleted.
    async resetDemoData(input: {
      confirmation: string;
      seedTypes: DocumentType[];
      fixtures: DemoFixture[];
    }): Promise<{ loaded: number }> {
      if (input.confirmation.trim() !== DEMO_RESET_PHRASE) {
        throw new UserFacingError(`พิมพ์คำว่า "${DEMO_RESET_PHRASE}" เพื่อยืนยัน`);
      }

      const prepared = input.fixtures.map((fixture) => {
        const type = input.seedTypes.find((t) => t.name === fixture.documentType);
        if (!type) throw new Error(`fixture ${fixture.fileName}: unknown Document Type ${fixture.documentType}`);
        return { fixture, type, data: fixtureData(fixture, type) };
      });

      await store.deleteAllDocuments();
      await store.deleteNonSeedDocumentTypes();
      await store.restoreSeedDocumentTypes(input.seedTypes);

      // The first fixture ends up newest, so the list opens with it on top.
      const now = Date.now();
      for (const [index, { fixture, type, data }] of prepared.entries()) {
        const storagePath = `demo-${randomUUID()}.${extensionFor(fixture.mimeType)}`;
        await store.uploadFile(storagePath, fixture.bytes, fixture.mimeType);
        await store.insertCompletedDocument({
          fileName: fixture.fileName,
          storagePath,
          mimeType: fixture.mimeType,
          pageCount: fixture.pageCount,
          requestedDocumentTypeId: type.id,
          documentTypeId: type.id,
          extractedData: data,
          uploadedAt: new Date(now - index * 60_000),
        });
      }
      return { loaded: prepared.length };
    },

    // Deletes a Document Type nobody uses; one with Documents is refused.
    async deleteDocumentType(id: string): Promise<void> {
      const types = await store.listDocumentTypes();
      if (!types.some((t) => t.id === id)) throw new UserFacingError("ไม่พบประเภทเอกสาร");
      const inUse = (await store.countDocumentsByType())[id] ?? 0;
      if (inUse > 0) {
        throw new UserFacingError(
          `ลบไม่ได้ ยังมีเอกสาร ${inUse} ใบใช้ประเภทนี้อยู่ ลบหรือเปลี่ยนประเภทของเอกสารเหล่านั้นก่อน`,
        );
      }
      await store.deleteDocumentType(id);
    },

    // A short-lived URL for viewing a stored file, or null if it cannot be made.
    async fileUrl(storagePath: string): Promise<string | null> {
      return (await store.createSignedUrls([storagePath]))[storagePath] ?? null;
    },

    // Asks the AI to draft a name and Fields from a Sample Document the browser
    // has already uploaded. Nothing is saved; the user edits the draft first.
    async proposeDocumentType(input: { storagePath: string; mimeType: string }): Promise<DocumentTypeProposal> {
      if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
        throw new UserFacingError("รองรับเฉพาะไฟล์ PDF, JPG, PNG และ WebP");
      }
      try {
        const bytes = await store.downloadFile(input.storagePath);
        return cleanProposal(await ai.proposeDocumentType({ bytes, mimeType: input.mimeType }));
      } catch (error) {
        if (error instanceof AiReaderError) throw new UserFacingError(error.userMessage);
        console.error(error);
        throw new UserFacingError("ให้ AI ร่างช่องจากเอกสารตัวอย่างไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    },

    // Saves a new Document Type. When it came from a Sample Document, that file
    // becomes the first Document of the type and starts its Extraction (the
    // caller triggers processQueue).
    async createDocumentType(input: {
      name: string;
      fields: FieldInput[];
      sample: RegisteredFile | null;
    }): Promise<{ documentTypeId: string; documentId: string | null }> {
      const existing = await store.listDocumentTypes();
      const problems = validateDocumentTypeDraft(
        input.name,
        input.fields,
        existing.map((t) => t.name),
      );
      if (problems.length > 0) throw new UserFacingError(problems.join("\n"));

      const documentTypeId = await store.createDocumentType({
        name: input.name.trim(),
        fields: input.fields.map((f) => ({
          scope: f.scope,
          name: f.name.trim(),
          kind: f.kind,
          description: f.description.trim(),
        })),
      });

      let documentId: string | null = null;
      if (input.sample) {
        [documentId] = await store.insertDocuments([
          {
            fileName: input.sample.fileName,
            storagePath: input.sample.storagePath,
            mimeType: input.sample.mimeType,
            pageCount: input.sample.pageCount,
            requestedDocumentTypeId: documentTypeId,
            documentTypeId,
          },
        ]);
      }
      return { documentTypeId, documentId };
    },

    async listDocuments(filter: DocumentFilter = {}): Promise<DocumentListItem[]> {
      const search = filter.search?.trim().normalize("NFC").toLowerCase();
      const documents = [...(await store.listDocuments())]
        .filter((d) => !filter.documentTypeId || d.documentTypeId === filter.documentTypeId)
        .filter((d) => !filter.status || d.status === filter.status)
        .filter((d) => !search || d.fileName.normalize("NFC").toLowerCase().includes(search))
        .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
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

      const auto = input.documentTypeId === AUTO_CLASSIFY;
      if (!auto) {
        const types = await store.listDocumentTypes();
        if (!types.some((t) => t.id === input.documentTypeId)) {
          throw new UserFacingError("ไม่พบประเภทเอกสารที่เลือก");
        }
      }
      const typeId = auto ? null : input.documentTypeId;

      const documentIds = await store.insertDocuments(
        input.files.map((file) => ({
          fileName: file.fileName,
          storagePath: file.storagePath,
          mimeType: file.mimeType,
          pageCount: file.pageCount,
          requestedDocumentTypeId: typeId,
          documentTypeId: typeId,
        })),
      );
      return { documentIds };
    },

    // Runs Extractions until nothing claimable is left. Safe to call from
    // several places at once: the Store hands each Document to one caller.
    async processQueue(): Promise<void> {
      await reclaimAbandoned();
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
