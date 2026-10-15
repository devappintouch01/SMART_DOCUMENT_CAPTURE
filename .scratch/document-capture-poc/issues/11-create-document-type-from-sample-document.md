# 11: Create a Document Type from a Sample Document

**What to build:** A Document Types page lists every Document Type with its Field count and Document count. To create one, the user uploads a Sample Document. Claude Opus 5.5 proposes a name, Header Fields and Line Item Fields with Field Kinds and Field Descriptions. The user renames, adds, removes and reorders Fields, then saves. The Sample Document becomes the first Document of the new type and its Extraction starts immediately.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Claude adapter implements `proposeDocumentType`
- [ ] The Document Types page lists each type with its Field and Document counts
- [ ] The Field editor supports name, Field Kind, Field Description and scope (header or line item), plus reorder, add and remove
- [ ] Saving creates the Document Type and registers the Sample Document as a Queued Document of that type
- [ ] Service tests cover the proposal flow and the Sample Document becoming the first Document
