import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type ProductConfig = {
  displayName: string;
  priceEnv: string;
  fallbackPriceCents: number;
  impactCents: number;
  leadTime: string;
  productType: "shoe" | "hat";
};

const shoeSizes = new Set([
  "Children 10",
  "Children 11",
  "Children 12",
  "Children 13",
  "Youth 1",
  "Youth 2",
  "Youth 3",
  "Youth 4",
  "Youth 5",
  "Youth 6",
  "Men 6 / Women 7.5",
  "Men 7 / Women 8.5",
  "Men 8 / Women 9.5",
  "Men 9 / Women 10.5",
  "Men 10 / Women 11.5",
  "Men 11 / Women 12.5",
  "Men 12",
  "Men 13"
]);

const hatColors = new Set([
  "Black",
  "Charcoal",
  "Heather Gray",
  "Navy",
  "Royal Blue",
  "Loden Green",
  "White",
  "Brown",
  "Ask About Another Branded Bills Color"
]);

const products: Record<string, ProductConfig> = {
  "brighton-hand-painted-shoes:air-force-1": {
    displayName: "Brighton Hand-Painted Air Force 1s",
    priceEnv: "STRIPE_PRICE_AIR_FORCE_1",
    fallbackPriceCents: 31900,
    impactCents: 2500,
    leadTime: "2-4 week lead time estimate",
    productType: "shoe"
  },
  "brighton-hand-painted-shoes:jordan": {
    displayName: "Brighton Hand-Painted Jordans",
    priceEnv: "STRIPE_PRICE_JORDAN",
    fallbackPriceCents: 41900,
    impactCents: 2500,
    leadTime: "2-4 week lead time estimate",
    productType: "shoe"
  },
  "percy-roar-back-hat:percy-roar-back-hat": {
    displayName: "Percy Roar Back Hat",
    priceEnv: "STRIPE_PRICE_ROAR_BACK_HAT",
    fallbackPriceCents: 6500,
    impactCents: 500,
    leadTime: "Made on request. Ships in about 1-2 weeks.",
    productType: "hat"
  },
  "roar-back-blue-hat:roar-back-blue-hat": {
    displayName: "Blue Roar Back Hat",
    priceEnv: "STRIPE_PRICE_ROAR_BACK_HAT",
    fallbackPriceCents: 6500,
    impactCents: 500,
    leadTime: "Made on request. Ships in about 1-2 weeks.",
    productType: "hat"
  },
  "roar-back-black-hat:roar-back-black-hat": {
    displayName: "Black Roar Back Hat",
    priceEnv: "STRIPE_PRICE_ROAR_BACK_HAT",
    fallbackPriceCents: 6500,
    impactCents: 500,
    leadTime: "Made on request. Ships in about 1-2 weeks.",
    productType: "hat"
  },
  "crown-embroidered-hat:crown-embroidered-hat": {
    displayName: "Crown Embroidered Hat",
    priceEnv: "STRIPE_PRICE_ROAR_BACK_HAT",
    fallbackPriceCents: 6500,
    impactCents: 500,
    leadTime: "Made on request. Ships in about 1-2 weeks.",
    productType: "hat"
  }
};

const json = (body: unknown, status = 200) => (
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  })
);

const moneyFromCents = (value: number) => Number((value / 100).toFixed(2));

const createOrderNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `ROAR-${date}-${random}`;
};

const cleanText = (value: unknown, maxLength = 500) => (
  typeof value === "string" ? value.trim().slice(0, maxLength) : ""
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeSecretKey || !supabaseUrl || !serviceRoleKey) {
    return json({ error: "Shop checkout is not configured yet." }, 503);
  }

  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch (_error) {
    return json({ error: "Invalid checkout request." }, 400);
  }

  const productSlug = cleanText(body.productSlug, 120);
  const style = cleanText(body.style || body.productSlug, 120);
  const optionValue = cleanText(body.optionValue, 120);
  const notes = cleanText(body.notes, 800);
  const quantity = Number(body.quantity || 1);
  const product = products[`${productSlug}:${style}`];

  if (!product) {
    return json({ error: "That Roar Store item is not available for checkout yet." }, 400);
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 3) {
    return json({ error: "Quantity must be between 1 and 3." }, 400);
  }

  if (product.productType === "shoe" && !shoeSizes.has(optionValue)) {
    return json({ error: "Please choose a supported shoe size." }, 400);
  }

  if (product.productType === "hat" && !hatColors.has(optionValue)) {
    return json({ error: "Please choose a supported hat color." }, 400);
  }

  const priceId = Deno.env.get(product.priceEnv);

  if (!priceId) {
    return json({ error: `Missing Stripe price configuration for ${product.displayName}.` }, 503);
  }

  const orderId = crypto.randomUUID();
  const orderNumber = createOrderNumber();
  const siteUrl = (Deno.env.get("SHOP_SITE_URL") || "https://dinoboysc.com").replace(/\/+$/g, "");
  const successUrl = Deno.env.get("SHOP_SUCCESS_URL")
    || `${siteUrl}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = Deno.env.get("SHOP_CANCEL_URL")
    || `${siteUrl}/product.html?slug=${encodeURIComponent(productSlug)}&checkout=cancelled`;

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient()
  });

  const metadata = {
    order_id: orderId,
    order_number: orderNumber,
    product_slug: productSlug,
    product_type: product.productType,
    style,
    item_name: product.displayName,
    option_value: optionValue,
    quantity: String(quantity),
    impact_cents: String(product.impactCents),
    notes
  };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: orderId,
    line_items: [
      {
        price: priceId,
        quantity
      }
    ],
    billing_address_collection: "auto",
    customer_creation: "if_required",
    phone_number_collection: {
      enabled: true
    },
    shipping_address_collection: {
      allowed_countries: ["US"]
    },
    automatic_tax: {
      enabled: Deno.env.get("STRIPE_AUTOMATIC_TAX_ENABLED") !== "false"
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    payment_intent_data: {
      metadata
    }
  });

  const orderPayload = {
    id: orderId,
    order_number: orderNumber,
    items: [
      {
        product_slug: productSlug,
        product_type: product.productType,
        name: product.displayName,
        style,
        option_label: cleanText(body.optionLabel, 80) || (product.productType === "shoe" ? "Size" : "Hat Color"),
        option_value: optionValue,
        quantity,
        unit_price: moneyFromCents(product.fallbackPriceCents),
        impact_amount: moneyFromCents(product.impactCents),
        lead_time: product.leadTime
      }
    ],
    size: optionValue,
    quantity,
    subtotal: moneyFromCents(product.fallbackPriceCents * quantity),
    total: moneyFromCents(product.fallbackPriceCents * quantity),
    stripe_checkout_session_id: session.id,
    status: "pending",
    notes
  };

  const orderResponse = await fetch(`${supabaseUrl}/rest/v1/shop_orders`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(orderPayload)
  });

  if (!orderResponse.ok) {
    const errorText = await orderResponse.text();
    console.error("Unable to save pending shop order", errorText);
    return json({ error: "Checkout could not be prepared. Please try again." }, 502);
  }

  return json({ url: session.url, sessionId: session.id, orderNumber });
});
