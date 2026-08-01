import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";

const json = (body: unknown, status = 200) => (
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  })
);

const centsToMoney = (value: number | null | undefined) => (
  typeof value === "number" ? Number((value / 100).toFixed(2)) : null
);

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const formatAddress = (address: Stripe.Address | null | undefined) => {
  if (!address) return "No shipping address on file.";

  return [
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(", "),
    address.country
  ].filter(Boolean).join("\n");
};

const sendSendGridEmail = async ({
  to,
  subject,
  text,
  html
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) => {
  const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
  const fromEmail = Deno.env.get("SHOP_FROM_EMAIL") || Deno.env.get("SENDGRID_FROM_EMAIL") || "roarbackproject@nudgeadvisors.com";
  const replyToEmail = Deno.env.get("SENDGRID_REPLY_TO_EMAIL") || fromEmail;

  if (!sendgridApiKey || !to) return false;

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }], subject }],
      from: { email: fromEmail, name: "The Roar Back Project" },
      reply_to: { email: replyToEmail },
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html }
      ]
    })
  });

  if (!response.ok) {
    console.error("SendGrid shop email failed", response.status, await response.text());
    return false;
  }

  return true;
};

const buildOrderHtml = ({
  title,
  intro,
  orderNumber,
  itemName,
  optionLabel,
  optionValue,
  quantity,
  total,
  customerName,
  shippingAddress
}: Record<string, string | number>) => `
  <div style="margin:0;padding:0;background:#f4f0e8;font-family:Arial,Helvetica,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f0e8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffdf7;border:3px solid #111;box-shadow:10px 10px 0 #ffd72e;">
            <tr>
              <td style="background:#050505;color:#fff;padding:22px 26px;border-bottom:8px solid #ff4fa3;">
                <div style="font-size:24px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;line-height:1;">The Roar Back Project</div>
                <div style="display:inline-block;margin-top:8px;background:#ffd72e;color:#111;padding:5px 10px;font-size:13px;font-weight:900;text-transform:uppercase;">DinoBoy Sticker Lab</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 26px 10px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td>
                      <h1 style="margin:0 0 10px;font-size:38px;line-height:.98;text-transform:uppercase;font-weight:900;">${escapeHtml(String(title))}</h1>
                      <div style="width:260px;height:9px;background:#ff4fa3;margin:0 0 20px;"></div>
                    </td>
                    <td width="130" align="right">
                      <img src="https://dinoboysc.com/assets/stickers/brighton-original-sticker.PNG" width="118" alt="Brighton's original DinoBoy sticker" style="display:block;width:118px;max-width:100%;height:auto;border:0;" />
                    </td>
                  </tr>
                </table>
                <p style="font-size:17px;line-height:1.5;margin:0 0 18px;">${escapeHtml(String(intro))}</p>
                <div style="display:inline-block;margin:4px 0 22px;padding:11px 14px;background:#111;color:#fff;font-size:18px;font-weight:900;">
                  Order: ${escapeHtml(String(orderNumber))}
                </div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:12px 0 22px;background:#ffe05c;border-left:8px solid #111;">
                  <tr>
                    <td style="padding:16px 18px;font-size:16px;line-height:1.5;font-weight:700;">
                      ${escapeHtml(String(itemName))}<br />
                      ${escapeHtml(String(optionLabel))}: ${escapeHtml(String(optionValue))}<br />
                      Quantity: ${escapeHtml(String(quantity))}<br />
                      Total: ${escapeHtml(String(total))}
                    </td>
                  </tr>
                </table>
                <p style="font-size:15px;line-height:1.55;margin:0 0 18px;"><strong>Customer:</strong> ${escapeHtml(String(customerName || "Not provided"))}</p>
                <p style="font-size:15px;line-height:1.55;margin:0 0 18px;white-space:pre-line;"><strong>Shipping:</strong><br />${escapeHtml(String(shippingAddress))}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 26px 30px;">
                <div style="background:#111;color:#fff;padding:18px 20px;font-size:24px;font-weight:900;text-transform:uppercase;line-height:1.25;">
                  Be loud.<br />Be kind.<br />Roar back.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
`;

const supabaseRequest = async (path: string, init: RequestInit = {}) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service configuration is missing.");
  }

  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(init.headers || {})
    }
  });
};

const readOrderBySession = async (sessionId: string) => {
  const response = await supabaseRequest(
    `shop_orders?stripe_checkout_session_id=eq.${encodeURIComponent(sessionId)}&select=*`
  );

  if (!response.ok) {
    throw new Error(`Unable to read shop order: ${await response.text()}`);
  }

  const rows = await response.json();
  return rows[0] || null;
};

