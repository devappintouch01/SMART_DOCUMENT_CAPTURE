# 09: Multi-Document Excel export

**What to build:** On the result list, the user selects several Done Documents of the same Document Type and downloads one workbook. "ข้อมูลหลัก" has one row per Document and "รายการ" has every Line Item, and both sheets are linked by "ลำดับ" and "ชื่อไฟล์". A selection that mixes Document Types cannot be exported, and the user is told why.

**Blocked by:** 07, 08

**Status:** ready-for-agent

- [ ] "ข้อมูลหลัก" columns: ลำดับ, ชื่อไฟล์, then Header Fields in Field order
- [ ] "รายการ" columns: ลำดับ, ชื่อไฟล์, then Line Item Fields in Field order
- [ ] Date and Amount cells are formatted as in the single-Document export, and Corrections are used
- [ ] The service rejects selections that mix Document Types or include Documents that are not Done; the UI disables export and explains why
- [ ] Service tests cover the linking columns, ordering, and the mixed-type rejection
