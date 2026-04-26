create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  ip_address text,
  user_agent text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index audit_events_actor_created_idx
  on public.audit_events (actor_user_id, created_at desc);

create index audit_events_organization_created_idx
  on public.audit_events (organization_id, created_at desc);

create index audit_events_entity_idx
  on public.audit_events (entity_type, entity_id, created_at desc);

alter table public.audit_events enable row level security;

comment on table public.audit_events is
  'Immutable audit trail for privileged actions, directory changes, scope assignments, and room governance operations.';
