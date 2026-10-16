-- Small key/value settings the superadmin changes from the app, for example
-- which Claude model reads Documents. Read and written with the service role;
-- RLS stays on with no policies.

create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;
