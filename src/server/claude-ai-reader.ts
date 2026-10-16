import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { priceFor } from "@/domain/ai-models";
import type { NewAiCall } from "@/domain/ai-usage";
import type { RawValue } from "@/domain/extracted-data";
import type { DocumentType, Field, FieldKind, FieldScope } from "@/domain/types";
import {
  AiReaderError,
  type AiCallContext,
  type AiReader,
  type ClassificationOutput,
  type DocumentFile,
  type DocumentTypeProposal,
  type ExtractionOutput,
} from "./ports";

// ADR 0001: one multimodal call reads the Document and returns its Fields.
export const DEFAULT_EXTRACTION_MODEL = "claude-opus-5-5";
// ADR 0003: a cheaper model picks the Document Type first.
export const DEFAULT_CLASSIFICATION_MODEL = "claude-haiku-5-5";

const CLASSIFY_SYSTEM_PROMPT = `You sort scanned and photographed Thai business documents into the Document Types you are given. Pick the one Document Type this document is. Each Document Type is described by its name and the fields it records; a document matches when it is that kind of document, whatever its layout or vendor. A combined "ใบกำกับภาษี/ใบเสร็จรับเงิน" is a tax invoice when a Tax Invoice type is offered. If none of the Document Types fits, answer "none". Give a short reason in Thai.`;

const KIND_HINTS: Record<FieldKind, string> = {
  text: "text exactly as written on the document, on one line",
  long_text: "text exactly as written, which may span several lines; keep each line break as a newline character",
  number: "a plain number such as 12 or 3.5, without separators or units",
  amount: "a plain decimal money amount such as 1070.00, without commas, currency or the word บาท",
  date: "an ISO date YYYY-MM-DD in the Gregorian (Common Era) calendar",
};

export const SYSTEM_PROMPT = `You read scanned and photographed Thai business documents (receipts, tax invoices, goods requisitions and similar A4 accounting documents) and return the requested fields as JSON.

Rules:
- Return each field's value as described in its schema description. If a field does not appear on the document, return an empty string for its value.
- Dates: Thai documents usually use the Buddhist Era (พ.ศ.). Convert to the Gregorian year by subtracting 543. A two-digit year is always a Buddhist Era year: "15/10/69" means 15 October 2569 BE, which is 2026-10-15. Thai month names and abbreviations (ม.ค., ก.พ., ... ธ.ค.) are months 1-12.
- Amounts and numbers: plain decimals only, no thousands separators, currency symbols or words.
- line_items: one entry per row of the document's item table, top to bottom. Skip subtotal, VAT and total rows; those belong in the header fields. Return an empty array when the document has no item table.
- When you are unsure of a value (unclear handwriting, smudged or cut-off text, two plausible readings), still give your best reading and set flag_reason to a short reason in Thai, for example "ลายมือไม่ชัด" or "ตัวเลขถูกตัดขอบ". Otherwise flag_reason is an empty string.
- Set readable to false only when the document as a whole cannot be read (blank, far too blurry, not a document). Then give unreadable_reason in Thai; otherwise it is an empty string.`;

// Plain strings, never nullable: the API caps union-typed (nullable)
// parameters at 16 per schema, and a Document Type easily has more Fields.
// An empty string means "absent".
const text = { type: "string" };

const valueSchema = (field: Field) => ({
  type: "object",
  description: `${field.name}${field.description ? ` — ${field.description}` : ""}. Value: ${KIND_HINTS[field.kind]}.`,
  properties: { value: text, flag_reason: text },
  required: ["value", "flag_reason"],
  additionalProperties: false,
});

// Schema keys are short positional names (h0, l0, ...) so field names never
// have to be valid JSON keys; the description carries the real name.
export function buildSchema(documentType: DocumentType) {
  const header = documentType.fields.filter((f) => f.scope === "header");
  const lines = documentType.fields.filter((f) => f.scope === "line_item");
  const object = (fields: Field[], prefix: string) => ({
    type: "object",
    properties: Object.fromEntries(fields.map((f, i) => [`${prefix}${i}`, valueSchema(f)])),
    required: fields.map((_, i) => `${prefix}${i}`),
    additionalProperties: false,
  });

  return {
    schema: {
      type: "object",
      properties: {
        readable: { type: "boolean" },
        unreadable_reason: text,
        header: object(header, "h"),
        line_items: { type: "array", items: object(lines, "l") },
      },
      required: ["readable", "unreadable_reason", "header", "line_items"],
      additionalProperties: false,
    },
    header,
    lines,
  };
}

export type ModelValue = { value: string; flag_reason: string };
export type ModelOutput = {
  readable: boolean;
  unreadable_reason: string;
  header: Record<string, ModelValue>;
  line_items: Record<string, ModelValue>[];
};

export function mapRow(row: Record<string, ModelValue>, fields: Field[], prefix: string) {
  const mapped: Record<string, RawValue> = {};
  fields.forEach((field, i) => {
    const item = row[`${prefix}${i}`];
    mapped[field.id] = {
      value: item?.value?.trim() || null,
      flagReason: item?.flag_reason?.trim() || null,
    };
  });
  return mapped;
}

