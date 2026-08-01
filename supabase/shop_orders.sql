-- Roar Store checkout support.
-- Run this once in Supabase SQL Editor before deploying the shop Edge Functions.
-- It extends the existing shop_orders table without exposing shop order data publicly.

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  order_number text not null default ('ROAR-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  customer_name text,
  email text,
  phone text,
  shipping_address jsonb,
  items jsonb not null default '[]'::jsonb,
  size text,
  quantity int not null default 1,
  subtotal numeric(10,2),
  tax numeric(10,2),
  total numeric(10,2),
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  status text not null default 'pending',
  notes text
);

alter table public.shop_orders
  add column if not exists product_type text,
  add column if not exists product_slug text,
  add column if not exists product_name text,
  add column if not exists style text,
  add column if not exists option_label text,
  add column if not exists option_value text,
  add column if not exists currency text not null default 'usd',
  add column if not exists stripe_customer_id text,
  add column if not exists payment_status text,
  add column if not exists impact_amount numeric(10,2),
  add column if not exists lead_time text,
  add column if not exists admin_email_sent_at timestamptz,
  add column if not exists customer_email_sent_at timestamptz;

alter table public.shop_orders
  drop constraint if exists shop_orders_quantity_check,
  add constraint shop_orders_quantity_check
    check (quantity > 0 and quantity <= 20);

alter table public.shop_orders
  drop constraint if exists shop_orders_status_check,
  add constraint shop_orders_status_check
    check (status in ('pending', 'paid', 'ordered', 'shipped', 'completed', 'canceled', 'refunded', 'payment_failed'));

create unique index if not exists shop_orders_order_number_unique_idx
  on public.shop_orders (order_number);

create unique index if not exists shop_orders_checkout_session_unique_idx
  on public.shop_orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists shop_orders_status_created_at_idx
  on public.shop_orders (status, created_at desc);

create index if not exists shop_orders_email_idx
  on public.shop_orders (lower(email))
  where email is not null;

alter table public.shop_orders enable row level security;

grant insert, select, update on public.shop_orders to service_role;

drop policy if exists "Admins can manage shop orders"
  on public.shop_orders;

create policy "Admins can manage shop orders"
on public.shop_orders
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Do not grant anon select/insert/update/delete on shop_orders.
-- Public checkout is handled by Supabase Edge Functions using server-side
-- Stripe and Supabase service credentials.

comment on table public.shop_orders is
  'Roar Store order records populated by Stripe Checkout Edge Functions and webhooks. Public browser code must not write directly to this table.';
