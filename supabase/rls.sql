-- DinoBoy Sticker Lab Row Level Security.
-- Run this after schema.sql.
--
-- Storage setup notes:
-- 1. In Supabase Storage, create a PRIVATE bucket named:
--    submission-uploads
-- 2. Browser uploads should use this path pattern:
--    submissions/{submission_id}/{timestamp}-{safe_filename}
-- 3. The policies below allow anonymous browser uploads only into that bucket.
--    They do not allow public reads. Admin review can happen through the
--    Supabase dashboard or a future authenticated admin route.
--
-- IMPORTANT:
-- Do not put the service role key in frontend code. Frontend code should only
-- use the public anon key.

alter table public.sticker_submissions enable row level security;
alter table public.submission_files enable row level security;
alter table public.admin_users enable row level security;

-- Table privileges are still required before RLS policies can allow an action.
-- Grant public INSERT only. Do not grant public SELECT/UPDATE/DELETE.
grant insert on public.sticker_submissions to anon;
grant insert on public.submission_files to anon;

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
  producer_tracking_url
) on public.sticker_submissions to authenticated;
grant select on public.submission_files to authenticated;
grant select on public.admin_users to authenticated;

drop policy if exists "Public can create consented sticker submissions"
  on public.sticker_submissions;

create policy "Public can create consented sticker submissions"
on public.sticker_submissions
for insert
to anon
with check (
  consent_parent is true
  and consent_review is true
  and consent_publish is true
  and status = 'new'
  and producer_status = 'not_ready'
  and admin_notes is null
  and producer_notes is null
  and approved_display_name is null
  and approved_age is null
  and approved_battle_type is null
  and approved_tagline is null
  and approved_story is null
  and approved_card_image_url is null
  and approved_sticker_image_url is null
  and producer_sent_at is null
  and producer_tracking_url is null
);

drop policy if exists "Public can create submission file metadata"
  on public.submission_files;

create policy "Public can create submission file metadata"
on public.submission_files
for insert
to anon
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

-- To add an admin reviewer after creating their Supabase Auth user:
-- insert into public.admin_users (user_id, email)
-- select id, email
-- from auth.users
-- where email = 'your-admin-email@example.com'
-- on conflict (user_id) do nothing;

-- Private storage bucket upload policies.
-- These policies only permit anonymous INSERT uploads. They do not permit
-- anonymous SELECT/download, UPDATE, or DELETE from the private bucket.
grant insert on storage.objects to anon;
grant select on storage.objects to authenticated;

drop policy if exists "Public can upload submission files"
  on storage.objects;

create policy "Public can upload submission files"
on storage.objects
for insert
to anon
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

-- Optional future hardening:
-- Add a protected Edge Function or authenticated admin route to validate file
-- counts, sizes, and MIME types server-side before accepting uploads.
