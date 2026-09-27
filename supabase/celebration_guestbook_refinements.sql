-- Targeted map, repeat-guest, and media-review update to the existing guestbook.
-- No new content tables or submit RPC names.
-- Run before deploying the accompanying September 27 JavaScript. Safe to rerun.
begin;
alter table public.celebration_guestbook
  add column if not exists display_latitude numeric,
  add column if not exists display_longitude numeric,
  add column if not exists media_approved boolean not null default true;
-- Preserve all existing published photos; hold only new uploads for review.
alter table public.celebration_guestbook alter column media_approved set default false;

create or replace function public.set_celebration_display_pin()
returns trigger language plpgsql set search_path = public as $$
declare
  center_lat double precision := new.latitude;
  center_lon double precision := new.longitude;
  bearing double precision;
  distance_radians double precision;
  display_lat double precision;
  display_lon double precision;
begin
  if tg_op = 'UPDATE' then
    if new.city is not distinct from old.city
      and new.state_region is not distinct from old.state_region
      and new.country is not distinct from old.country
      and new.latitude is not distinct from old.latitude
      and new.longitude is not distinct from old.longitude
      and old.display_latitude is not null and old.display_longitude is not null then
      -- Preserve the stored display point through moderation and text edits.
      new.display_latitude := old.display_latitude;
      new.display_longitude := old.display_longitude;
      return new;
    end if;
  end if;
  -- Fill gaps in the existing browser lookup for the examples in this update.
  -- Keep the original normalized coordinates untouched for statistics/history.
  if lower(trim(new.city)) = 'austin' and lower(trim(new.state_region)) in ('tx', 'texas')
    and lower(trim(new.country)) = 'united states' then
    center_lat := 30.2672; center_lon := -97.7431;
  elsif lower(trim(new.city)) = 'london' and lower(trim(new.country)) in ('united kingdom', 'uk', 'england') then
    center_lat := 51.5074; center_lon := -0.1278;
  end if;
  if center_lat is null or center_lon is null or not (center_lat between -90 and 90 and center_lon between -180 and 180) then
    new.display_latitude := null;
    new.display_longitude := null;
    return new;
  end if;
  -- Random point 8–30 km from the approximate origin; never an address lookup.
  bearing := random() * 2 * pi();
  distance_radians := sqrt(64 + random() * (900 - 64)) / 6371;
  display_lat := asin(sin(radians(center_lat)) * cos(distance_radians)
    + cos(radians(center_lat)) * sin(distance_radians) * cos(bearing));
  display_lon := radians(center_lon) + atan2(sin(bearing) * sin(distance_radians) * cos(radians(center_lat)),
    cos(distance_radians) - sin(radians(center_lat)) * sin(display_lat));
  display_lon := degrees(display_lon);
  display_lon := display_lon - floor((display_lon + 180) / 360) * 360;
  new.display_latitude := round(degrees(display_lat)::numeric, 4);
  new.display_longitude := round(display_lon::numeric, 4);
  return new;
end;
$$;
revoke all on function public.set_celebration_display_pin() from public;
drop trigger if exists celebration_display_pin on public.celebration_guestbook;
create trigger celebration_display_pin before insert or update on public.celebration_guestbook
for each row execute function public.set_celebration_display_pin();

-- Existing entries get a point only if one is missing. Reruns do not move pins.
update public.celebration_guestbook set display_latitude = null
where display_latitude is null or display_longitude is null;

-- Same safe fields and visibility conditions; append only the two display fields.
create or replace view public.celebration_guestbook_public as
select id, created_at, name, city, state_region, country, relationship_to_brighton,
 came_with, memory,
 case when media_approved then photo_bucket else null end as photo_bucket,
 case when media_approved then photo_path else null end as photo_path,
 case when media_approved then photo_original_filename else null end as photo_original_filename,
 display_publicly, latitude, longitude, location_label, display_latitude, display_longitude,
 case when media_approved then photo_mime_type else null end as photo_mime_type
from public.celebration_guestbook
where display_publicly = true and is_hidden = false and is_deleted = false;
grant select on public.celebration_guestbook_public to anon, authenticated;

-- Keep the existing submit/list/moderation function names and guestbook records.
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

  if nullif(trim(guest_photo_path), '') is not null then
    if guest_photo_bucket is distinct from 'celebration-photos'
      or guest_photo_path not like 'celebration/%'
      or not exists (select 1 from storage.objects where bucket_id = 'celebration-photos' and name = guest_photo_path) then
      raise exception 'The uploaded photo or video was not found. Please try again.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(clean_email || ':' || lower(clean_name) || ':' || coalesce(nullif(trim(guest_photo_path), ''), clean_memory, ''), 0));

  if exists (
    select 1
    from public.celebration_guestbook
    where lower(email) = clean_email
      and lower(name) = lower(clean_name)
      and ((nullif(trim(guest_photo_path), '') is not null and photo_path = trim(guest_photo_path))
        or (nullif(trim(guest_photo_path), '') is null and photo_path is null
          and coalesce(lower(memory), '') = coalesce(lower(clean_memory), '')
          and created_at > now() - interval '10 minutes'))
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

drop function public.admin_list_celebration_guestbook();
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
  admin_notes text,
  media_approved boolean
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
    guestbook.admin_notes,
    guestbook.media_approved
  from public.celebration_guestbook guestbook
  order by guestbook.created_at desc
  limit 500;
end;
$$;

drop function if exists public.admin_moderate_celebration_guestbook(uuid, boolean, boolean, boolean);
create or replace function public.admin_moderate_celebration_guestbook(
  entry_id uuid,
  guest_is_hidden boolean default null,
  guest_is_deleted boolean default null,
  guest_display_publicly boolean default null,
  guest_media_approved boolean default null
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
    media_approved = coalesce(guest_media_approved, media_approved),
    is_hidden = coalesce(guest_is_hidden, is_hidden),
    is_deleted = coalesce(guest_is_deleted, is_deleted),
    display_publicly = coalesce(guest_display_publicly, display_publicly)
  where public.celebration_guestbook.id = entry_id;

  if not found then
    raise exception 'Guest book entry was not found';
  end if;
end;
$$;


revoke all on function public.admin_list_celebration_guestbook() from public;
grant execute on function public.admin_list_celebration_guestbook() to authenticated;
revoke all on function public.admin_moderate_celebration_guestbook(uuid, boolean, boolean, boolean, boolean) from public;
grant execute on function public.admin_moderate_celebration_guestbook(uuid, boolean, boolean, boolean, boolean) to authenticated;

-- The existing private bucket and read policy continue to use the public view.
update storage.buckets set file_size_limit = 52428800,
 allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/webm','video/quicktime']
where id = 'celebration-photos';

-- Additional stories/uploads must not count the same guest repeatedly.
create or replace function public.celebration_guestbook_stats()
returns table(people_here bigint, countries bigint, state_regions bigint, memories_shared bigint)
language sql security definer set search_path = public as $$
 select count(distinct (lower(email), lower(name)))::bigint,
 count(distinct nullif(country, ''))::bigint,
 count(distinct nullif(coalesce(state_region, city), ''))::bigint,
 count(*) filter (where nullif(memory, '') is not null)::bigint
 from public.celebration_guestbook where display_publicly and not is_hidden and not is_deleted;
$$;

commit;
