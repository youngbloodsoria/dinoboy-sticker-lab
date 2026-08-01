# Roar Store Checkout Setup

Run `supabase/shop_orders.sql` in the Supabase SQL editor before deploying the
shop Edge Functions.

Deploy these functions:

- `create-shop-checkout`
- `stripe-shop-webhook`

Set these Supabase Edge Function secrets:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_AIR_FORCE_1`
- `STRIPE_PRICE_JORDAN`
- `STRIPE_PRICE_ROAR_BACK_HAT`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SENDGRID_API_KEY`
- `SHOP_ADMIN_EMAIL`
- `SHOP_FROM_EMAIL`

Optional:

- `SHOP_SITE_URL` defaults to `https://dinoboysc.com`
- `SHOP_SUCCESS_URL` defaults to `https://dinoboysc.com/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`
- `SHOP_CANCEL_URL` defaults to `https://dinoboysc.com/product.html?slug={productSlug}&checkout=cancelled`
- `STRIPE_AUTOMATIC_TAX_ENABLED` defaults to enabled unless set to `false`

Browser code must never contain `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
or `SUPABASE_SERVICE_ROLE_KEY`.
