// Manual check of the Claude adapter against one file (costs real API calls).
// Usage: npm run try:extract -- <file> [document type name]
import { readFile } from "node:fs/promises";
import { SEED_DOCUMENT_TYPES } from "../src/domain/seeds";
import { toExtractedValue } from "../src/domain/extracted-data";
import { formatValue } from "../src/domain/format";
import { resolveMimeType } from "../src/domain/upload-limits";
import { ClaudeAiReader } from "../src/server/claude-ai-reader";

const [path, typeName = "ใบกำกับภาษี"] = process.argv.slice(2);
if (!path) throw new Error("usage: try-extract <file> [document type name]");
const documentType = SEED_DOCUMENT_TYPES.find((t) => t.name === typeName);
if (!documentType) throw new Error(`unknown Document Type ${typeName}`);

const started = Date.now();
const output = await new ClaudeAiReader().extract(
  { bytes: await readFile(path), mimeType: resolveMimeType(path, "") },
  documentType,
);
console.log(`took ${((Date.now() - started) / 1000).toFixed(1)} s`);
if (output.kind === "unreadable") {
  console.log("unreadable:", output.reason);
} else {
  const show = (scope: "header" | "line_item", row: Record<string, { value: string | null; flagReason: string | null }>) =>
    documentType.fields
      .filter((f) => f.scope === scope)
      .map((f) => {
        const v = toExtractedValue(f.kind, row[f.id] ?? { value: null, flagReason: null });
        return `${f.name}: ${formatValue(f.kind, v.value) || "—"}${v.flag ? `  ⚠ ${v.flag.reason}` : ""}`;
      });
  console.log(show("header", output.header).join("\n"));
  output.lineItems.forEach((row, i) => console.log(`-- line ${i + 1}\n  ${show("line_item", row).join("\n  ")}`));
}
