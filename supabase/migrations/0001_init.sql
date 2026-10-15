-- Document Types, Fields and Documents (see CONTEXT.md and the POC spec).
-- The app talks to the database only from the server with the service role,
-- so row level security is enabled with no policies: the public anon key can
-- read nothing.

create table document_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fields (
  id uuid primary key default gen_random_uuid(),
  document_type_id uuid not null references document_types (id) on delete cascade,
  scope text not null check (scope in ('header', 'line_item')),
  name text not null,
  kind text not null check (kind in ('text', 'number', 'date', 'amount')),
  description text,
  position integer not null
);

create index fields_document_type_id_idx on fields (document_type_id, position);

create table documents (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  page_count integer,
  -- null means the user asked for Classification ("ให้ AI เลือกประเภทเอกสารให้")
  requested_document_type_id uuid references document_types (id) on delete restrict,
  document_type_id uuid references document_types (id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued', 'extracting', 'done', 'failed')),
  failure_reason text,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  extracting_since timestamptz,
  -- Header values, Line Items, Corrections and Review Flags keyed by Field id
  extracted_data jsonb,
  is_demo_seed boolean not null default false,
  uploaded_at timestamptz not null default now()
);

create index documents_uploaded_at_idx on documents (uploaded_at desc);
create index documents_status_idx on documents (status, next_attempt_at);

alter table document_types enable row level security;
alter table fields enable row level security;
alter table documents enable row level security;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
