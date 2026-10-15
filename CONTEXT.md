# Smart Document Capture

A proof-of-concept web app for presentations that pulls data out of business documents (PDF or image) so it can be copied or exported to Excel.

## Language

**Document Type**:
A category of business document, such as a Receipt, Tax Invoice or Goods Requisition, defined by the list of Fields to pull out of it. It says nothing about where data sits on the page, so one Document Type covers every layout of that kind of document.
_Avoid_: Template, category, form type

**Field**:
One named piece of data a Document Type asks for, with a Field Kind of Text, Number, Date or Amount (money, two decimal places) and an optional Field Description that tells the AI exactly which value to pick. A Header Field has one value per document, such as Tax ID or Grand Total. A Line Item Field has one value per Line Item, such as Quantity or Unit Price.
_Avoid_: Column, key, attribute

**Line Item**:
One row in the item table of a document, such as one product on a Tax Invoice. A Document Type has at most one item table.
_Avoid_: Row, item line, detail line

**Document**:
One uploaded file, PDF or image, treated as a single business document of one Document Type. A multi-page PDF is still one Document; a file holding several business documents is not supported.
_Avoid_: File, upload, page

**Extraction**:
The AI reading a Document and filling in the Fields of its Document Type. It runs in the background and moves through the statuses Queued, Extracting, then Done or Failed. An Extraction can be re-run at any time, for example after changing the Document's Document Type; a re-run replaces every value, including Corrections.
_Avoid_: OCR job, processing, parse

**Correction**:
A value the user changed by hand after an Extraction. Copy and export always use the corrected value.
_Avoid_: Edit, override, fix

**Review Flag**:
A mark the AI puts on a value it is unsure of, with a short reason such as "handwriting unclear". It clears when the user makes a Correction or confirms the value.
_Avoid_: Confidence score, warning, low confidence

**Classification**:
The AI choosing the Document Type for a Document uploaded without one. If no Document Type fits, the Extraction fails with that reason; if it picks the wrong one, the user changes the Document Type and re-runs the Extraction.
_Avoid_: Auto-detect, detection, type guessing

**Sample Document**:
An example document uploaded to create a new Document Type. The AI proposes Fields from it, and the user edits them before saving; once saved, the Sample Document becomes the first Document of that Document Type.
_Avoid_: Template file, training document

**Receipt** (ใบเสร็จรับเงิน):
A document confirming that a payment was received.

**Tax Invoice** (ใบกำกับภาษี):
A document issued by a VAT-registered seller that states the VAT charged on a sale.

**Goods Requisition** (ใบเบิกสินค้า):
A document requesting goods to be released from stock.
_Avoid_: Withdrawal slip