function documentBlock(file: DocumentFile): Anthropic.Beta.BetaContentBlockParam {
  const data = Buffer.from(file.bytes).toString("base64");
  if (file.mimeType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: file.mimeType as "image/jpeg" | "image/png" | "image/webp",
      data,
    },
  };
}

export function toReaderError(error: unknown): AiReaderError {
  if (error instanceof AiReaderError) return error;
  // The API reports an empty balance as a plain 400, which would otherwise read
  // as "bad file". Retrying cannot help until credit is added.
  if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(error.message)) {
    return new AiReaderError(
      false,
      "เครดิต Anthropic หมด เติมเงินที่ console.anthropic.com แล้วกดลองใหม่",
      { cause: error },
    );
  }
  if (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError ||
    (error instanceof Anthropic.APIError && (error.status === 529 || error.status === 408))
  ) {
    return new AiReaderError(true, "บริการ AI ไม่ว่างชั่วคราว", { cause: error });
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiReaderError(false, "ตั้งค่า API key ของ AI ไม่ถูกต้อง", { cause: error });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AiReaderError(false, "AI รับไฟล์นี้ไม่ได้ (ไฟล์อาจเสียหาย)", { cause: error });
  }
  return new AiReaderError(false, "เกิดข้อผิดพลาดระหว่างเรียก AI", { cause: error });
}

function estimateUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = priceFor(model);
  return price ? (inputTokens * price[0] + outputTokens * price[1]) / 1_000_000 : null;
}

// One log line per AI call: what it cost in tokens and roughly in dollars, so a
// month's spend can be added up from the logs (search for "[ai-usage]").
function logUsage(operation: string, response: Anthropic.Beta.BetaMessage) {
  const input = response.usage.input_tokens;
  const output = response.usage.output_tokens;
  const usd = estimateUsd(response.model, input, output);
  console.info(
    `[ai-usage] ${JSON.stringify({ operation, model: response.model, inputTokens: input, outputTokens: output, estimatedUsd: usd === null ? null : Number(usd.toFixed(5)) })}`,
  );
}

function responseText(response: Anthropic.Beta.BetaMessage, operation: string): string {
  logUsage(operation, response);
  if (response.stop_reason === "refusal") {
    throw new AiReaderError(false, "AI ปฏิเสธการอ่านเอกสารนี้");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AiReaderError(false, "เอกสารยาวเกินกว่าที่ AI อ่านได้ในครั้งเดียว");
  }
  return response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new AiReaderError(true, "AI ตอบกลับในรูปแบบที่อ่านไม่ได้", { cause: error });
  }
}

const PROPOSE_SYSTEM_PROMPT = `You help set up a new Document Type for reading Thai business documents. You are given one example document. Propose a name and the fields worth extracting.

Rules:
- name: the kind of document in Thai as people call it, for example "ใบวางบิล" or "ใบสั่งซื้อ". Not the vendor or the file name.
- Header fields are values that appear once on the document (document number, dates, parties, tax IDs, totals, notes). Line item fields are the columns of the item table, one value per row. If the document has no item table, give no line item fields.
- Use the field names as printed on the document, in Thai where the document is Thai. Keep them short.
- kind is one of: text (short words, codes, ids, names, phone numbers, tax ids), long_text (values that run over several lines: notes and remarks, addresses, long item descriptions, payment terms), number (quantities), date, amount (money). Tax ids and phone numbers are text, not number. Use long_text only where the document actually shows several lines.
- description: one short Thai sentence saying exactly which value to read, especially where the document shows several similar values (for example which of the totals). Mention the unit or format when it matters.
- Aim for the fields an accountant would actually copy into a spreadsheet: usually 6-15 header fields and 3-8 line item fields. Do not invent fields that are not on the document.`;

const proposeSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    header_fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["text", "long_text", "number", "date", "amount"] },
          description: { type: "string" },
        },
        required: ["name", "kind", "description"],
        additionalProperties: false,
      },
    },
    line_item_fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["text", "long_text", "number", "date", "amount"] },
          description: { type: "string" },
        },
        required: ["name", "kind", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["name", "header_fields", "line_item_fields"],
  additionalProperties: false,
};

type ProposalOutput = {
  name: string;
  header_fields: { name: string; kind: FieldKind; description: string }[];
  line_item_fields: { name: string; kind: FieldKind; description: string }[];
};

export class ClaudeAiReader implements AiReader {
  constructor(
    private readonly client = new Anthropic(),
    // A model id, or a function that looks it up on every call (the superadmin can change it).
    private readonly model: string | (() => Promise<string>) = process.env.AI_EXTRACTION_MODEL || DEFAULT_EXTRACTION_MODEL,
    private readonly classificationModel = process.env.AI_CLASSIFICATION_MODEL ||
      DEFAULT_CLASSIFICATION_MODEL,
    // Where each call is written down (the AI call log); optional.
    private readonly record?: (call: NewAiCall) => Promise<void>,
  ) {}

