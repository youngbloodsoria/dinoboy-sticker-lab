-- Run this if uploaded guest book photos save correctly but the public/private
-- guest book page shows "Photo shared. Loading soon."

create or replace function public.can_read_celebration_photo(
  photo_bucket text,
  photo_name text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.celebration_guestbook_public guestbook
    where guestbook.photo_bucket = can_read_celebration_photo.photo_bucket
      and guestbook.photo_path = can_read_celebration_photo.photo_name
  );
$$;

grant execute on function public.can_read_celebration_photo(text, text) to anon, authenticated;

drop policy if exists "Guests can read public celebration photos" on storage.objects;
create policy "Guests can read public celebration photos"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'celebration-photos'
  and public.can_read_celebration_photo(storage.objects.bucket_id, storage.objects.name)
);
