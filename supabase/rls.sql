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

-- Table privileges are still required before RLS policies can allow an action.
-- Grant INSERT only. Do not grant public SELECT/UPDATE/DELETE.
grant insert on public.sticker_submissions to anon;
grant insert on public.submission_files to anon;

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
-- or delete any submission data. Admin access will be handled later through
-- the Supabase dashboard or a protected admin route.

-- Private storage bucket upload policies.
-- These policies only permit anonymous INSERT uploads. They do not permit
-- anonymous SELECT/download, UPDATE, or DELETE from the private bucket.
grant insert on storage.objects to anon;

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

-- Optional future hardening:
-- Add a protected Edge Function or authenticated admin route to validate file
-- counts, sizes, and MIME types server-side before accepting uploads.
