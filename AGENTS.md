# Smart Document Capture

A proof-of-concept web app that uses AI to pull data out of Thai business documents (PDF or image) so it can be copied or exported to Excel. Domain vocabulary is in `CONTEXT.md`; architectural decisions are in `docs/adr/`.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Commit Messages

Use **Conventional Commits** format:

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

### Types

| Type | ใช้เมื่อ |
|------|----------|
| `feat` | เพิ่ม feature ใหม่ |
| `fix` | แก้ bug |
| `refactor` | ปรับโค้ดโดยไม่เปลี่ยน behavior |
| `perf` | ปรับปรุง performance |
| `style` | แก้ formatting, whitespace (ไม่เปลี่ยน logic) |
| `docs` | แก้เอกสาร |
| `test` | เพิ่ม/แก้ test |
| `chore` | งาน maintenance เช่น config, dependencies |

### Scope (optional)

ใส่ชื่อ module หรือ feature ที่เกี่ยวข้อง ใช้ชุดนี้เป็นหลัก

| Scope | ครอบคลุม |
|-------|----------|
| `upload` | หน้า upload, ตรวจขนาด/ชนิดไฟล์, แปลง HEIC, signed upload ไป Supabase Storage |
| `extraction` | Extraction, สถานะ Queued → Extracting → Done/Failed, retry, concurrency |
| `classification` | Classification (Haiku เลือก Document Type) |
| `document-type` | Document Type, Field, Sample Document, seed 3 ประเภท |
| `result` | หน้า result list และ result detail, Correction, Review Flag, copy |
| `export` | Excel export ทีละใบและหลายใบ |
| `ai` | Claude AI reader adapter (prompt, schema, model, error mapping) |
| `store` | Supabase store adapter, schema, migration |
| `auth` | login บัญชีเดียว, session cookie, middleware |
| `demo` | รีเซ็ตข้อมูล demo และ fixture |

ชื่อ scope ใช้คำศัพท์ตาม `CONTEXT.md` ห้ามใช้คำที่ glossary บอกให้เลี่ยง เช่น `template` หรือ `ocr`

### Examples

```
feat(document-type): create Document Type from Sample Document

Let users upload one example file and start from AI-proposed Fields,
so a new kind of document works without code changes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

```
fix(extraction): read two-digit years as Buddhist Era

Thai documents write "15/10/69" meaning 2569 BE; reading it as 2069
put every short date 43 years in the future.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

```
refactor(export): share cell formatting between single and multi export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Rules

- Subject line ไม่เกิน 72 ตัวอักษร
- ใช้ **imperative mood** — "add" ไม่ใช่ "added" หรือ "adds"
- ไม่ต้องจบด้วยจุด (.)
- Body อธิบาย **why** ไม่ใช่ **what**
- **REQUIRED**: Include footer `Co-Authored-By: <AI model ที่ใช้>` เสมอ เช่น `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Development

- `npm run dev`: start the app at http://localhost:3000 (local login `admin` / `1234` from `.env.local`)
- `npm test`: Vitest. Tests go through the Document service with the fakes in `src/server/testing/` (see the spec's Testing Decisions)
- `npm run db:migrate`: apply new files in `supabase/migrations/` to the Supabase database
- `npm run db:seed`: upsert the three seeded Document Types (safe to re-run)
- `npm run try:extract -- <file> [Document Type name]`: run the real Claude adapter on one file and print the result (needs `ANTHROPIC_API_KEY`; costs API credit)
- `npm run lint`, `npm run build`
- Environment variables are listed in `.env.example`

Pages and API routes call the Document service (`getDocumentService()`), never Supabase or the AI directly.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
