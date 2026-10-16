-- Duplicate detection only looks at the files picked in one upload round, in the
-- browser, so the stored hash from 0005 is not needed.

drop index if exists documents_content_hash_idx;
alter table documents drop column if exists content_hash;
