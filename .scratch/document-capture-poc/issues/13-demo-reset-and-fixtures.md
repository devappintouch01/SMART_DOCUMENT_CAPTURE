# 13: Demo reset and example Documents

**What to build:** A "รีเซ็ตข้อมูล demo" action, guarded by a typed confirmation, wipes all Documents and non-seeded Document Types and restores the three seeded Document Types to their original Fields. It then loads 5–6 example Documents with finished Extractions, so the first screen in a presentation is full. The reset loads stored results and never calls the AI.

**Blocked by:** 03

**Status:** done

- [x] Fake Thai Receipts, Tax Invoices and Goods Requisitions are created with no real company data, including one with handwriting and one combined Receipt/Tax Invoice; the files and their pre-baked extracted data are committed
- [x] At least one example Document carries Review Flags
- [x] Reset requires typing a confirmation phrase
- [x] Reset deletes all Documents and their Storage objects, removes non-seeded Document Types, restores the seeds, and loads the example Documents as Done
- [x] A service test covers the state after a reset

**Not run on the live database:** pressing the reset wipes every Document and custom type, so the destructive steps (delete all Documents and files, delete non-seeded types) are covered by in-memory tests only. The restore and the upload/insert steps were checked against the real Supabase without touching anyone else's data. The first real press is the live test; it is idempotent, so pressing it again recovers from a failure part-way.
