-- Private Celebration of Life guestbook foundation.
-- Run this once in the Supabase SQL editor.
-- Raw guestbook rows stay private. Public pages read only the safe public view.

create extension if not exists pgcrypto;

create table if not exists public.celebration_access_tokens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  label text not null,
  token_hash text not null unique,
  is_active boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz
);

create table if not exists public.celebration_guestbook (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  email text not null,
  city text not null,
  state_region text,
  country text not null default 'United States',
  relationship_to_brighton text,
  came_with text,
  memory text,
  photo_bucket text,
  photo_path text,
  photo_original_filename text,
  photo_mime_type text,
  photo_file_size bigint,
  subscribed_to_updates boolean not null default false,
  display_publicly boolean not null default true,
  is_hidden boolean not null default false,
  is_deleted boolean not null default false,
  latitude numeric,
  longitude numeric,
  location_label text,
  access_token_id uuid references public.celebration_access_tokens(id) on delete set null,
  submitted_from_ip_hash text,
  user_agent text,
  admin_notes text
);

create index if not exists celebration_guestbook_created_at_idx on public.celebration_guestbook (created_at desc);
create index if not exists celebration_guestbook_country_idx on public.celebration_guestbook (country);
create index if not exists celebration_guestbook_state_region_idx on public.celebration_guestbook (state_region);
create index if not exists celebration_guestbook_city_idx on public.celebration_guestbook (city);
create index if not exists celebration_guestbook_hidden_deleted_idx on public.celebration_guestbook (is_hidden, is_deleted);
create index if not exists celebration_guestbook_access_token_idx on public.celebration_guestbook (access_token_id);

alter table public.celebration_guestbook
  alter column memory drop not null,
  add column if not exists photo_bucket text,
  add column if not exists photo_path text,
  add column if not exists photo_original_filename text,
  add column if not exists photo_mime_type text,
  add column if not exists photo_file_size bigint,
  add column if not exists subscribed_to_updates boolean not null default false,
  add column if not exists display_publicly boolean not null default true,
  add column if not exists is_hidden boolean not null default false,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists location_label text,
  add column if not exists access_token_id uuid references public.celebration_access_tokens(id) on delete set null,
  add column if not exists submitted_from_ip_hash text,
  add column if not exists user_agent text,
  add column if not exists admin_notes text;

create or replace view public.celebration_guestbook_public as
select
  id,
  created_at,
  name,
  city,
  state_region,
  country,
  relationship_to_brighton,
  came_with,
  memory,
  photo_bucket,
  photo_path,
  photo_original_filename,
  display_publicly,
  latitude,
  longitude,
  location_label
from public.celebration_guestbook
where display_publicly = true
  and is_hidden = false
  and is_deleted = false;

create or replace function public.validate_celebration_access_token(raw_token text)
returns table(access_token_id uuid, label text)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_record public.celebration_access_tokens%rowtype;
begin
  if raw_token is null or length(trim(raw_token)) < 8 then
    return;
  end if;

  select *
    into token_record
  from public.celebration_access_tokens
  where token_hash = encode(extensions.digest(trim(raw_token), 'sha256'), 'hex')
    and is_active = true
    and (expires_at is null or expires_at > now())
  limit 1;

  if token_record.id is null then
    return;
  end if;

  update public.celebration_access_tokens
    set last_used_at = now(),
        updated_at = now()
  where id = token_record.id;

  access_token_id := token_record.id;
  label := token_record.label;
  return next;
end;
$$;

