do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role'
      and e.enumlabel = 'super_admin'
  ) then
    alter type public.app_role add value 'super_admin';
  end if;
end
$$;

create type public.organization_membership_role as enum ('admin', 'member');
create type public.identity_provider as enum ('local', 'entra_id');
create type public.desk_default_status as enum ('available', 'restricted');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  role public.organization_membership_role not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create table public.user_profiles (
  user_id uuid primary key references public.app_users (id) on delete cascade,
  first_name text,
  last_name text,
  display_name text,
  email citext,
  employee_code text,
  department text,
  job_title text,
  location text,
  phone text,
  timezone text,
  notes text,
  avatar_url text,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index user_profiles_email_key
  on public.user_profiles (email)
  where email is not null;

create table public.user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  provider public.identity_provider not null,
  provider_subject text not null,
  provider_tenant_id text,
  login_identifier citext,
  email citext,
  is_primary boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (provider, provider_subject)
);

alter table public.rooms
  add column organization_id uuid references public.organizations (id) on delete cascade;

alter table public.rooms
  alter column organization_id set not null;

alter table public.rooms
  drop constraint if exists rooms_slug_key;

create unique index rooms_organization_slug_key
  on public.rooms (organization_id, slug);

create index rooms_organization_created_idx
  on public.rooms (organization_id, created_at desc);

alter table public.sharing_groups
  add column organization_id uuid references public.organizations (id) on delete cascade;

alter table public.sharing_groups
  alter column organization_id set not null;

alter table public.sharing_groups
  drop constraint if exists sharing_groups_slug_key;

create unique index sharing_groups_organization_slug_key
  on public.sharing_groups (organization_id, slug);

create index sharing_groups_organization_name_idx
  on public.sharing_groups (organization_id, name);

create table public.amenities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  name text not null,
  slug citext not null,
  description text,
  icon text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, slug)
);

create table public.desk_amenities (
  id uuid primary key default gen_random_uuid(),
  desk_id uuid not null references public.room_desks (id) on delete cascade,
  amenity_id uuid not null references public.amenities (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (desk_id, amenity_id)
);

alter table public.room_desks
  add column default_status public.desk_default_status not null default 'available',
  add column width integer not null default 1,
  add column height integer not null default 1,
  add column rotation_degrees numeric(6, 2) not null default 0,
  add column z_index integer not null default 0;

create table public.room_zones (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  name text not null,
  zone_type text not null,
  x integer not null,
  y integer not null,
  width integer not null,
  height integer not null,
  color text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index organization_memberships_user_role_idx
  on public.organization_memberships (user_id, role, organization_id);

create index organization_memberships_organization_role_idx
  on public.organization_memberships (organization_id, role, user_id);

create index user_identities_user_idx
  on public.user_identities (user_id, provider);

create index user_identities_login_identifier_idx
  on public.user_identities (login_identifier)
  where login_identifier is not null;

create index amenities_organization_name_idx
  on public.amenities (organization_id, name);

create index desk_amenities_desk_idx
  on public.desk_amenities (desk_id, amenity_id);

create index room_zones_room_idx
  on public.room_zones (room_id, zone_type);

create trigger set_organizations_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

create trigger set_room_zones_updated_at
before update on public.room_zones
for each row
execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_identities enable row level security;
alter table public.amenities enable row level security;
alter table public.desk_amenities enable row level security;
alter table public.room_zones enable row level security;

comment on table public.organizations is
  'Logical admin environments managed by the platform super-admin.';

comment on table public.organization_memberships is
  'Scopes admins and end users to one or more organizations.';

comment on table public.user_profiles is
  'Human profile details for users, kept separate from login mechanics.';

comment on table public.user_identities is
  'Identity-provider mapping so local login can later coexist with Microsoft Entra ID.';

comment on table public.amenities is
  'Desk amenity catalog used by the room designer and search/filter flows.';

comment on table public.desk_amenities is
  'Join table linking desks to amenity tags.';

comment on table public.room_zones is
  'Named layout areas such as conference corners, kitchens, neighborhoods, and restricted sections.';
