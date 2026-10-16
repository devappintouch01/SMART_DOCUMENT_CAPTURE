// Tries one OpenRouter model on the demo fixtures and scores it against their
// known answers (costs real API calls, a few cents at most).
// Usage: npm run try:openrouter -- <model slug> [--pdf auto|native|cloudflare-ai|mistral-ocr] [fixture file names...]
// Example: npm run try:openrouter -- deepseek/deepseek-v4.1-flash --pdf cloudflare-ai
// For a baseline with the app's own Claude reader (direct Anthropic API, same scoring) use the
// model name "claude-direct:claude-opus-5-5".
import { readFile } from "node:fs/promises";
import { SEED_DOCUMENT_TYPES } from "../src/domain/seeds";
import { toBaht } from "../src/domain/ai-usage";
import type { Field } from "../src/domain/types";
import { buildSchema, ClaudeAiReader, mapRow, SYSTEM_PROMPT, type ModelOutput } from "../src/server/claude-ai-reader";
import type { NewAiCall } from "../src/domain/ai-usage";

const args = process.argv.slice(2);
const model = args.shift();
if (!model || model.startsWith("--")) throw new Error("usage: try-openrouter <model slug> [--pdf engine] [fixtures...]");
let pdfEngine = "auto";
const pdfFlag = args.indexOf("--pdf");
if (pdfFlag >= 0) pdfEngine = args.splice(pdfFlag, 2)[1] ?? "auto";

const direct = model.startsWith("claude-direct:") ? model.slice("claude-direct:".length) : null;
const key = process.env.OPENROUTER_API_KEY;
if (!direct && !key) throw new Error("OPENROUTER_API_KEY is not set in .env.local");

type FixtureValue = string | { v: string };
type Fixture = {
  file: string;
  mimeType: string;
  documentType: string;
  header: Record<string, FixtureValue>;
  lineItems: Record<string, FixtureValue>[];
};
const dir = new URL("../fixtures/demo/", import.meta.url);
const manifest: Fixture[] = JSON.parse(await readFile(new URL("manifest.json", dir), "utf8"));
const chosen = args.length > 0 ? manifest.filter((f) => args.includes(f.file)) : manifest;

const plain = (value: FixtureValue | undefined) => (typeof value === "string" ? value : (value?.v ?? ""));
const squash = (text: string) => text.replace(/\s+/g, " ").trim();
function same(field: Field, expected: string, got: string | null): boolean {
  if (field.kind === "amount" || field.kind === "number") {
    const a = Number(expected.replace(/,/g, ""));
    const b = Number((got ?? "").replace(/,/g, ""));
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.005;
  }
  return squash(expected) === squash(got ?? "");
}

let totalCost = 0;
let totalMatched = 0;
let totalFields = 0;
let costed = 0;

