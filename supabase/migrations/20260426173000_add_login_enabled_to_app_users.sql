alter table public.app_users
  add column if not exists login_enabled boolean not null default true;

create index if not exists idx_app_users_login_enabled
  on public.app_users (login_enabled)
  where login_enabled = true;

comment on column public.app_users.login_enabled is 'Controls whether a user is currently allowed to authenticate interactively.';
