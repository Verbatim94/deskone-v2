alter table public.app_users
add column if not exists must_change_password boolean not null default false;

comment on column public.app_users.must_change_password is
  'Forces the user to replace an admin-issued temporary password before accessing the full product.';