create or replace function public.submit_celebration_guestbook_v2(
  raw_token text,
  guest_name text,
  guest_email text,
  guest_city text,
  guest_state_region text,
  guest_country text,
  guest_relationship text,
  guest_came_with text,
  guest_memory text,
  guest_photo_bucket text default null,
  guest_photo_path text default null,
  guest_photo_original_filename text default null,
  guest_photo_mime_type text default null,
  guest_photo_file_size bigint default null,
  guest_subscribe_updates boolean default false,
  guest_display_publicly boolean default true,
  guest_latitude numeric default null,
  guest_longitude numeric default null,
  guest_location_label text default null,
  guest_user_agent text default null
)
returns table(status text, message text, guestbook_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_id uuid;
  clean_name text := nullif(trim(guest_name), '');
  clean_email text := lower(nullif(trim(guest_email), ''));
  clean_city text := nullif(trim(guest_city), '');
  clean_country text := coalesce(nullif(trim(guest_country), ''), 'United States');
  clean_memory text := nullif(trim(guest_memory), '');
  inserted_id uuid;
begin
  select validated.access_token_id into token_id
  from public.validate_celebration_access_token(raw_token) as validated
  limit 1;

  if token_id is null then
    status := 'invalid_token';
    message := 'This private guest book link is missing or no longer valid.';
    guestbook_id := null;
    return next;
    return;
  end if;

  if clean_name is null or clean_email is null or clean_city is null then
    status := 'missing_required';
    message := 'Please add your name, email, and location.';
    guestbook_id := null;
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.celebration_guestbook
    where lower(email) = clean_email
      and lower(name) = lower(clean_name)
      and coalesce(lower(memory), '') = coalesce(lower(clean_memory), '')
      and created_at > now() - interval '10 minutes'
      and is_deleted = false
  ) then
    status := 'duplicate';
    message := 'It looks like this entry was already added. Thank you for sharing it.';
    guestbook_id := null;
    return next;
    return;
  end if;

  insert into public.celebration_guestbook (
    name,
    email,
    city,
    state_region,
    country,
    relationship_to_brighton,
    came_with,
    memory,
    photo_bucket,
    photo_path,
    photo_original_filename,
    photo_mime_type,
    photo_file_size,
    subscribed_to_updates,
    display_publicly,
    latitude,
    longitude,
    location_label,
    access_token_id,
    user_agent
  ) values (
    clean_name,
    clean_email,
    clean_city,
    nullif(trim(guest_state_region), ''),
    clean_country,
    nullif(trim(guest_relationship), ''),
    nullif(trim(guest_came_with), ''),
    clean_memory,
    nullif(trim(guest_photo_bucket), ''),
    nullif(trim(guest_photo_path), ''),
    nullif(trim(guest_photo_original_filename), ''),
    nullif(trim(guest_photo_mime_type), ''),
    guest_photo_file_size,
    coalesce(guest_subscribe_updates, false),
    coalesce(guest_display_publicly, true),
    guest_latitude,
    guest_longitude,
    nullif(trim(guest_location_label), ''),
    token_id,
    nullif(trim(guest_user_agent), '')
  )
  returning id into inserted_id;

  if coalesce(guest_subscribe_updates, false) then
    perform public.subscribe_to_updates(clean_email, clean_name, 'celebration-guestbook');
  end if;

  status := 'success';
  message := 'Your place has been added. Thank you for celebrating Brighton.';
  guestbook_id := inserted_id;
  return next;
end;
$$;

create or replace function public.submit_celebration_guestbook(
  raw_token text,
  guest_name text,
  guest_email text,
  guest_city text,
  guest_state_region text,
  guest_country text,
  guest_relationship text,
  guest_came_with text,
  guest_memory text,
  guest_display_publicly boolean default true,
  guest_latitude numeric default null,
  guest_longitude numeric default null,
  guest_location_label text default null,
  guest_user_agent text default null
)
returns table(status text, message text, guestbook_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_id uuid;
  clean_name text := nullif(trim(guest_name), '');
  clean_email text := lower(nullif(trim(guest_email), ''));
  clean_city text := nullif(trim(guest_city), '');
  clean_country text := coalesce(nullif(trim(guest_country), ''), 'United States');
  clean_memory text := nullif(trim(guest_memory), '');
  inserted_id uuid;
begin
  select validated.access_token_id into token_id
  from public.validate_celebration_access_token(raw_token) as validated
  limit 1;

  if token_id is null then
    status := 'invalid_token';
    message := 'This private guest book link is missing or no longer valid.';
    guestbook_id := null;
    return next;
    return;
  end if;

  if clean_name is null or clean_email is null or clean_city is null or clean_memory is null then
    status := 'missing_required';
    message := 'Please add your name, email, location, and memory.';
    guestbook_id := null;
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.celebration_guestbook
    where lower(email) = clean_email
      and lower(name) = lower(clean_name)
      and lower(memory) = lower(clean_memory)
      and created_at > now() - interval '10 minutes'
      and is_deleted = false
  ) then
    status := 'duplicate';
    message := 'It looks like this memory was already added. Thank you for sharing it.';
    guestbook_id := null;
    return next;
    return;
  end if;

  insert into public.celebration_guestbook (
    name,
    email,
    city,
    state_region,
    country,
    relationship_to_brighton,
    came_with,
    memory,
    display_publicly,
    latitude,
    longitude,
    location_label,
    access_token_id,
    user_agent
  ) values (
    clean_name,
    clean_email,
    clean_city,
    nullif(trim(guest_state_region), ''),
    clean_country,
    nullif(trim(guest_relationship), ''),
    nullif(trim(guest_came_with), ''),
    clean_memory,
    coalesce(guest_display_publicly, true),
    guest_latitude,
    guest_longitude,
    nullif(trim(guest_location_label), ''),
    token_id,
    nullif(trim(guest_user_agent), '')
  )
  returning id into inserted_id;

  status := 'success';
  message := 'Your memory has been added. Thank you for celebrating Brighton.';
  guestbook_id := inserted_id;
  return next;
