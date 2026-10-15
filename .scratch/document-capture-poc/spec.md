Status: ready-for-agent

# Smart Document Capture proof of concept

## Problem Statement

Accounting staff retype data from Receipts, Tax Invoices, Goods Requisitions and other A4 business documents into spreadsheets and accounting software by hand. The documents arrive as scanned PDFs or phone photos. They mix Thai and English and sometimes contain handwriting. Every vendor lays its documents out differently, so layout-based OCR templates break constantly and new document kinds keep appearing. The team needs a convincing demo showing that AI can read these documents, turn them into clean data, and hand that data to Excel in seconds, while staying easy to correct when the AI gets something wrong.

## Solution

A small, password-protected web app in Thai. A user drops one or more Documents onto an upload page and either picks a Document Type or lets the AI choose one (Classification). Each Document gets an Extraction in the background, and the result list shows its status live. The result detail page shows the original file on the left and the extracted Header Fields and Line Items on the right, with Review Flags highlighting values the AI was unsure of. The user makes Corrections in place, then copies values (one at a time or as a table) or exports Excel, either for one Document or for many Documents of the same Document Type in a single workbook.

New Document Types are created without code. The user uploads a Sample Document, the AI proposes Fields with descriptions, the user adjusts them and saves, and the Sample Document becomes the first Document of the new type. Three seeded Document Types (Receipt, Tax Invoice, Goods Requisition) are ready out of the box. A one-click demo reset restores a clean state with pre-extracted example Documents for presentations.

## User Stories

### Access

1. As a presenter, I want to sign in with one shared username and password, so that only people I give the password to can see uploaded documents.
2. As a presenter, I want the credentials to come from environment variables, so that I can change the password without a code change and the repo never contains the real password.
3. As a visitor who is not signed in, I want every page and API to send me to the login page, so that no document data leaks to someone holding only the URL.
4. As a signed-in user, I want to sign out, so that I can hand the laptop to someone else after a demo.

### Upload

5. As a user, I want to drag several files onto the upload page at once, so that I can process a batch of documents in one go.
6. As a user, I want to upload PDF, JPG, PNG, WebP and HEIC files, so that scans and phone photos (including iPhone photos) all work.
7. As a user uploading an iPhone HEIC photo, I want it converted to JPG in my browser automatically, so that I never see a "format not supported" error during a live demo.
8. As a user, I want files over 10 MB, PDFs over 10 pages, batches over 20 files and unsupported formats rejected before upload with a clear Thai message, so that I know immediately what to fix.
9. As a user, I want to choose "let the AI decide" (the default) or a specific Document Type for the batch, so that I can mix document kinds or force a type when the AI might confuse them.
10. As a user, I want to see each file's upload progress, so that I know the upload has not stalled.
11. As a user, I want to land on the result list after upload with my new Documents shown as Queued, so that I can watch them get processed.

### Classification and Extraction

12. As a user who chose "let the AI decide", I want the AI to pick the matching Document Type for each Document, so that a mixed batch of Receipts and Tax Invoices sorts itself out.
13. As a user, I want a Document that matches no Document Type to fail with the reason "ไม่พบประเภทเอกสารที่ตรงกัน", so that I know to create a new Document Type or pick one by hand.
14. As a user, I want each Document to move through Queued → Extracting → Done or Failed, so that I always know where it stands.
15. As a user, I want the AI to fill every Header Field and every Line Item of the Document Type, so that I get the item table as well as the totals.
16. As a user, I want the AI to put a Review Flag with a short Thai reason on values it is unsure of (for example, unclear handwriting), so that I check those first instead of every value.
17. As a user, I want dates written in the Buddhist Era (including two-digit years like "69") read correctly, so that a date like 15/10/69 becomes 15 October 2026 and not 2069.
18. As a user, I want Amount values read as numbers with two decimal places regardless of thousands separators, so that "1,070.00" and "1070" both become 1070.00.
19. As a user, I want temporary AI failures (rate limits, timeouts, server errors) retried automatically up to 3 times with growing delays, so that a demo batch does not show spurious failures.
20. As a user, I want permanent failures (unreadable image, corrupt file, no matching type) to fail immediately with a Thai reason, so that I don't wait for retries that cannot succeed.
21. As a user uploading 20 files, I want only a few Extractions (3–5) to run at once, so that the batch does not trip rate limits.
22. As a user, I want to retry a Failed Extraction with one click, so that I can recover from failures without re-uploading.

