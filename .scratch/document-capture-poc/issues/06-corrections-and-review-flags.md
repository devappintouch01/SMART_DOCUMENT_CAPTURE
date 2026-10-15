# 06: Corrections and Review Flags

**What to build:** On result detail, every value is editable with an input that matches its Field Kind (text, number, Buddhist Era date picker, two-decimal Amount). Line Item rows can be added and removed. Values carrying a Review Flag are highlighted yellow with the AI's reason. A flag clears when the user makes a Correction or presses confirm, and the result list shows how many flags are still open.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Header Fields render as a form and Line Items as an editable table
- [ ] Saving stores Corrections while keeping the AI's original value
- [ ] Line Item rows can be added and removed
- [ ] Flagged values are highlighted with their reason; correcting or confirming clears the flag
- [ ] Result list shows the open Review Flag count per Document
- [ ] Service tests cover saving Corrections, clearing a flag by Correction and by confirm, and the open-flag count