end;
$$;

create or replace function public.celebration_guestbook_stats()
returns table(
  people_here bigint,
  countries bigint,
  state_regions bigint,
  memories_shared bigint
)
language sql
security definer
set search_path = public
as $$
  select
    count(*)::bigint as people_here,
    count(distinct nullif(country, ''))::bigint as countries,
    count(distinct nullif(coalesce(state_region, city), ''))::bigint as state_regions,
    count(*) filter (where nullif(memory, '') is not null)::bigint as memories_shared
  from public.celebration_guestbook
  where display_publicly = true
    and is_hidden = false
    and is_deleted = false;
$$;

create or replace function public.admin_list_celebration_guestbook()
returns table(
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  name text,
  email text,
  city text,
  state_region text,
  country text,
  relationship_to_brighton text,
  came_with text,
  memory text,
  photo_bucket text,
  photo_path text,
  photo_original_filename text,
  photo_mime_type text,
  photo_file_size bigint,
  subscribed_to_updates boolean,
  display_publicly boolean,
  is_hidden boolean,
  is_deleted boolean,
  latitude numeric,
  longitude numeric,
  location_label text,
  admin_notes text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_users admin_user
    where admin_user.user_id = auth.uid()
  ) then
    raise exception 'Admin authorization is required';
  end if;

  return query
  select
    guestbook.id,
    guestbook.created_at,
    guestbook.updated_at,
    guestbook.name,
    guestbook.email,
    guestbook.city,
    guestbook.state_region,
    guestbook.country,
    guestbook.relationship_to_brighton,
    guestbook.came_with,
    guestbook.memory,
    guestbook.photo_bucket,
    guestbook.photo_path,
    guestbook.photo_original_filename,
    guestbook.photo_mime_type,
    guestbook.photo_file_size,
    guestbook.subscribed_to_updates,
    guestbook.display_publicly,
    guestbook.is_hidden,
    guestbook.is_deleted,
    guestbook.latitude,
    guestbook.longitude,
    guestbook.location_label,
    guestbook.admin_notes
  from public.celebration_guestbook guestbook
  order by guestbook.created_at desc
  limit 500;
end;
$$;

create or replace function public.admin_update_celebration_guestbook(
  entry_id uuid,
  guest_name text,
  guest_email text,
  guest_city text,
  guest_state_region text,
  guest_country text,
  guest_relationship text,
  guest_came_with text,
  guest_memory text,
  guest_photo_bucket text,
  guest_photo_path text,
  guest_photo_original_filename text,
  guest_subscribed_to_updates boolean,
  guest_display_publicly boolean,
  guest_is_hidden boolean,
  guest_is_deleted boolean,
  guest_latitude numeric,
  guest_longitude numeric,
  guest_location_label text,
  guest_admin_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_users admin_user
    where admin_user.user_id = auth.uid()
  ) then
    raise exception 'Admin authorization is required';
  end if;

  update public.celebration_guestbook
  set
    updated_at = now(),
    name = nullif(trim(guest_name), ''),
    email = lower(nullif(trim(guest_email), '')),
    city = nullif(trim(guest_city), ''),
    state_region = nullif(trim(guest_state_region), ''),
    country = coalesce(nullif(trim(guest_country), ''), 'United States'),
    relationship_to_brighton = nullif(trim(guest_relationship), ''),
    came_with = nullif(trim(guest_came_with), ''),
    memory = nullif(trim(guest_memory), ''),
    photo_bucket = nullif(trim(guest_photo_bucket), ''),
    photo_path = nullif(trim(guest_photo_path), ''),
    photo_original_filename = nullif(trim(guest_photo_original_filename), ''),
    subscribed_to_updates = coalesce(guest_subscribed_to_updates, false),
    display_publicly = coalesce(guest_display_publicly, false),
    is_hidden = coalesce(guest_is_hidden, false),
    is_deleted = coalesce(guest_is_deleted, false),
    latitude = guest_latitude,
    longitude = guest_longitude,
    location_label = nullif(trim(guest_location_label), ''),
    admin_notes = nullif(trim(guest_admin_notes), '')
  where public.celebration_guestbook.id = entry_id;

  if not found then
    raise exception 'Guest book entry was not found';
  end if;
