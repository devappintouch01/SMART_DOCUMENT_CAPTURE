# 02: Upload Documents with a chosen Document Type

**What to build:** A user drags PDF, JPG, PNG or WebP files onto the upload page, picks one of the three seeded Document Types, sees per-file upload progress, and lands on the result list where the new Documents show as Queued. No Extraction runs yet.

**Blocked by:** 01

**Status:** done

- [x] Seeded Document Types ใบเสร็จรับเงิน, ใบกำกับภาษี and ใบเบิกสินค้า exist with the Header Fields, Line Item Fields, Field Kinds and Field Descriptions listed in the spec
- [x] Files over 10 MB, PDFs over 10 pages, batches over 20 files and unsupported formats are rejected in the browser with a Thai message, and rejected again by the Document service
- [x] Files upload straight from the browser to Supabase Storage through signed upload targets that the Document service issues
- [x] Registering the upload creates one Queued Document per file with file name, MIME type, page count and requested Document Type
- [x] Result list shows file name, thumbnail, Document Type, status and upload time, newest first
- [x] Service tests cover limit validation and registration creating Queued Documents
