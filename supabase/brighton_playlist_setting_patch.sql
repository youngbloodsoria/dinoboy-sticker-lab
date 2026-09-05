-- Minimal patch for Brighton's Playlist visibility setting.
-- Run this in Supabase SQL Editor if the admin page says:
-- "Unsupported site setting: brighton_playlist_enabled"

insert into public.site_settings (key, value)
values ('brighton_playlist_enabled', 'true'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_public_site_settings()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from public.site_settings
  where key in ('five_lessons_enabled', 'brighton_playlist_enabled');
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

  if setting_key not in ('five_lessons_enabled', 'brighton_playlist_enabled') then
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

  if setting_key not in ('five_lessons_enabled', 'brighton_playlist_enabled') then
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

grant execute on function public.get_public_site_settings() to anon, authenticated;
grant execute on function public.admin_set_site_setting(text, jsonb) to authenticated;
grant execute on function public.admin_set_boolean_site_setting(text, boolean) to authenticated;

select pg_notify('pgrst', 'reload schema');