### Result list

23. As a user, I want a list of all Documents with thumbnail, file name, Document Type, Extraction status, number of open Review Flags and upload time, so that I can see everything at a glance.
24. As a user, I want the list to refresh statuses by itself while any Document is Queued or Extracting, so that I see progress without reloading.
25. As a user, I want to filter by Document Type and by status, so that I can find Failed Documents or all Tax Invoices quickly.
26. As a user, I want to search by file name, so that I can find a specific upload.
27. As a user, I want the newest uploads first, so that the batch I just uploaded is at the top.
28. As a user, I want to select several Documents and delete them, so that I can clean up test uploads.
29. As a user, I want to select several Done Documents of the same Document Type and export them into one Excel file, so that a month's Tax Invoices become one spreadsheet.
30. As a user, I want the export action blocked with an explanation when my selection mixes Document Types, so that I never get a workbook with mismatched columns.

### Result detail

31. As a user, I want the original file beside the extracted values, zoomable for images and page-by-page for PDFs, so that I can verify values against the source.
32. As a user, I want Header Fields shown as a form and Line Items as an editable table, so that the layout mirrors the paper document.
33. As a user, I want to edit any value and save it as a Correction, so that copy and export use the right data.
34. As a user, I want to add and remove Line Item rows, so that I can fix rows the AI missed or invented.
35. As a user, I want flagged values highlighted in yellow with the AI's reason, so that I know why to check them.
36. As a user, I want a flag to clear when I correct the value or press "confirm", so that the open-flag count reaches zero once I have reviewed everything.
37. As a user, I want edit inputs that match the Field Kind (text, number, date picker shown in the Buddhist Era, amount with two decimals), so that I cannot enter a malformed value.
38. As a user, I want a copy button beside every value, so that I can paste values one by one into another system.
39. As a user, I want "copy header" and "copy line items" buttons that put a tab-separated table on the clipboard, so that pasting into Excel or Google Sheets fills the cells directly.
40. As a user, I want to export this one Document to Excel, so that I can share a single result.
41. As a user, I want to change the Document Type of a Document and re-run its Extraction, after a warning that my Corrections will be replaced, so that I can fix a wrong Classification.
42. As a user, I want to re-run the Extraction even without changing the type, after the same warning, so that I can pick up improved Field Descriptions.
43. As a user, I want to delete the Document, removing its stored file too, so that unwanted data is gone.

### Excel export

44. As an accountant, I want the single-Document workbook to have a "ข้อมูลหลัก" sheet (Field name, value) and a "รายการ" sheet (one row per Line Item), so that it is readable on its own.
45. As an accountant, I want the multi-Document workbook to have a "ข้อมูลหลัก" sheet with one row per Document and one column per Header Field, plus a "รายการ" sheet with every Line Item, so that I can pivot and filter across documents.
46. As an accountant, I want both sheets of the multi-Document workbook to start with "ลำดับ" and "ชื่อไฟล์" columns, so that I can link Line Items to their Document with VLOOKUP and trace rows back to the original file.
47. As an accountant, I want Date values as real Excel date cells and Amount values as numeric cells formatted with thousands separators and two decimals, so that formulas and sorting work without cleanup.
48. As an accountant, I want columns named after the Field names in Thai and in the Document Type's Field order, so that the sheet matches what I saw on screen.
49. As an accountant, I want exports to use Corrections, not the AI's original values, so that the spreadsheet reflects what I reviewed.

### Document Types

