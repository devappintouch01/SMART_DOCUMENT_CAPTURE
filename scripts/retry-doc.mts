// Re-queues one Failed Document by file name and runs the queue.
// Usage: npm run retry:doc -- <file name>   (costs real API credit)
import { getDocumentService } from "../src/server/container";

const [fileName] = process.argv.slice(2);
const service = getDocumentService();
const doc = (await service.listDocuments({ search: fileName })).find((d) => d.fileName === fileName);
if (!doc) throw new Error(`no document named ${fileName}`);

const started = Date.now();
await service.retryExtraction(doc.id);
await service.processQueue();
const detail = await service.getDocument(doc.id);
console.log(`took ${((Date.now() - started) / 1000).toFixed(1)} s, status: ${detail?.status}`);
if (detail?.failureReason) console.log("reason:", detail.failureReason);
if (detail?.extractedData && detail.documentType) {
  const show = (row: Record<string, { value: string | null; flag: { reason: string; status: string } | null }>, scope: "header" | "line_item") =>
    detail.documentType!.fields
      .filter((f) => f.scope === scope)
      .map((f) => `  ${f.name}: ${row[f.id]?.value ?? "—"}${row[f.id]?.flag ? `  ⚠ ${row[f.id].flag!.reason}` : ""}`)
      .join("\n");
  console.log(show(detail.extractedData.header, "header"));
  detail.extractedData.lineItems.forEach((row, i) => console.log(`-- line ${i + 1}\n${show(row, "line_item")}`));
}