for (const fixture of chosen) {
  const documentType = SEED_DOCUMENT_TYPES.find((t) => t.name === fixture.documentType);
  if (!documentType) throw new Error(`unknown Document Type ${fixture.documentType}`);
  const { schema, header, lines } = buildSchema(documentType);

  type Mapped = Record<string, { value: string | null }>;
  let got: Mapped;
  let gotLines: Mapped[];
  let seconds: string;
  let usageLine: string;
  let cost: number | undefined;

  if (direct) {
    const logged: NewAiCall[] = [];
    const reader = new ClaudeAiReader(undefined, direct, undefined, async (call) => void logged.push(call));
    const bytes = await readFile(new URL(fixture.file, dir));
    const began = Date.now();
    let output;
    try {
      output = await reader.extract({ bytes, mimeType: fixture.mimeType }, documentType);
    } catch (error) {
      console.log(`\n${fixture.file}: FAILED ${(error as Error).message}`);
      continue;
    }
    seconds = ((Date.now() - began) / 1000).toFixed(1);
    if (output.kind !== "extracted") {
      console.log(`\n${fixture.file}: unreadable (${output.reason})`);
      continue;
    }
    got = output.header;
    gotLines = output.lineItems;
    cost = logged[0]?.costUsd ?? undefined;
    usageLine = `${logged[0]?.inputTokens ?? "?"} in / ${logged[0]?.outputTokens ?? "?"} out`;
  } else {
    const data = Buffer.from(await readFile(new URL(fixture.file, dir))).toString("base64");
    const isPdf = fixture.mimeType === "application/pdf";
    const dataUrl = `data:${fixture.mimeType};base64,${data}`;
    const body = {
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            isPdf
              ? { type: "file", file: { filename: fixture.file, file_data: dataUrl } }
              : { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: `This document should be a "${documentType.name}". Extract its fields.` },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "extraction", strict: true, schema } },
      provider: { require_parameters: true },
      usage: { include: true },
      ...(isPdf && pdfEngine !== "auto" ? { plugins: [{ id: "file-parser", pdf: { engine: pdfEngine } }] } : {}),
    };

    const began = Date.now();
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    seconds = ((Date.now() - began) / 1000).toFixed(1);
    const json = (await response.json()) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; completion_tokens_details?: { reasoning_tokens?: number } };
      provider?: string;
    };
    if (!response.ok || json.error) {
      console.log(`\n${fixture.file}: FAILED (${response.status}) ${json.error?.message ?? ""}`);
      continue;
    }
    let output: ModelOutput;
    try {
      output = JSON.parse(json.choices?.[0]?.message?.content ?? "");
    } catch {
      console.log(`\n${fixture.file}: answer is not valid JSON`);
      continue;
    }
    got = mapRow(output.header ?? {}, header, "h");
    gotLines = (output.line_items ?? []).map((row) => mapRow(row, lines, "l"));
    cost = json.usage?.cost;
    const thinking = json.usage?.completion_tokens_details?.reasoning_tokens;
    usageLine = `${json.usage?.prompt_tokens ?? "?"} in / ${json.usage?.completion_tokens ?? "?"} out${thinking ? ` (${thinking} reasoning)` : ""} · via ${json.provider ?? "?"}`;
  }

  const misses: string[] = [];
  let matched = 0;
  let fields = 0;
  for (const field of header) {
    const expected = plain(fixture.header[field.name]);
    if (!expected) continue;
    fields++;
    if (same(field, expected, got[field.id]?.value ?? null)) matched++;
    else misses.push(`${field.name}: expected "${expected}", got "${got[field.id]?.value ?? ""}"`);
  }
  fixture.lineItems.forEach((expectedRow, i) => {
    const gotRow: Mapped = gotLines[i] ?? {};
    for (const field of lines) {
      const expected = plain(expectedRow[field.name]);
      if (!expected) continue;
      fields++;
      const value = gotRow[field.id]?.value ?? null;
      if (same(field, expected, value)) matched++;
      else misses.push(`line ${i + 1} ${field.name}: expected "${expected}", got "${value ?? ""}"`);
    }
  });
  if (gotLines.length !== fixture.lineItems.length) {
    misses.push(`line item count: expected ${fixture.lineItems.length}, got ${gotLines.length}`);
  }

  if (typeof cost === "number") {
    totalCost += cost;
    costed++;
  }
  totalMatched += matched;
  totalFields += fields;
  console.log(
    `\n${fixture.file}: ${matched}/${fields} fields right · ${seconds} s · ${usageLine} · ` +
      `${typeof cost === "number" ? `$${cost.toFixed(5)} = ${toBaht(cost).toFixed(3)} baht` : "cost n/a"}`,
  );
  for (const miss of misses) console.log(`   ✗ ${miss}`);
}

console.log(
  `\n${model} (pdf: ${pdfEngine}): ${totalMatched}/${totalFields} fields right (${totalFields ? Math.round((100 * totalMatched) / totalFields) : 0}%)` +
    `${costed ? ` · average ${toBaht(totalCost / costed).toFixed(3)} baht per document` : ""}`,
);
