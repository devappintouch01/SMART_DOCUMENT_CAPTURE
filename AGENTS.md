# Smart Document Capture

A proof-of-concept web app that uses AI to pull data out of Thai business documents (PDF or image) so it can be copied or exported to Excel. Domain vocabulary is in `CONTEXT.md`; architectural decisions are in `docs/adr/`.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
