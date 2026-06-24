-- DinoBoy Sticker Lab Row Level Security.
-- Run this after schema.sql.
--
-- Storage setup notes:
-- 1. In Supabase Storage, create a PRIVATE bucket named:
--    submission-uploads
-- 2. In Supabase Storage, create a public-read bucket named:
--    approved-stickers
--    Use this for cleaned/approved public card and sticker images only.
-- 3. Browser uploads should use this path pattern:
--    submissions/{submission_id}/{timestamp}-{safe_filename}
-- 4. The policies below allow anonymous browser uploads only into the private
--    submission-uploads bucket. They do not allow public reads from raw uploads.
--    Admin review can happen through the
--    Supabase dashboard or a future authenticated admin route.
--
-- IMPORTANT:
-- Do not put the service role key in frontend code. Frontend code should only
-- use the public anon key.

alter table public.sticker_submissions enable row level security;
alter table public.submission_files enable row level security;
alter table public.admin_users enable row level security;
alter table public.production_batches enable row level security;
alter table public.production_batch_items enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.site_updates enable row level security;

-- Table privileges are still required before RLS policies can allow an action.
-- Grant public INSERT only on safe intake columns. Do not grant public
-- SELECT/UPDATE/DELETE, and do not allow public inserts into admin/publication
-- fields such as approved_* or is_public.
revoke insert on public.sticker_submissions from public;
revoke insert on public.sticker_submissions from anon;
revoke insert on public.sticker_submissions from authenticated;
grant insert (
  id,
  child_name,
  child_age,
  diagnosis,
  sticker_title,
  sticker_message,
  story,
  parent_guardian_name,
  parent_guardian_email,
  parent_guardian_phone,
  shipping_recipient_name,
  shipping_address_1,
  shipping_address_2,
  shipping_city,
  shipping_state,
  shipping_postal_code,
  shipping_country,
  consent_parent,
  consent_treatment,
  consent_review,
  consent_publish,
  consent_shipping,
  consent_updates
) on public.sticker_submissions to anon, authenticated;
grant insert on public.submission_files to anon, authenticated;
grant select on public.public_fighters to anon, authenticated;
grant select on public.public_updates to anon, authenticated;
grant execute on function public.subscribe_to_updates(text, text, text) to anon, authenticated;
grant execute on function public.unsubscribe_from_updates(text) to anon, authenticated;

-- Authenticated admin reviewers can read/update review fields and read files.
-- RLS policies below still require the user to be on the admin_users allowlist.
grant select on public.sticker_submissions to authenticated;
grant update (
  status,
  admin_notes,
  producer_notes,
  approved_display_name,
  approved_age,
  approved_battle_type,
  approved_tagline,
  approved_story,
  approved_card_image_url,
  approved_sticker_image_url,
  producer_status,
  producer_sent_at,
  producer_tracking_url,
  producer_quantity,
  producer_size,
  producer_edge_text,
  producer_finish,
  shipping_recipient_name,
  shipping_address_1,
  shipping_address_2,
  shipping_city,
  shipping_state,
  shipping_postal_code,
  shipping_country,
  fighter_slug,
  is_public,
  approved_at,
  approved_by
) on public.sticker_submissions to authenticated;
grant select on public.submission_files to authenticated;
grant select on public.admin_users to authenticated;
grant select, insert, update on public.production_batches to authenticated;
grant select, insert, update on public.production_batch_items to authenticated;
grant select, update on public.newsletter_subscribers to authenticated;
grant select, insert, update on public.site_updates to authenticated;

drop policy if exists "Public can create consented sticker submissions"
  on public.sticker_submissions;

create policy "Public can create consented sticker submissions"
on public.sticker_submissions
for insert
to anon, authenticated
with check (
  consent_parent is true
  and consent_treatment is true
  and consent_review is true
  and consent_shipping is true
  and shipping_recipient_name is not null
  and shipping_address_1 is not null
  and shipping_city is not null
  and shipping_state is not null
  and shipping_postal_code is not null
  and shipping_country is not null
  and status = 'new'
  and producer_status = 'not_ready'
  and fighter_slug is null
  and is_public is false
  and approved_at is null
  and approved_by is null
);

