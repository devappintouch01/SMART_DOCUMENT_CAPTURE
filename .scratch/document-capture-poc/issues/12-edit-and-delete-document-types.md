# 12: Edit and delete Document Types

**What to build:** The user edits an existing Document Type's Fields with the same editor used for creation. Renaming a Field keeps every existing value. Deleting a Field that Documents use asks for confirmation and then removes its values everywhere. A new Field shows empty on existing Documents. A Document Type cannot be deleted while any Document uses it.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] Renaming a Field keeps its values, because values are keyed by Field id
- [ ] Deleting a Field in use warns first, then drops its values from all Documents
- [ ] An added Field appears empty on existing Documents until they are re-run or the value is filled in by hand
- [ ] Deleting a Document Type in use is rejected with a Thai explanation; an unused type can be deleted
- [ ] Service tests cover renaming, deleting and adding Fields on existing Documents, and the blocked deletion