  private async currentModel(): Promise<string> {
    return typeof this.model === "function" ? this.model() : this.model;
  }

  // Runs one API call, times it and writes it to the call log. A failure to log
  // must never fail the reading itself.
  private async traced(
    operation: NewAiCall["operation"],
    requestedModel: string,
    context: AiCallContext,
    run: () => Promise<Anthropic.Beta.BetaMessage>,
  ): Promise<Anthropic.Beta.BetaMessage> {
    const startedAt = new Date();
    const began = performance.now();
    const write = async (call: Partial<NewAiCall> & Pick<NewAiCall, "model" | "status">) => {
      try {
        await this.record?.({
          documentId: context.documentId ?? null,
          operation,
          provider: "anthropic",
          startedAt,
          durationMs: Math.round(performance.now() - began),
          inputTokens: null,
          outputTokens: null,
          costUsd: null,
          error: null,
          ...call,
        });
      } catch (error) {
        console.error("could not write the AI call log", error);
      }
    };

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await run();
    } catch (error) {
      const readerError = toReaderError(error);
      await write({ model: requestedModel, status: "error", error: readerError.userMessage });
      throw readerError;
    }
    const { input_tokens: input, output_tokens: output } = response.usage;
    await write({
      model: response.model,
      status: "ok",
      inputTokens: input,
      outputTokens: output,
      costUsd: estimateUsd(response.model, input, output),
    });
    return response;
  }

  async proposeDocumentType(file: DocumentFile, context: AiCallContext = {}): Promise<DocumentTypeProposal> {
    const model = await this.currentModel();
    const response = await this.traced("propose", model, context, () =>
      this.client.beta.messages.create({
        model,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema: proposeSchema } },
        system: PROPOSE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [documentBlock(file), { type: "text", text: "Propose the Document Type for this document." }],
          },
        ],
      }),
    );

    const output = parseJson<ProposalOutput>(responseText(response, "propose"));
    const toField = (scope: FieldScope) => (f: ProposalOutput["header_fields"][number]) => ({
      scope,
      name: f.name,
      kind: f.kind,
      description: f.description,
    });
    return {
      name: output.name,
      fields: [
        ...(output.header_fields ?? []).map(toField("header")),
        ...(output.line_item_fields ?? []).map(toField("line_item")),
      ],
    };
  }

  async classify(
    file: DocumentFile,
    documentTypes: DocumentType[],
    context: AiCallContext = {},
  ): Promise<ClassificationOutput> {
    // Positional keys keep the enum short and free of names the schema
    // compiler might reject.
    const keys = documentTypes.map((_, i) => `t${i}`);
    const catalog = documentTypes
      .map((type, i) => {
        const fields = type.fields.filter((f) => f.scope === "header").map((f) => f.name);
        return `- ${keys[i]}: ${type.name} (fields: ${fields.join(", ")})`;
      })
      .join("\n");

    // No server-side fallbacks: Haiku has none, and a refusal here is rare.
    const response = await this.traced("classify", this.classificationModel, context, () =>
      this.client.beta.messages.create({
        model: this.classificationModel,
        max_tokens: 4000,
        output_config: {
          effort: "low",
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                document_type: { type: "string", enum: [...keys, "none"] },
                reason: { type: "string" },
              },
              required: ["document_type", "reason"],
              additionalProperties: false,
            },
          },
        },
        system: CLASSIFY_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              documentBlock(file),
              {
                type: "text",
                text: `Document Types:\n${catalog}\n\nWhich one is this document?`,
              },
            ],
          },
        ],
      }),
    );

    const output = parseJson<{ document_type: string; reason: string }>(responseText(response, "classify"));
    const index = keys.indexOf(output.document_type);
    return {
      documentTypeId: index >= 0 ? documentTypes[index].id : null,
      reason: output.reason?.trim() || "ไม่ตรงกับประเภทเอกสารใดเลย",
    };
  }

  async extract(
    file: DocumentFile,
    documentType: DocumentType,
    context: AiCallContext = {},
  ): Promise<ExtractionOutput> {
    const { schema, header, lines } = buildSchema(documentType);

    const model = await this.currentModel();
    const response = await this.traced("extract", model, context, () =>
      this.client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema } },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              documentBlock(file),
              {
                type: "text",
                text: `This document should be a "${documentType.name}". Extract its fields.`,
              },
            ],
          },
        ],
      }),
    );

    const output = parseJson<ModelOutput>(responseText(response, "extract"));

    if (!output.readable) {
      return { kind: "unreadable", reason: output.unreadable_reason || "อ่านเอกสารไม่ได้" };
    }
    return {
      kind: "extracted",
      header: mapRow(output.header ?? {}, header, "h"),
      lineItems: (output.line_items ?? []).map((row) => mapRow(row, lines, "l")),
    };
  }
}
