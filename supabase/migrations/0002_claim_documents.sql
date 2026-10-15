-- Atomically moves Queued Documents to Extracting, never letting more than
-- max_concurrent be Extracting at once. Concurrent callers (several serverless
-- invocations polling at the same time) are serialised by an advisory lock, so
-- the slot count they read is always current.

create or replace function claim_documents(max_concurrent integer)
returns setof documents
language plpgsql
as $$
declare
  slots integer;
begin
  perform pg_advisory_xact_lock(hashtext('claim_documents'));

  select max_concurrent - count(*) into slots
  from documents
  where status = 'extracting';

  if slots <= 0 then
    return;
  end if;

  return query
  update documents d
  set status = 'extracting',
      extracting_since = now(),
      attempt_count = d.attempt_count + 1
  where d.id in (
    select id
    from documents
    where status = 'queued'
      and (next_attempt_at is null or next_attempt_at <= now())
    order by uploaded_at
    limit slots
    for update skip locked
  )
  returning d.*;
end;
$$;

revoke execute on function claim_documents(integer) from public, anon, authenticated;
grant execute on function claim_documents(integer) to service_role;
