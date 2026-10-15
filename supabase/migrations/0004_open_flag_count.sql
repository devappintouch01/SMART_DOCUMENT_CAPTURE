-- The result list only needs how many Review Flags are still open on each
-- Document, not the extracted data itself, which grows with every Document.
-- The app keeps this column in step whenever it writes extracted_data.

alter table documents add column if not exists open_flag_count integer not null default 0;

update documents d
set open_flag_count =
  (
    select count(*)
    from jsonb_each(d.extracted_data -> 'header') as e
    where e.value -> 'flag' ->> 'status' = 'open'
  )
  + coalesce(
    (
      select count(*)
      from jsonb_array_elements(d.extracted_data -> 'lineItems') as row,
           jsonb_each(row) as e
      where e.value -> 'flag' ->> 'status' = 'open'
    ),
    0
  )
where d.extracted_data is not null;
