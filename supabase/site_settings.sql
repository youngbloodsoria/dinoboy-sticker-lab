-- Site-wide public settings for small feature flags.
-- Run this in Supabase SQL Editor after deploying the code.

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.site_settings enable row level security;

insert into public.site_settings (key, value)
values ('five_lessons_enabled', 'true'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_public_site_settings()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from public.site_settings
  where key in ('five_lessons_enabled');
$$;

create or replace function public.admin_set_site_setting(setting_key text, setting_value jsonb)
returns public.site_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_setting public.site_settings;
begin
  if not public.is_admin() then
    raise exception 'Admin authorization is required';
  end if;

  if setting_key not in ('five_lessons_enabled') then
    raise exception 'Unsupported site setting: %', setting_key;
  end if;

  insert into public.site_settings (key, value, updated_by)
  values (setting_key, setting_value, auth.jwt() ->> 'email')
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now(),
        updated_by = auth.jwt() ->> 'email'
  returning * into updated_setting;

  return updated_setting;
end;
$$;

drop function if exists public.admin_set_site_setting(text, boolean);

create or replace function public.admin_set_boolean_site_setting(setting_key text, setting_value boolean)
returns public.site_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_setting public.site_settings;
begin
  if not public.is_admin() then
    raise exception 'Admin authorization is required';
  end if;

  if setting_key not in ('five_lessons_enabled') then
    raise exception 'Unsupported site setting: %', setting_key;
  end if;

  insert into public.site_settings (key, value, updated_by)
  values (setting_key, to_jsonb(setting_value), auth.jwt() ->> 'email')
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now(),
        updated_by = auth.jwt() ->> 'email'
  returning * into updated_setting;

  return updated_setting;
end;
$$;

drop policy if exists "Admins can read site settings" on public.site_settings;
create policy "Admins can read site settings"
on public.site_settings
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update site settings" on public.site_settings;
create policy "Admins can update site settings"
on public.site_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant execute on function public.get_public_site_settings() to anon, authenticated;
grant execute on function public.admin_set_site_setting(text, jsonb) to authenticated;
grant execute on function public.admin_set_boolean_site_setting(text, boolean) to authenticated;
grant select, insert, update on public.site_settings to authenticated;

comment on table public.site_settings is
  'Small feature flags and public-safe site settings. Raw table access is admin-only; public pages use get_public_site_settings().';

comment on function public.get_public_site_settings() is
  'Returns public-safe feature flags for browser pages without exposing private admin settings.';

comment on function public.admin_set_site_setting(text, jsonb) is
  'Admin-only helper for changing public feature flags, such as enabling the Five Lessons reader.';

comment on function public.admin_set_boolean_site_setting(text, boolean) is
  'Admin-only helper for browser toggles that send true/false feature flags directly.';
