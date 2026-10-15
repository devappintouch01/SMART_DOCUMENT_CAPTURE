# 05: Classification, and changing a Document's Document Type

**What to build:** On the upload page, "ให้ AI ตรวจให้" is the default. Claude Haiku 5.5 then picks the Document Type for each Document before Opus extracts it, so a mixed batch sorts itself out (ADR 0003). When nothing fits, the Document fails with "ไม่พบประเภทเอกสารที่ตรงกัน". On the result detail page the user can change the Document Type, or re-run without changing it; both replace Corrections after a warning.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Claude adapter implements `classify` with Haiku 5.5 (model ID from an environment variable), returning a Document Type id or "none" with a reason
- [ ] Upload page offers "ให้ AI ตรวจให้" (default) or a specific Document Type
- [ ] Documents uploaded with "ให้ AI ตรวจให้" run Classification, then Extraction; "none" fails permanently with the Thai reason
- [ ] Result detail lets the user change the Document Type and re-run, or re-run as is, after a warning that Corrections will be replaced
- [ ] Re-running replaces all extracted data
- [ ] Service tests cover automatic Classification through to Done, no match leading to Failed, and re-running after a type change