50. As a user, I want a page listing all Document Types with their Field counts and number of Documents, so that I can manage them.
51. As a user, I want to create a Document Type by uploading a Sample Document, so that a never-seen document kind works within a minute.
52. As a user, I want the AI to propose a name, Header Fields and Line Item Fields with Field Kinds and Field Descriptions from the Sample Document, so that I start from a good draft instead of a blank form.
53. As a user, I want to rename, add, remove and reorder Fields and edit their Kinds and Field Descriptions before saving, so that the Document Type captures exactly what I need.
54. As a user, I want the Sample Document to become the first Document of the new type and start extracting as soon as I save, so that the demo flows straight from "new document kind" to "exported data".
55. As a user, I want to edit an existing Document Type's Fields later, so that I can refine it as I see more documents.
56. As a user who renames a Field, I want existing values to keep showing under the new name, so that renaming never loses data.
57. As a user who deletes a Field that Documents use, I want a warning first, and then its values removed from every Document, so that the deletion is deliberate.
58. As a user who adds a Field, I want existing Documents to show it empty until I re-run their Extraction or fill it in, so that nothing changes behind my back.
59. As a user, I want to delete a Document Type only when no Documents use it, so that a misclick cannot wipe out demo data.
60. As a user, I want the three seeded Document Types (Receipt, Tax Invoice, Goods Requisition) present from the start, so that the app is useful on first launch.

### Demo

61. As a presenter, I want a "reset demo data" action guarded by a typed confirmation, so that I can return to a clean state right before presenting.
62. As a presenter, I want the reset to delete all Documents and non-seeded Document Types, restore the three seeded Document Types to their original Fields, and load 5–6 example Documents with finished Extractions, so that the first screen the audience sees is full and polished.
63. As a presenter, I want the example Documents' results loaded from stored fixtures without calling the AI, so that resetting is instant and free.

## Implementation Decisions

### Platform

- Next.js app (TypeScript) hosted on Vercel; the frontend and all server logic are in the same app. Supabase provides Postgres and Storage. The whole UI is in Thai only; there is no internationalisation layer.
- AI goes through the Anthropic API directly with the official TypeScript SDK (ADR 0001). Classification uses Claude Haiku 5.5 (`claude-haiku-5-5`), and Extraction and Field proposal use Claude Opus 5.5 (`claude-opus-5-5`) (ADR 0003). Both model IDs come from environment variables.

### Modules

**Document service (the deep module, and the only test seam).** Every page and API route calls this service; none of them touch Supabase or the AI directly. Its operations, described by behaviour rather than signature:

- Request upload slots for a batch: validates file metadata against the limits and returns signed direct-to-Storage upload targets.
- Register uploaded Documents: given file references and a requested Document Type (a specific type or "auto"), creates Queued Documents and starts processing.
- Process work: claims Queued Documents up to the concurrency limit and runs Classification (when "auto") and then Extraction. It records status changes, retry scheduling and failure reasons.
- Retry an Extraction; change a Document's Document Type and re-run.
- List Documents with filters (Document Type, status, file-name search), sorted newest first, including open Review Flag counts.
- Get one Document with its Document Type, values, Review Flags and a viewable file URL.
- Save Corrections (Header values and the full Line Item table); confirm a Review Flag.
- Build a single-Document workbook; build a multi-Document workbook (rejects mixed Document Types and non-Done Documents).
- Build tab-separated text for the header and for the Line Items.
- Delete Documents (database rows and stored files).
- Propose a Document Type from a Sample Document; create a Document Type, which also registers the Sample Document as its first Document; update a Document Type's Fields; delete a Document Type (rejected while Documents use it).
- Reset demo data.

**AI reader (port).** The service's only route to the AI. It has three operations:

- `classify(file, documentTypes)` returns a Document Type id or "none", with a reason.
- `extract(file, documentType)` returns Header values, Line Items and Review Flags keyed by Field id, or a permanent failure with a Thai reason.
- `proposeDocumentType(file)` returns a suggested name and Fields with Field Kinds and Field Descriptions.

Every error it raises is labelled as transient or permanent, so the service can decide retries without knowing about HTTP status codes.

**Claude AI reader (adapter).**

- PDFs go in as document content blocks and images as image content blocks.
- Structured outputs (`output_config.format` with a JSON schema) enforce the response shape. The Extraction schema is built per Document Type from its Fields.
- The prompt states the date rules: return dates as ISO `YYYY-MM-DD`, convert the Buddhist Era to the Common Era, and read two-digit years as the Buddhist Era. It also states the amount rules: plain decimal with two places and no separators. Field Descriptions go into the schema and prompt.
- Error mapping:
  - transient: 429, 5xx, overloaded and network timeouts
  - permanent: 4xx validation errors, a `refusal` stop reason, and a model-reported unreadable document
