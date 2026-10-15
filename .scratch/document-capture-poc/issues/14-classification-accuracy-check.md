# 14: Classification accuracy check

**What to build:** A developer runs one script that sends every example Document file through the real Haiku 5.5 classifier. It prints the expected and the chosen Document Type for each file, plus the overall hit rate. If more than 1 in 10 is wrong, the report says to switch to single-call Classification with Opus 5.5 (ADR 0003).

**Blocked by:** 05, 13

**Status:** ready-for-agent

- [ ] The script goes through the same Claude adapter `classify` path as the app
- [ ] The expected Document Type for each example Document is recorded alongside the files
- [ ] Output lists each file, its expected and chosen types, and the overall result against the 1-in-10 threshold
- [ ] Usage is documented, including that it makes real, paid API calls
