-- One row per call to an AI model, so cost, speed and the model used can be
-- reviewed per Document and per model. Only a superadmin sees this (the app
-- reads it with the service role; RLS stays on with no policies).

create table ai_calls (
  id uuid primary key default gen_random_uuid(),
  -- Kept (set null) when the Document is deleted, so spend history survives.
  document_id uuid references documents (id) on delete set null,
  operation text not null check (operation in ('classify', 'extract', 'propose')),
  provider text not null,
  model text not null,
  started_at timestamptz not null,
  duration_ms integer,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10, 6),
  status text not null check (status in ('ok', 'error')),
  error text,
  -- Rows filled in afterwards for Documents read before this table existed:
  -- the model is assumed from the settings of the time, the rest is unknown.
  is_legacy boolean not null default false,
  created_at timestamptz not null default now()
);

create index ai_calls_document_idx on ai_calls (document_id);
create index ai_calls_started_at_idx on ai_calls (started_at desc);
alter table ai_calls enable row level security;

-- When the Extraction finished (done or failed for good); null before that and
-- for Documents read before this column existed.
alter table documents add column if not exists completed_at timestamptz;

-- Legacy rows. Demo seeds never went through the AI.
insert into ai_calls (document_id, operation, provider, model, started_at, status, is_legacy)
select id, 'extract', 'anthropic', 'claude-opus-5-5', uploaded_at, 'ok', true
from documents
where status = 'done' and not is_demo_seed;

insert into ai_calls (document_id, operation, provider, model, started_at, status, is_legacy)
select id, 'classify', 'anthropic', 'claude-haiku-5-5', uploaded_at, 'ok', true
from documents
where requested_document_type_id is null
  and status in ('done', 'failed')
  and not is_demo_seed;
