import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { RawValue } from "@/domain/extracted-data";
import type { DocumentType, Field, FieldKind } from "@/domain/types";
import {
  AiReaderError,
  type AiReader,
  type DocumentFile,
  type ExtractionOutput,
} from "./ports";

// ADR 0001: one multimodal call reads the Document and returns its Fields.
export const DEFAULT_EXTRACTION_MODEL = "claude-opus-5-5";

const KIND_HINTS: Record<FieldKind, string> = {
  text: "text exactly as written on the document",
  number: "a plain number such as 12 or 3.5, without separators or units",
  amount: "a plain decimal money amount such as 1070.00, without commas, currency or the word บาท",
  date: "an ISO date YYYY-MM-DD in the Gregorian (Common Era) calendar",
};

const SYSTEM_PROMPT = `You read scanned and photographed Thai business documents (receipts, tax invoices, goods requisitions and similar A4 accounting documents) and return the requested fields as JSON.

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
function buildSchema(documentType: DocumentType) {
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

type ModelValue = { value: string; flag_reason: string };
type ModelOutput = {
  readable: boolean;
  unreadable_reason: string;
  header: Record<string, ModelValue>;
  line_items: Record<string, ModelValue>[];
};

function mapRow(row: Record<string, ModelValue>, fields: Field[], prefix: string) {
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

function toReaderError(error: unknown): AiReaderError {
  if (error instanceof AiReaderError) return error;
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

export class ClaudeAiReader implements AiReader {
  constructor(
    private readonly client = new Anthropic(),
    private readonly model = process.env.AI_EXTRACTION_MODEL || DEFAULT_EXTRACTION_MODEL,
  ) {}

  async extract(file: DocumentFile, documentType: DocumentType): Promise<ExtractionOutput> {
    const { schema, header, lines } = buildSchema(documentType);

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
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
      });
    } catch (error) {
      throw toReaderError(error);
    }

    if (response.stop_reason === "refusal") {
      throw new AiReaderError(false, "AI ปฏิเสธการอ่านเอกสารนี้");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AiReaderError(false, "เอกสารยาวเกินกว่าที่ AI อ่านได้ในครั้งเดียว");
    }

    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    let output: ModelOutput;
    try {
      output = JSON.parse(text) as ModelOutput;
    } catch (error) {
      throw new AiReaderError(true, "AI ตอบกลับในรูปแบบที่อ่านไม่ได้", { cause: error });
    }

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
