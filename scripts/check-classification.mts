// Sends every demo example document through the real Classification (Haiku)
// and compares the Document Type it picks with the expected one.
// Usage: npm run check:classification [-- --runs 3]
// Makes real, paid API calls: one per document per run (cents in total).
//
// ADR 0003: if more than 1 in 10 is wrong, switch to classifying and
// extracting in one Opus call. Exit code 1 means that threshold was crossed.
import { SEED_DOCUMENT_TYPES } from "../src/domain/seeds";
import { ClaudeAiReader } from "../src/server/claude-ai-reader";
import { loadDemoFixtures } from "../src/server/demo-fixtures";

const THRESHOLD = 0.1;

const runsArg = process.argv.indexOf("--runs");
const runs = runsArg > -1 ? Math.max(1, Number(process.argv[runsArg + 1]) || 1) : 1;

const reader = new ClaudeAiReader();
const fixtures = await loadDemoFixtures();
const nameOf = (id: string | null) => SEED_DOCUMENT_TYPES.find((t) => t.id === id)?.name ?? "(ไม่ตรงประเภทใด)";

type Row = { file: string; run: number; expected: string; chosen: string; ok: boolean; seconds: number; reason: string };
const rows: Row[] = [];

for (let run = 1; run <= runs; run++) {
  const results = await Promise.all(
    fixtures.map(async (fixture) => {
      const started = Date.now();
      const out = await reader.classify({ bytes: fixture.bytes, mimeType: fixture.mimeType }, SEED_DOCUMENT_TYPES);
      const chosen = nameOf(out.documentTypeId);
      return {
        file: fixture.fileName,
        run,
        expected: fixture.documentType,
        chosen,
        ok: chosen === fixture.documentType,
        seconds: (Date.now() - started) / 1000,
        reason: out.reason,
      } satisfies Row;
    }),
  );
  rows.push(...results);
}

const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - [...s].length));
console.log(`${pad("ไฟล์", 40)}${pad("คาดไว้", 18)}${pad("AI เลือก", 18)}ผล   วินาที`);
for (const r of rows) {
  console.log(`${pad(r.file + (runs > 1 ? ` #${r.run}` : ""), 40)}${pad(r.expected, 18)}${pad(r.chosen, 18)}${r.ok ? "ถูก " : "ผิด "}  ${r.seconds.toFixed(1)}`);
  if (!r.ok) console.log(`    เหตุผลของ AI: ${r.reason}`);
}

const wrong = rows.filter((r) => !r.ok).length;
const rate = wrong / rows.length;
const avg = rows.reduce((s, r) => s + r.seconds, 0) / rows.length;
console.log(`\nถูก ${rows.length - wrong}/${rows.length} | ผิด ${wrong} (${(rate * 100).toFixed(0)}%) | เฉลี่ย ${avg.toFixed(1)} วินาที/ใบ | เกณฑ์: ผิดได้ไม่เกิน ${THRESHOLD * 100}%`);
if (rate > THRESHOLD) {
  console.log("เกินเกณฑ์: ตาม ADR 0003 ให้เปลี่ยนไปใช้ Opus 5.5 ตัวเดียวทำทั้งตรวจประเภทและอ่านข้อมูล");
  process.exit(1);
}
console.log("ผ่านเกณฑ์: ใช้ Haiku ตรวจประเภทต่อไปได้");
