# 04: Extraction retries and failure reasons

**What to build:** Temporary AI problems never surface in a demo. Rate limits, timeouts and server errors are retried automatically, and only genuinely unreadable Documents fail, with a Thai reason the user can act on. A Failed Document can be retried with one click.

**Blocked by:** 03

**Status:** done

- [x] The Claude adapter labels each error transient (429, 5xx, overloaded, network timeout) or permanent (4xx validation, `refusal` stop reason, model-reported unreadable document)
- [x] Transient failures retry up to 3 times with growing delays (about 10 s, 30 s, 90 s), tracked by an attempt counter and a next-attempt time; after that the Document becomes Failed
- [x] Permanent failures go straight to Failed with a Thai reason such as "ภาพไม่ชัดพอจะอ่านได้"
- [x] A Document stuck in Extracting for more than 5 minutes goes back to Queued, counting as a transient attempt
- [x] Result list and detail show the failure reason; a retry button re-queues a Failed Document
- [x] Service tests cover a transient error followed by Done, retries running out (Failed), a permanent error (Failed immediately), and reclaiming an abandoned Extraction