const upsertPaidOrder = async (session: Stripe.Checkout.Session) => {
  const metadata = session.metadata || {};
  const existing = await readOrderBySession(session.id);
  const customer = session.customer_details;
  const shipping = session.shipping_details;
  const itemName = metadata.item_name || "Roar Store Item";
  const optionValue = metadata.option_value || "";
  const optionLabel = metadata.product_type === "shoe" ? "Size" : "Hat Color";
  const quantity = Number(metadata.quantity || existing?.quantity || 1);
  const orderNumber = metadata.order_number || existing?.order_number || `ROAR-${session.id.slice(-8).toUpperCase()}`;
  const orderId = metadata.order_id || existing?.id || crypto.randomUUID();
  const paidPayload = {
    id: orderId,
    order_number: orderNumber,
    updated_at: new Date().toISOString(),
    customer_name: customer?.name || existing?.customer_name || "",
    email: customer?.email || existing?.email || "",
    phone: customer?.phone || existing?.phone || "",
    shipping_address: shipping || existing?.shipping_address || null,
    items: [
      {
        product_slug: metadata.product_slug,
        product_type: metadata.product_type,
        name: itemName,
        style: metadata.style,
        option_label: optionLabel,
        option_value: optionValue,
        quantity,
        impact_amount: centsToMoney(Number(metadata.impact_cents || 0))
      }
    ],
    product_type: metadata.product_type,
    product_slug: metadata.product_slug,
    product_name: itemName,
    style: metadata.style,
    option_label: optionLabel,
    option_value: optionValue,
    size: optionValue,
    quantity,
    subtotal: centsToMoney(session.amount_subtotal),
    tax: centsToMoney(session.total_details?.amount_tax),
    total: centsToMoney(session.amount_total),
    currency: session.currency || "usd",
    stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
    stripe_checkout_session_id: session.id,
    stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id || null,
    payment_status: session.payment_status,
    status: "paid",
    notes: metadata.notes || existing?.notes || ""
  };

  const method = existing ? "PATCH" : "POST";
  const path = existing
    ? `shop_orders?stripe_checkout_session_id=eq.${encodeURIComponent(session.id)}`
    : "shop_orders";

  const response = await supabaseRequest(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(paidPayload)
  });

  if (!response.ok) {
    throw new Error(`Unable to save paid shop order: ${await response.text()}`);
  }

  const rows = await response.json();
  return rows[0] || { ...existing, ...paidPayload };
};

const markEmailSent = async (sessionId: string, column: "admin_email_sent_at" | "customer_email_sent_at") => {
  await supabaseRequest(`shop_orders?stripe_checkout_session_id=eq.${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({ [column]: new Date().toISOString() })
  });
};

const processPaidSession = async (stripe: Stripe, sessionId: string) => {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"]
  });

  if (session.payment_status !== "paid") {
    return;
  }

  const priorOrder = await readOrderBySession(session.id);
  const order = await upsertPaidOrder(session);
  const metadata = session.metadata || {};
  const itemName = metadata.item_name || order.product_name || "Roar Store Item";
  const optionValue = metadata.option_value || order.option_value || "";
  const optionLabel = metadata.product_type === "shoe" ? "Size" : "Hat Color";
  const quantity = Number(metadata.quantity || order.quantity || 1);
  const total = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (session.currency || "usd").toUpperCase()
  }).format((session.amount_total || 0) / 100);
  const customerName = session.customer_details?.name || order.customer_name || "";
  const shippingAddress = formatAddress(session.shipping_details?.address);
  const orderNumber = order.order_number || metadata.order_number;
  const customerEmail = session.customer_details?.email || order.email || "";
  const adminEmail = Deno.env.get("SHOP_ADMIN_EMAIL") || "roarbackproject@nudgeadvisors.com";

  if (!priorOrder?.admin_email_sent_at) {
    const adminText = [
      `New Roar Store order: ${orderNumber}`,
      "",
      `${itemName}`,
      `${optionLabel}: ${optionValue}`,
      `Quantity: ${quantity}`,
      `Total: ${total}`,
      "",
      `Customer: ${customerName}`,
      `Email: ${customerEmail}`,
      `Phone: ${session.customer_details?.phone || ""}`,
      "",
      "Shipping:",
      shippingAddress
    ].join("\n");

    const sent = await sendSendGridEmail({
      to: adminEmail,
      subject: `NEW ROAR STORE ORDER - ${orderNumber}`,
      text: adminText,
      html: buildOrderHtml({
        title: "New Roar Store Order",
        intro: "A new paid Roar Store order is ready for review and fulfillment.",
        orderNumber,
        itemName,
        optionLabel,
        optionValue,
        quantity,
        total,
        customerName,
        shippingAddress
      })
    });

    if (sent) await markEmailSent(session.id, "admin_email_sent_at");
  }

  if (customerEmail && !priorOrder?.customer_email_sent_at) {
    const customerText = [
      `Your Roar Store order is in: ${orderNumber}`,
      "",
      `${itemName}`,
      `${optionLabel}: ${optionValue}`,
      `Quantity: ${quantity}`,
      `Total: ${total}`,
      "",
      "We received your order and will take it from here. Thank you for helping kids roar back."
    ].join("\n");

    const sent = await sendSendGridEmail({
      to: customerEmail,
      subject: `YOUR ROAR STORE ORDER IS IN - ${orderNumber}`,
      text: customerText,
      html: buildOrderHtml({
        title: "Your Roar Store Order Is In",
        intro: "We received your order and will take it from here. Thank you for helping kids roar back.",
        orderNumber,
        itemName,
        optionLabel,
        optionValue,
        quantity,
        total,
        customerName,
        shippingAddress
      })
    });

    if (sent) await markEmailSent(session.id, "customer_email_sent_at");
  }
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeSecretKey || !webhookSecret) {
    return json({ error: "Stripe webhook is not configured." }, 503);
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient()
  });

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  if (!signature) {
    return json({ error: "Missing Stripe signature." }, 400);
  }

  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (error) {
    console.error("Invalid Stripe webhook signature", error);
    return json({ error: "Invalid webhook signature." }, 400);
  }

  if (
    event.type === "checkout.session.completed"
    || event.type === "checkout.session.async_payment_succeeded"
  ) {
    await processPaidSession(stripe, (event.data.object as Stripe.Checkout.Session).id);
  }

  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    await supabaseRequest(`shop_orders?stripe_checkout_session_id=eq.${encodeURIComponent(session.id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        updated_at: new Date().toISOString(),
        payment_status: session.payment_status,
        status: "payment_failed"
      })
    });
  }

  return json({ received: true });
});
