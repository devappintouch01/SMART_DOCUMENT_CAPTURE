# 03: Extraction to Done, with result detail

**What to build:** After upload, each Queued Document is read in the background by Claude Opus 5.5 and moves to Extracting, then to Done or Failed. The result list refreshes statuses by itself. The result detail page shows the original file on the left (zoomable image or page-by-page PDF) and the extracted Header Fields and Line Items on the right, read-only. Dates show in the Buddhist Era and Amounts show with two decimals.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Claude AI reader adapter implements `extract` with structured outputs built from the Document Type's Fields; the model ID comes from an environment variable; PDFs are sent as document blocks and images as image blocks
- [ ] The prompt asks for ISO dates (Buddhist Era converted to Common Era, two-digit years read as Buddhist Era) and plain two-decimal Amounts, and passes Field Descriptions to the model
- [ ] The AI may attach a Review Flag with a Thai reason to any value; flags are stored, though styling them is not required yet
- [ ] Registration triggers processing after the response is sent; the polling endpoint triggers the same idempotent process step
- [ ] A Document is claimed by an atomic Queued → Extracting change, and only while fewer than the concurrency limit (default 4) are Extracting
- [ ] Extracted data is stored on the Document as JSON keyed by Field id, normalised per Field Kind
- [ ] Result list polls while any Document is Queued or Extracting
- [ ] Result detail shows the original beside the values; dates display as DD/MM/YYYY in the Buddhist Era
- [ ] Service tests (fake AI reader) cover Queued → Done, the concurrency limit, and value normalisation