- Opus 5.5 effort is set explicitly (start at `medium`), and the server-side refusal fallback (`fallbacks: "default"`) is enabled.

**Supabase store (adapter).** Implements the service's storage port for Postgres rows and Storage objects. The browser uploads files straight to Storage through signed upload URLs, because Vercel function request bodies are capped at about 4.5 MB.

### Background processing

- Registration creates Queued Documents and then triggers processing after the response is sent (Next.js `after()`). The result list's polling endpoint triggers the same idempotent process step, so work continues even if a background run is cut off.
- Concurrency comes from the database. A Document is claimed by an atomic status change from Queued to Extracting, and only while fewer than the limit (default 4) are Extracting.
- If a Document has been Extracting for more than 5 minutes, it is treated as abandoned and put back in Queued, counting as a transient attempt.
- Transient failures increment an attempt counter and set a next-attempt time (exponential backoff, for example 10 s, 30 s, 90 s). After 3 retries the Document becomes Failed. Permanent failures go straight to Failed.

### Schema (shape, not exact DDL)

- **Document Type**: id, name, seeded flag, timestamps.
- **Field**: id, Document Type id, scope (header | line_item), name, Field Kind (text | number | date | amount), Field Description, position.
- **Document**: id, file name, storage path, MIME type, page count, requested Document Type (id or auto), Document Type id (nullable until Classification succeeds), status (queued | extracting | done | failed), failure reason, attempt count, next-attempt time, extracting-since time, demo-seed flag, uploaded time.
- **Extracted data**: stored on the Document as JSON keyed by Field id. It holds header entries, plus line items as an ordered array of rows keyed by Field id. Each entry carries the value, the AI's original value, a Correction marker, and an optional Review Flag (reason plus open or confirmed). Because values are keyed by Field id, renaming a Field keeps its values; a deleted Field's entries are dropped; a new Field has no entry and shows empty.
- Values are stored normalised. Dates are ISO dates, Amounts are decimal strings with two places, and Numbers are decimal strings. Re-running an Extraction replaces the whole extracted-data JSON, Corrections included.

### Display and export rules

- Dates are displayed as DD/MM/YYYY in the Buddhist Era, and the date input works in the Buddhist Era. In Excel they are real date cells.
- Amounts are displayed and exported with thousands separators and two decimals. In Excel they are numeric cells with format `#,##0.00`.
- Excel workbooks are generated on the server (exceljs or equivalent). Sheet names are "ข้อมูลหลัก" and "รายการ". Multi-Document sheets start with the columns "ลำดับ" (1..n in export order) and "ชื่อไฟล์".
- Copy as a table produces tab-separated values with a header row of Field names.

### Limits

- Accepted types: PDF, JPEG, PNG, WebP; HEIC/HEIF is converted to JPEG in the browser before upload.
- Maximum 10 MB per file, 10 pages per PDF, 20 files per batch. The browser checks these first and the service checks them again.

### Auth

- Login checks `ADMIN_USERNAME` / `ADMIN_PASSWORD` and sets a signed, http-only session cookie whose signing secret comes from an environment variable. Middleware protects every page and API route except login (ADR 0002).
- No user or owner columns exist anywhere.

### Seeds and demo

