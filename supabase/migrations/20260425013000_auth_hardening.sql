alter table public.app_users
  add column if not exists session_version integer not null default 1;

alter table public.app_users
  add constraint app_users_session_version_positive
  check (session_version >= 1);

alter table public.app_sessions
  add column if not exists session_version integer not null default 1;

alter table public.app_sessions
  add column if not exists revoked_reason text;

update public.app_sessions as sessions
set session_version = users.session_version
from public.app_users as users
where users.id = sessions.user_id
  and sessions.session_version is distinct from users.session_version;

create index if not exists idx_app_sessions_user_active_version
  on public.app_sessions (user_id, session_version, expires_at desc)
  where revoked_at is null;

create table if not exists public.auth_rate_limits (
  scope_key text primary key,
  scope_type text not null,
  scope_identifier_hash text not null,
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default timezone('utc', now()),
  last_attempt_at timestamptz not null default timezone('utc', now()),
  blocked_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint auth_rate_limits_attempt_count_non_negative check (attempt_count >= 0)
);

create index if not exists auth_rate_limits_scope_type_blocked_idx
  on public.auth_rate_limits (scope_type, blocked_until);

create trigger set_auth_rate_limits_updated_at
before update on public.auth_rate_limits
for each row
execute function public.set_updated_at();

alter table public.auth_rate_limits enable row level security;

create table if not exists public.platform_security_settings (
  singleton_key boolean primary key default true,
  bootstrap_completed_at timestamptz,
  bootstrap_completed_by_user_id uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint platform_security_settings_singleton check (singleton_key = true)
);

create trigger set_platform_security_settings_updated_at
before update on public.platform_security_settings
for each row
execute function public.set_updated_at();

alter table public.platform_security_settings enable row level security;

comment on table public.auth_rate_limits is
  'Stores short-lived authentication throttle state for usernames and client IP scopes.';

comment on table public.platform_security_settings is
  'Singleton security settings row used for one-time bootstrap and future platform hardening flags.';