end;
$$;

-- Lightweight moderation helper for single-click hide/delete/restore actions.
-- This keeps admin buttons working even when a browser only sends changed fields.
create or replace function public.admin_moderate_celebration_guestbook(
  entry_id uuid,
  guest_is_hidden boolean default null,
  guest_is_deleted boolean default null,
  guest_display_publicly boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_users admin_user
    where admin_user.user_id = auth.uid()
  ) then
    raise exception 'Admin authorization is required';
  end if;

  update public.celebration_guestbook
  set
    updated_at = now(),
    is_hidden = coalesce(guest_is_hidden, is_hidden),
    is_deleted = coalesce(guest_is_deleted, is_deleted),
    display_publicly = coalesce(guest_display_publicly, display_publicly)
  where public.celebration_guestbook.id = entry_id;

  if not found then
    raise exception 'Guest book entry was not found';
  end if;
end;
$$;

alter table public.celebration_access_tokens enable row level security;
alter table public.celebration_guestbook enable row level security;

drop policy if exists "Admins can manage celebration access tokens" on public.celebration_access_tokens;
create policy "Admins can manage celebration access tokens"
on public.celebration_access_tokens
for all
to authenticated
using (exists (
  select 1 from public.admin_users admin_user
  where admin_user.user_id = auth.uid()
))
with check (exists (
  select 1 from public.admin_users admin_user
  where admin_user.user_id = auth.uid()
));

drop policy if exists "Admins can manage celebration guestbook" on public.celebration_guestbook;
create policy "Admins can manage celebration guestbook"
on public.celebration_guestbook
for all
to authenticated
using (exists (
  select 1 from public.admin_users admin_user
  where admin_user.user_id = auth.uid()
))
with check (exists (
  select 1 from public.admin_users admin_user
  where admin_user.user_id = auth.uid()
));

grant select on public.celebration_guestbook_public to anon, authenticated;
grant execute on function public.validate_celebration_access_token(text) to anon, authenticated;
grant execute on function public.submit_celebration_guestbook(text, text, text, text, text, text, text, text, text, boolean, numeric, numeric, text, text) to anon, authenticated;
grant execute on function public.submit_celebration_guestbook_v2(text, text, text, text, text, text, text, text, text, text, text, text, text, bigint, boolean, boolean, numeric, numeric, text, text) to anon, authenticated;
grant execute on function public.celebration_guestbook_stats() to anon, authenticated;
grant execute on function public.admin_list_celebration_guestbook() to authenticated;
grant execute on function public.admin_update_celebration_guestbook(uuid, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean, numeric, numeric, text, text) to authenticated;
grant execute on function public.admin_moderate_celebration_guestbook(uuid, boolean, boolean, boolean) to authenticated;

-- Optional selfie station uploads are intentionally private. Guests can upload
-- into this bucket, but only authenticated admins can read/manage the files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'celebration-photos',
  'celebration-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Guests can upload celebration photos" on storage.objects;
create policy "Guests can upload celebration photos"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'celebration-photos'
  and (storage.foldername(name))[1] = 'celebration'
);

drop policy if exists "Guests can read public celebration photos" on storage.objects;
create policy "Guests can read public celebration photos"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'celebration-photos'
  and exists (
    select 1
    from public.celebration_guestbook guestbook
    where guestbook.photo_bucket = storage.objects.bucket_id
      and guestbook.photo_path = storage.objects.name
      and guestbook.display_publicly = true
      and guestbook.is_hidden = false
      and guestbook.is_deleted = false
  )
);

drop policy if exists "Admins can read celebration photos" on storage.objects;
create policy "Admins can read celebration photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'celebration-photos'
  and exists (
    select 1 from public.admin_users admin_user
    where admin_user.user_id = auth.uid()
  )
);

drop policy if exists "Admins can manage celebration photos" on storage.objects;
create policy "Admins can manage celebration photos"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'celebration-photos'
  and exists (
    select 1 from public.admin_users admin_user
    where admin_user.user_id = auth.uid()
  )
)
with check (
  bucket_id = 'celebration-photos'
  and exists (
    select 1 from public.admin_users admin_user
    where admin_user.user_id = auth.uid()
  )
);

-- Create the invitation token manually after running this migration.
-- Replace the token string below with the private token printed in the QR code.
--
-- insert into public.celebration_access_tokens (label, token_hash)
-- values (
--   'Brighton Celebration of Life',
--   encode(extensions.digest('REPLACE_WITH_PRIVATE_CELEBRATION_TOKEN', 'sha256'), 'hex')
-- );