- Seeded Document Types and their Fields:
  - **ใบเสร็จรับเงิน**
    - Header: เลขที่ใบเสร็จ, วันที่ (date), ชื่อผู้ขาย, เลขประจำตัวผู้เสียภาษีผู้ขาย, ชื่อผู้ซื้อ, วิธีชำระเงิน, ยอดรวมทั้งสิ้น (amount)
    - Line: รายการ, จำนวน (number), ราคาต่อหน่วย (amount), จำนวนเงิน (amount)
  - **ใบกำกับภาษี**
    - Header: เลขที่ใบกำกับภาษี, วันที่ (date), ชื่อผู้ขาย, เลขประจำตัวผู้เสียภาษีผู้ขาย, สาขาผู้ขาย, ชื่อผู้ซื้อ, เลขประจำตัวผู้เสียภาษีผู้ซื้อ, สาขาผู้ซื้อ, มูลค่าก่อนภาษี (amount), ภาษีมูลค่าเพิ่ม (amount), ยอดรวมทั้งสิ้น (amount)
    - Line: รหัสสินค้า, รายการ, จำนวน (number), หน่วย, ราคาต่อหน่วย (amount), ส่วนลด (amount), จำนวนเงิน (amount)
  - **ใบเบิกสินค้า**
    - Header: เลขที่ใบเบิก, วันที่เบิก (date), ผู้ขอเบิก, แผนก, ผู้อนุมัติ, หมายเหตุ
    - Line: รหัสสินค้า, รายการ, จำนวนที่เบิก (number), หน่วย
  - Unmarked Fields are text. Each Field gets a Field Description, for example "ยอดสุทธิที่ต้องชำระ รวม VAT แล้ว" for ยอดรวมทั้งสิ้น.
- Demo fixtures are 5–6 fake Documents (no real company data), each with a stored file and a pre-baked extracted-data result. They are committed to the repo and loaded by the reset without calling the AI.

## Testing Decisions

- **One seam: the Document service.** Tests drive it only through its public operations, with a fake AI reader (scripted responses and scripted transient or permanent errors) and an in-memory store. They assert on externally visible results: returned lists and details, statuses over time, workbook contents read back with the Excel library, and TSV text. They never assert on internal calls or the shape of private helpers.
- Scenarios to cover:
  - auto Classification to Done
  - no matching Document Type, failing with the Thai reason
  - transient errors retried, then Done
  - transient errors exhausted, ending Failed
  - permanent error, Failed immediately
  - concurrency limit respected
  - abandoned Extracting reclaimed
  - Corrections saved and used by copy and export
  - Review Flag cleared by Correction and by confirm
  - re-run replaces Corrections
  - Field rename, delete and add on existing Documents
  - Document Type deletion blocked while in use
  - mixed-type multi-export rejected
  - Excel date and amount cells typed correctly
  - "ลำดับ" and "ชื่อไฟล์" linking
  - Buddhist Era display formatting
  - upload limit validation
  - Sample Document becomes the first Document
  - demo reset restores seeds and fixtures
- The Claude adapter, the Supabase adapter and the UI are not covered by automated tests. The UI is checked by hand while rehearsing the demo.
- **Classification accuracy check (not a unit test):** a script runs the real Haiku 5.5 classifier over the demo fixture files and reports how many were matched correctly. If more than 1 in 10 is wrong, switch to single-call classification with Opus 5.5 (ADR 0003).
- Prior art: none. The repo is empty, so these are the first tests. Use Vitest.

## Out of Scope

- Per-user accounts, sign-up, roles, or document ownership (ADR 0002)
- Language switching or an English UI
- Searching inside extracted values
- Highlighting where on the original file a value came from
- Versioning of Extractions or Document Types; history of Corrections
- Splitting one file into several Documents; files holding multiple business documents
- More than one item table per Document Type; Field Kinds beyond text, number, date, amount
- Local or self-hosted AI models
- Automated browser (Playwright) tests and tests against a real Supabase instance
- Direct integration with accounting software
- Cost tracking or usage dashboards

## Further Notes

- Domain vocabulary follows CONTEXT.md (Document, Document Type, Field, Line Item, Extraction, Classification, Correction, Review Flag, Sample Document). The UI shows these in Thai, but code and docs use the English terms.
- Expected AI cost is roughly 2–3 THB per A4 page on Opus 5.5, plus a negligible amount for Classification on Haiku 5.5.
- Required environment variables:
  - Anthropic API key
  - Classification and Extraction model IDs
  - Supabase URL and keys
  - `ADMIN_USERNAME`, `ADMIN_PASSWORD`
  - session signing secret
  - concurrency limit (optional)
- Vercel's free plan caps function runtime at about 5 minutes. One Extraction normally takes 30–90 seconds, so that limit fits, and the abandoned-Extraction reclaim covers the rare overrun.
- If the demo fixtures do not exist yet, generate fake Thai Receipts, Tax Invoices and Goods Requisitions, including at least one with handwriting and one combined Receipt/Tax Invoice, so that Classification and Review Flags have something to show.
