create table public.sharing_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  description text,
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.sharing_group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.sharing_groups (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (group_id, user_id)
);

create table public.room_group_memberships (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  group_id uuid not null references public.sharing_groups (id) on delete cascade,
  role public.room_membership_role not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  unique (room_id, group_id)
);

create index sharing_groups_created_by_idx on public.sharing_groups (created_by);
create index sharing_group_memberships_user_idx on public.sharing_group_memberships (user_id, group_id);
create index sharing_group_memberships_group_idx on public.sharing_group_memberships (group_id, user_id);
create index room_group_memberships_room_idx on public.room_group_memberships (room_id, role);
create index room_group_memberships_group_idx on public.room_group_memberships (group_id, room_id);

create trigger set_sharing_groups_updated_at
before update on public.sharing_groups
for each row
execute function public.set_updated_at();

alter table public.sharing_groups enable row level security;
alter table public.sharing_group_memberships enable row level security;
alter table public.room_group_memberships enable row level security;

comment on table public.sharing_groups is
  'Reusable user groups for faster room and desk sharing workflows.';

comment on table public.sharing_group_memberships is
  'Membership bridge between internal users and sharing groups.';

comment on table public.room_group_memberships is
  'Room access granted to a whole sharing group, reducing repetitive per-user assignments.';
