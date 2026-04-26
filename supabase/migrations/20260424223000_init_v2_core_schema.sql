-- Deskone v2 core schema
-- This schema is intentionally independent from v1.
-- Business tables are designed for API-first access and scripted imports.

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'user');
  end if;

  if not exists (select 1 from pg_type where typname = 'room_membership_role') then
    create type public.room_membership_role as enum ('admin', 'member');
  end if;

  if not exists (select 1 from pg_type where typname = 'desk_type') then
    create type public.desk_type as enum ('desk');
  end if;

  if not exists (select 1 from pg_type where typname = 'wall_orientation') then
    create type public.wall_orientation as enum ('horizontal', 'vertical');
  end if;

  if not exists (select 1 from pg_type where typname = 'room_wall_type') then
    create type public.room_wall_type as enum ('wall', 'entrance');
  end if;

  if not exists (select 1 from pg_type where typname = 'reservation_status') then
    create type public.reservation_status as enum ('pending', 'approved', 'rejected', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'time_segment') then
    create type public.time_segment as enum ('full', 'am', 'pm');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username citext not null,
  full_name text not null,
  password_hash text not null,
  role public.app_role not null default 'user',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint app_users_username_unique unique (username),
  constraint app_users_username_length check (char_length(trim(username::text)) between 3 and 64),
  constraint app_users_full_name_length check (char_length(trim(full_name)) between 1 and 120)
);

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  session_token_hash text not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  user_agent text,
  ip_address inet,
  created_at timestamptz not null default timezone('utc', now()),
  constraint app_sessions_token_hash_unique unique (session_token_hash),
  constraint app_sessions_token_hash_length check (char_length(session_token_hash) = 64)
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  grid_width smallint not null,
  grid_height smallint not null,
  is_active boolean not null default true,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint rooms_slug_unique unique (slug),
  constraint rooms_name_length check (char_length(trim(name)) between 1 and 120),
  constraint rooms_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint rooms_grid_width_bounds check (grid_width between 4 and 64),
  constraint rooms_grid_height_bounds check (grid_height between 4 and 64)
);

create table if not exists public.room_memberships (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  role public.room_membership_role not null default 'member',
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint room_memberships_unique_room_user unique (room_id, user_id)
);

create table if not exists public.room_desks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  label text,
  type public.desk_type not null default 'desk',
  x smallint not null,
  y smallint not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint room_desks_unique_position unique (room_id, x, y),
  constraint room_desks_x_bounds check (x between 0 and 255),
  constraint room_desks_y_bounds check (y between 0 and 255),
  constraint room_desks_label_length check (label is null or char_length(trim(label)) between 1 and 32)
);

create table if not exists public.room_walls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  start_row smallint not null,
  start_col smallint not null,
  end_row smallint not null,
  end_col smallint not null,
  orientation public.wall_orientation not null,
  type public.room_wall_type not null default 'wall',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint room_walls_non_empty check (start_row <> end_row or start_col <> end_col),
  constraint room_walls_straight_line check (start_row = end_row or start_col = end_col),
  constraint room_walls_orientation_match check (
    (orientation = 'horizontal' and start_row = end_row) or
    (orientation = 'vertical' and start_col = end_col)
  )
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  desk_id uuid not null references public.room_desks(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  status public.reservation_status not null default 'pending',
  time_segment public.time_segment not null default 'full',
  date_start date not null,
  date_end date not null,
  notes text,
  created_by uuid references public.app_users(id) on delete set null,
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  cancelled_by uuid references public.app_users(id) on delete set null,
  cancelled_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint reservations_valid_date_range check (date_end >= date_start)
);

create table if not exists public.desk_assignments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  desk_id uuid not null references public.room_desks(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  date_start date not null,
  date_end date not null,
  notes text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint desk_assignments_valid_date_range check (date_end >= date_start),
  constraint desk_assignments_max_one_year check (date_end <= date_start + interval '1 year')
);

create table if not exists public.desk_assignment_exceptions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.desk_assignments(id) on delete cascade,
  exception_date date not null,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint desk_assignment_exceptions_unique_date unique (assignment_id, exception_date)
);

create unique index if not exists room_desks_unique_label_per_room
  on public.room_desks (room_id, label)
  where label is not null;

create index if not exists idx_app_users_active
  on public.app_users (is_active)
  where is_active = true;

create index if not exists idx_app_sessions_user_expires
  on public.app_sessions (user_id, expires_at desc);

create index if not exists idx_app_sessions_active
  on public.app_sessions (expires_at)
  where revoked_at is null;

create index if not exists idx_room_memberships_user
  on public.room_memberships (user_id, room_id);

create index if not exists idx_room_memberships_room_role
  on public.room_memberships (room_id, role);

create index if not exists idx_room_desks_room
  on public.room_desks (room_id);

create index if not exists idx_room_walls_room
  on public.room_walls (room_id);

create index if not exists idx_reservations_room_dates
  on public.reservations (room_id, date_start, date_end, status);

create index if not exists idx_reservations_desk_dates
  on public.reservations (desk_id, date_start, date_end);

create index if not exists idx_reservations_user_dates
  on public.reservations (user_id, date_start, date_end, status);

create index if not exists idx_desk_assignments_room_dates
  on public.desk_assignments (room_id, date_start, date_end);

create index if not exists idx_desk_assignments_desk_dates
  on public.desk_assignments (desk_id, date_start, date_end);

create index if not exists idx_desk_assignments_user_dates
  on public.desk_assignments (user_id, date_start, date_end);

create trigger set_updated_at_app_users
before update on public.app_users
for each row
execute function public.set_updated_at();

create trigger set_updated_at_rooms
before update on public.rooms
for each row
execute function public.set_updated_at();

create trigger set_updated_at_room_desks
before update on public.room_desks
for each row
execute function public.set_updated_at();

create trigger set_updated_at_room_walls
before update on public.room_walls
for each row
execute function public.set_updated_at();

create trigger set_updated_at_reservations
before update on public.reservations
for each row
execute function public.set_updated_at();

create trigger set_updated_at_desk_assignments
before update on public.desk_assignments
for each row
execute function public.set_updated_at();

alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.rooms enable row level security;
alter table public.room_memberships enable row level security;
alter table public.room_desks enable row level security;
alter table public.room_walls enable row level security;
alter table public.reservations enable row level security;
alter table public.desk_assignments enable row level security;
alter table public.desk_assignment_exceptions enable row level security;

comment on table public.app_users is 'Deskone v2 application users. Access is expected through Edge Functions.';
comment on table public.app_sessions is 'Hashed custom sessions for Deskone v2.';
comment on table public.reservations is 'User-created bookings handled through the service layer.';
comment on table public.desk_assignments is 'Admin-managed long-running desk allocations.';
