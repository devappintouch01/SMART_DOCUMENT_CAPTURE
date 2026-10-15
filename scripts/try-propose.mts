// Manual check of the Document Type proposal against one file (costs real API calls).
// Usage: npm run try:propose -- <file>
import { readFile } from "node:fs/promises";
import { resolveMimeType } from "../src/domain/upload-limits";
import { ClaudeAiReader } from "../src/server/claude-ai-reader";

const [path] = process.argv.slice(2);
if (!path) throw new Error("usage: try-propose <file>");

const started = Date.now();
const proposal = await new ClaudeAiReader().proposeDocumentType({
  bytes: await readFile(path),
  mimeType: resolveMimeType(path, ""),
});
console.log(`took ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(`name: ${proposal.name}`);
for (const f of proposal.fields) {
  console.log(`  [${f.scope === "header" ? "หลัก" : "ตาราง"}] ${f.name} (${f.kind}) — ${f.description}`);
}
