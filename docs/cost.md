# AI cost per activity

Measured on 2026-10-15 against the real Anthropic API, with the token counts the API returned for each call. Prices are the published per-million-token rates: Claude Opus 5.5 $4 input / $20 output, Claude Haiku 5.5 $0.10 / $0.50. THB uses 35 THB per USD.

| Activity | Model | Input tokens | Output tokens | Cost (USD) | Cost (THB) |
|---|---|---|---|---|---|
| **Read one document** (Extraction), a printed tax invoice as an image, 11 + 7 fields | Opus 5.5 | 8,372 | 949 | **$0.052** | ~1.8 |
| **Read one document**, a real 1-page Thai billing note PDF, 15 + 5 fields | Opus 5.5 | 10,220 | 897 | **$0.059** | ~2.1 |
| **Let the AI pick the Document Type** (Classification) | Haiku 5.5 | 2,439 | 144 | **$0.0003** | ~0.01 |
| **Create a new Document Type** from a Sample Document (draft the Fields) | Opus 5.5 | 2,612 | 1,301 | **$0.036** | ~1.3 |

Output tokens include the model's thinking.

## What a user action costs

| User action | Calls | Cost (USD) | THB |
|---|---|---|---|
| Upload a document with a chosen type | 1 read | ~$0.06 | ~2.1 |
| Upload a document with "ให้ AI เลือกประเภทเอกสารให้" | 1 classification + 1 read | ~$0.06 | ~2.1 |
| Create a new Document Type from a sample (the sample is then read as its first Document) | 1 draft + 1 read | ~$0.095 | ~3.3 |
| Re-read a document ("อ่านใหม่", "ลองใหม่") | 1 read (+1 classification if left on auto) | ~$0.06 | ~2.1 |
| Edit, copy, export, filter, delete, demo reset | none | $0 | 0 |

A rough budget is **$0.06 per document** (about 2 THB), so $5 of credit reads about 80 documents. A document with more pages, a bigger image or more Fields costs more; a 10-page PDF can be several times the figures above.

## Notes

- A failed call that the API rejects (rate limit, overload, server error) is not billed, so automatic retries do not multiply the cost. A call that succeeds but gives an unusable answer is billed.
- The server logs one line per AI call, `[ai-usage] {operation, model, inputTokens, outputTokens, estimatedUsd}`, so spend can be added up from the Vercel logs. The dollar figure is an estimate from the price list; the Anthropic console is the source of truth.
- Not measured: documents of several pages, very large images, and the Opus effort setting (`medium`) being raised.
