-- SHA-256 of the file bytes, so the upload page can tell when a file is already
-- in the system. Null for Documents uploaded before this column existed until
-- scripts/backfill-content-hash.mjs has run.

alter table documents add column if not exists content_hash text;
create index if not exists documents_content_hash_idx on documents (content_hash);
