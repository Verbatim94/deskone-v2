create extension if not exists btree_gist;

create type public.office_release_kind as enum ('morning', 'afternoon', 'full_day', 'custom');
create type public.office_booking_status as enum ('active', 'cancelled', 'completed');

create table public.offices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  owner_user_id uuid references public.app_users (id) on delete set null,
  name text not null,
  slug citext not null,
  description text,
  floor_label text,
  location_label text,
  capacity integer not null check (capacity > 0 and capacity <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, slug)
);

create table public.office_release_windows (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices (id) on delete cascade,
  released_by_user_id uuid references public.app_users (id) on delete set null,
  release_kind public.office_release_kind not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  check (starts_at < ends_at),
  check (date_trunc('day', starts_at) = date_trunc('day', ends_at)),
  check (extract(minute from starts_at)::int % 15 = 0),
  check (extract(minute from ends_at)::int % 15 = 0),
  check (extract(second from starts_at) = 0),
  check (extract(second from ends_at) = 0)
);

create table public.office_bookings (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  status public.office_booking_status not null default 'active',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  attendee_count integer not null default 1 check (attendee_count > 0),
  note text,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (starts_at < ends_at),
  check (ends_at <= starts_at + interval '8 hours'),
  check (extract(minute from starts_at)::int % 15 = 0),
  check (extract(minute from ends_at)::int % 15 = 0),
  check (extract(second from starts_at) = 0),
  check (extract(second from ends_at) = 0)
);

alter table public.office_bookings
  add constraint office_bookings_no_overlap
  exclude using gist (
    office_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status = 'active');

create index offices_organization_owner_idx
  on public.offices (organization_id, owner_user_id, created_at desc);

create index office_release_windows_office_day_idx
  on public.office_release_windows (office_id, starts_at, ends_at);

create index office_bookings_user_day_idx
  on public.office_bookings (user_id, starts_at, status);

create index office_bookings_office_day_idx
  on public.office_bookings (office_id, starts_at, status);

create trigger set_offices_updated_at
before update on public.offices
for each row
execute function public.set_updated_at();

create trigger set_office_bookings_updated_at
before update on public.office_bookings
for each row
execute function public.set_updated_at();

alter table public.offices enable row level security;
alter table public.office_release_windows enable row level security;
alter table public.office_bookings enable row level security;

comment on table public.offices is
  'Special office spaces owned by a person and released for booking in controlled time windows.';

comment on table public.office_release_windows is
  'Availability windows declared by the office owner or an admin, typically half-day or full-day slots.';

comment on table public.office_bookings is
  'Bookings for released offices, constrained to 15-minute increments and a maximum of 8 hours.';
