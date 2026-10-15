---
status: accepted
---

# Classify with a cheap model first, then extract

When a Document is uploaded without a Document Type, Claude Haiku 5.5 first looks at the document and picks one of the existing Document Types (or none). Claude Opus 5.5 then extracts the Fields of that Document Type. The user chose to try this two-step approach first because it keeps the classification step cheap and separate. The other option was one Opus 5.5 call that both picks the Document Type and extracts its Fields; that call is a little faster and avoids sending the document image twice. We switch to the single-call approach if Haiku 5.5 picks the wrong Document Type for more than 1 in 10 of the demo documents. A local model was rejected because Vercel functions cannot run one and small local models read Thai poorly.
