create type public.report_target_type as enum ('general', 'room', 'desk', 'office', 'reservation', 'office_booking');
create type public.report_status as enum ('open', 'resolved', 'dismissed');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  author_user_id uuid references public.app_users (id) on delete set null,
  assignee_user_id uuid references public.app_users (id) on delete set null,
  target_type public.report_target_type not null default 'general',
  target_id uuid,
  comment text not null check (length(trim(comment)) > 0),
  status public.report_status not null default 'open',
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index reports_organization_status_idx
  on public.reports (organization_id, status, created_at desc);

create index reports_author_idx
  on public.reports (author_user_id, created_at desc);

create index reports_target_idx
  on public.reports (target_type, target_id, created_at desc);

alter table public.reports enable row level security;

comment on table public.reports is
  'Simple issue reports or comments linked to a room, desk, office, booking, or left as general feedback.';
