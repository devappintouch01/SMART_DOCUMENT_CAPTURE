# 07: Copy and single-Document Excel export

**What to build:** From result detail, the user copies one value, the header as a table, or the Line Items as a table, and pastes it straight into Excel or Google Sheets. They can also download this Document as an Excel workbook. Copy and export always use Corrections.

**Blocked by:** 06

**Status:** done

- [x] Copy button beside every value
- [x] "Copy header" and "copy line items" put tab-separated text with a header row of Field names on the clipboard
- [x] The single-Document workbook has a "ข้อมูลหลัก" sheet (Field name, value) and a "รายการ" sheet (one row per Line Item, columns in Field order)
- [x] Date values are real Excel date cells; Amounts are numeric cells formatted `#,##0.00`
- [x] Service tests read the workbook back and check sheet names, cell types and that Corrections are used, and check the TSV output
