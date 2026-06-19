-- DinoBoy Sticker Lab submission foundation.
-- Run this in the Supabase SQL editor before applying rls.sql.
-- This schema stores private incoming submissions for manual review.

create extension if not exists pgcrypto;

create table if not exists public.sticker_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  child_name text not null,
  child_age int,
  diagnosis text,
  sticker_title text,
  sticker_message text,
  story text,

  parent_guardian_name text not null,
  parent_guardian_email text not null,
  parent_guardian_phone text,
  shipping_recipient_name text,
  shipping_address_1 text,
  shipping_address_2 text,
  shipping_city text,
  shipping_state text,
  shipping_postal_code text,
  shipping_country text not null default 'US',

  consent_parent boolean not null default false,
  consent_treatment boolean not null default false,
  consent_review boolean not null default false,
  consent_publish boolean not null default false,
  consent_shipping boolean not null default false,

  status text not null default 'new',
  admin_notes text,
  producer_notes text,

  approved_display_name text,
  approved_age int,
  approved_battle_type text,
  approved_tagline text,
  approved_story text,
  approved_card_image_url text,
  approved_sticker_image_url text,

  producer_status text not null default 'not_ready',
  producer_sent_at timestamptz,
  producer_tracking_url text,
  producer_quantity int not null default 100,
  producer_size text not null default '3 inch die-cut sticker',
  producer_edge_text text not null default 'dinoboysc.com',
  producer_finish text not null default 'Full-color die-cut vinyl sticker with dinoboysc.com around the edge of the final approved art',

  constraint sticker_submissions_status_check
    check (status in ('new', 'in_review', 'approved', 'needs_followup', 'rejected', 'archived')),
  constraint sticker_submissions_producer_status_check
    check (producer_status in ('not_ready', 'ready', 'batched', 'sent', 'printed', 'shipped', 'delivered', 'hold')),
  constraint sticker_submissions_producer_quantity_check
    check (producer_quantity > 0 and producer_quantity <= 1000),
  constraint sticker_submissions_child_age_check
    check (child_age is null or (child_age >= 0 and child_age <= 21)),
  constraint sticker_submissions_approved_age_check
    check (approved_age is null or (approved_age >= 0 and approved_age <= 21))
);

alter table public.sticker_submissions
  add column if not exists shipping_recipient_name text,
  add column if not exists shipping_address_1 text,
  add column if not exists shipping_address_2 text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state text,
  add column if not exists shipping_postal_code text,
  add column if not exists shipping_country text not null default 'US',
  add column if not exists consent_treatment boolean not null default false,
  add column if not exists consent_shipping boolean not null default false,
  add column if not exists producer_quantity int not null default 100,
  add column if not exists producer_size text not null default '3 inch die-cut sticker',
  add column if not exists producer_edge_text text not null default 'dinoboysc.com',
  add column if not exists producer_finish text not null default 'Full-color die-cut vinyl sticker with dinoboysc.com around the edge of the final approved art';

alter table public.sticker_submissions
  drop constraint if exists sticker_submissions_producer_status_check,
  drop constraint if exists sticker_submissions_producer_quantity_check;

alter table public.sticker_submissions
  add constraint sticker_submissions_producer_status_check
    check (producer_status in ('not_ready', 'ready', 'batched', 'sent', 'printed', 'shipped', 'delivered', 'hold')),
  add constraint sticker_submissions_producer_quantity_check
    check (producer_quantity > 0 and producer_quantity <= 1000);

create table if not exists public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.sticker_submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  file_type text not null,
  bucket text not null default 'submission-uploads',
  path text not null,
  original_filename text,
  mime_type text,
  file_size bigint,

  constraint submission_files_bucket_check
    check (bucket = 'submission-uploads'),
  constraint submission_files_file_type_check
    check (file_type in ('drawing_photo_1', 'drawing_photo_2', 'drawing_photo_3')),
  constraint submission_files_path_check
    check (path like ('submissions/' || submission_id::text || '/%'))
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.production_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  status text not null default 'draft',
  producer_name text,
  producer_email text,
  sent_at timestamptz,
  completed_at timestamptz,
  notes text,

  constraint production_batches_status_check
    check (status in ('draft', 'sent', 'completed', 'canceled'))
);

create table if not exists public.production_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  submission_id uuid not null references public.sticker_submissions(id) on delete restrict,
  created_at timestamptz not null default now(),
  quantity int not null default 100,
  sticker_size text not null default '3 inch die-cut sticker',
  edge_text text not null default 'dinoboysc.com',
  finish text not null default 'Full-color die-cut vinyl sticker with dinoboysc.com around the edge of the final approved art',
  artwork_url text,
  card_image_url text,
  display_name text,
  sticker_title text,
  producer_notes text,
  ship_to_name text,
  ship_to_address_1 text,
  ship_to_address_2 text,
  ship_to_city text,
  ship_to_state text,
  ship_to_postal_code text,
  ship_to_country text not null default 'US',
  status text not null default 'queued',
  tracking_url text,

  constraint production_batch_items_quantity_check
    check (quantity > 0 and quantity <= 1000),
  constraint production_batch_items_status_check
    check (status in ('queued', 'sent', 'printed', 'shipped', 'delivered', 'hold')),
  constraint production_batch_items_unique_submission
    unique (submission_id)
);

create index if not exists sticker_submissions_created_at_idx
  on public.sticker_submissions (created_at desc);

create index if not exists sticker_submissions_status_idx
  on public.sticker_submissions (status);

create index if not exists submission_files_submission_id_idx
  on public.submission_files (submission_id);

create index if not exists admin_users_email_idx
  on public.admin_users (lower(email));

create index if not exists production_batches_created_at_idx
  on public.production_batches (created_at desc);

create index if not exists production_batches_status_idx
  on public.production_batches (status);

create index if not exists production_batch_items_batch_id_idx
  on public.production_batch_items (batch_id);

create index if not exists production_batch_items_submission_id_idx
  on public.production_batch_items (submission_id);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_sticker_submissions_updated_at on public.sticker_submissions;

create trigger set_sticker_submissions_updated_at
before update on public.sticker_submissions
for each row
execute function public.set_updated_at();

drop trigger if exists set_production_batches_updated_at on public.production_batches;

create trigger set_production_batches_updated_at
before update on public.production_batches
for each row
execute function public.set_updated_at();

comment on table public.sticker_submissions is
  'Private incoming DinoBoy Sticker Lab submissions. Nothing should be shown publicly until status is manually approved.';

comment on table public.submission_files is
  'Private file metadata for uploaded drawing photos stored in the submission-uploads bucket.';

comment on table public.admin_users is
  'Allowlist of Supabase Auth users who can review DinoBoy Sticker Lab submissions.';

comment on table public.production_batches is
  'Weekly or ad hoc sticker production batches prepared for the outside sticker producer.';

comment on table public.production_batch_items is
  'Denormalized producer-ready sticker orders with artwork specs and shipping details.';

comment on function public.is_admin() is
  'Returns true when the current authenticated Supabase user is in public.admin_users.';