drop policy if exists "Public can create submission file metadata"
  on public.submission_files;

create policy "Public can create submission file metadata"
on public.submission_files
for insert
to anon, authenticated
with check (
  bucket = 'submission-uploads'
  and path like ('submissions/' || submission_id::text || '/%')
);

-- No public SELECT/UPDATE/DELETE policies are intentionally defined for either
-- table. Public visitors can create submissions, but cannot read, edit, list,
-- or delete any submission data.

drop policy if exists "Admins can read own admin profile"
  on public.admin_users;

create policy "Admins can read own admin profile"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read sticker submissions"
  on public.sticker_submissions;

create policy "Admins can read sticker submissions"
on public.sticker_submissions
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update sticker submissions"
  on public.sticker_submissions;

create policy "Admins can update sticker submissions"
on public.sticker_submissions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can read submission file metadata"
  on public.submission_files;

create policy "Admins can read submission file metadata"
on public.submission_files
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can read production batches"
  on public.production_batches;

create policy "Admins can read production batches"
on public.production_batches
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can create production batches"
  on public.production_batches;

create policy "Admins can create production batches"
on public.production_batches
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update production batches"
  on public.production_batches;

create policy "Admins can update production batches"
on public.production_batches
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can read production batch items"
  on public.production_batch_items;

create policy "Admins can read production batch items"
on public.production_batch_items
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can create production batch items"
  on public.production_batch_items;

create policy "Admins can create production batch items"
on public.production_batch_items
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update production batch items"
  on public.production_batch_items;

create policy "Admins can update production batch items"
on public.production_batch_items
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can read newsletter subscribers"
  on public.newsletter_subscribers;

create policy "Admins can read newsletter subscribers"
on public.newsletter_subscribers
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update newsletter subscribers"
  on public.newsletter_subscribers;

create policy "Admins can update newsletter subscribers"
on public.newsletter_subscribers
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can read site updates"
  on public.site_updates;

create policy "Admins can read site updates"
on public.site_updates
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can create site updates"
  on public.site_updates;

create policy "Admins can create site updates"
on public.site_updates
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update site updates"
  on public.site_updates;

create policy "Admins can update site updates"
on public.site_updates
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- To add an admin reviewer, create their Supabase Auth user first with a
-- password, then check that the user exists:
-- select id, email, created_at
-- from auth.users
-- where lower(email) = lower('your-admin-email@example.com');
--
-- Then add the allowlist row:
-- insert into public.admin_users (user_id, email)
-- select id, email
-- from auth.users
-- where lower(email) = lower('your-admin-email@example.com')
-- on conflict (user_id) do nothing;

-- Private storage bucket upload policies.
-- These policies permit public-form uploads from logged-out visitors and from
-- browsers that still have an admin Supabase Auth session. They do not permit
-- anonymous SELECT/download, UPDATE, or DELETE from the private bucket.
grant insert on storage.objects to anon, authenticated;
grant select on storage.objects to anon, authenticated;

drop policy if exists "Public can upload submission files"
  on storage.objects;

create policy "Public can upload submission files"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'submission-uploads'
  and (storage.foldername(name))[1] = 'submissions'
);

drop policy if exists "Admins can read submission uploads"
  on storage.objects;

create policy "Admins can read submission uploads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'submission-uploads'
  and public.is_admin()
);

drop policy if exists "Admins can upload approved sticker images"
  on storage.objects;

create policy "Admins can upload approved sticker images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'approved-stickers'
  and public.is_admin()
);

drop policy if exists "Public can read approved sticker images"
  on storage.objects;

create policy "Public can read approved sticker images"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'approved-stickers'
);

drop policy if exists "Admins can upload update images"
  on storage.objects;

create policy "Admins can upload update images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'update-images'
  and public.is_admin()
);

drop policy if exists "Public can read update images"
  on storage.objects;

create policy "Public can read update images"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'update-images'
);

-- Optional future hardening:
-- Add a protected Edge Function or authenticated admin route to validate file
-- counts, sizes, and MIME types server-side before accepting uploads.
