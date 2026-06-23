const sendJson = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

const readBody = async (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
};

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const stripHtml = (value = "") => String(value)
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/\s+/g, " ")
  .trim();

const appConfig = {
  supabaseUrl: process.env.SUPABASE_URL || "https://icrqmvkjfnwkbipjhhlw.supabase.co",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoiaWNycW12a2pmbndrYmlwamhobHciLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc4MTgzNTc5OSwiZXhwIjoyMDk3NDExNzk5fQ.SwLDNfSLMxTVtHm3sN5vVTdVUrqxBZ4-AUzCcjDaDhU"
};

const verifyAdmin = async (accessToken) => {
  if (!accessToken) {
    return false;
  }

  const userResponse = await fetch(`${appConfig.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: appConfig.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!userResponse.ok) {
    return false;
  }

  const user = await userResponse.json();
  if (!user?.id) {
    return false;
  }

  const adminResponse = await fetch(
    `${appConfig.supabaseUrl}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`,
    {
      headers: {
        apikey: appConfig.supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!adminResponse.ok) {
    return false;
  }

  const rows = await adminResponse.json();
  return Array.isArray(rows) && rows.length > 0;
};

const loadSubscribers = async (accessToken) => {
  const response = await fetch(
    `${appConfig.supabaseUrl}/rest/v1/newsletter_subscribers?select=email,name,unsubscribe_token&status=eq.subscribed&order=created_at.asc`,
    {
      headers: {
        apikey: appConfig.supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Could not load subscribers (${response.status})`);
  }

  return response.json();
};

const buildEmail = ({
  subscriber,
  subject,
  preheader,
  htmlContent,
  textContent,
  siteOrigin
}) => {
  const unsubscribeUrl = `${siteOrigin}/unsubscribe.html?token=${encodeURIComponent(subscriber.unsubscribe_token)}`;
  const stickerImageUrl = `${siteOrigin}/assets/stickers/brighton-original-sticker.PNG`;
  const greeting = subscriber.name ? `Hi ${escapeHtml(subscriber.name)},` : "Hi there,";
  const plainGreeting = subscriber.name ? `Hi ${subscriber.name},` : "Hi there,";
  const fallbackText = stripHtml(htmlContent);

  const html = `
    <div style="margin:0;padding:0;background:#f4f0e8;font-family:Arial,Helvetica,sans-serif;color:#111;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f0e8;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fffdf7;border:3px solid #111;box-shadow:10px 10px 0 #ff4fa3;">
              <tr>
                <td style="background:#050505;color:#fff;padding:22px 26px;border-bottom:8px solid #ffd72e;">
                  <div style="font-size:24px;font-weight:900;text-transform:uppercase;">DinoBoy Sticker Lab</div>
                  <div style="display:inline-block;margin-top:8px;background:#ff4fa3;color:#111;padding:5px 10px;font-size:13px;font-weight:900;text-transform:uppercase;">A Roar Back Project</div>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 26px 12px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <p style="font-size:18px;line-height:1.5;margin:0 0 16px;">${greeting}</p>
                        <h1 style="margin:0;font-size:34px;line-height:1.05;text-transform:uppercase;font-weight:900;">${escapeHtml(subject)}</h1>
                      </td>
                      <td width="150" align="right" style="vertical-align:middle;">
                        <img src="${escapeHtml(stickerImageUrl)}" width="138" alt="Brighton's original DinoBoy sticker" style="display:block;width:138px;max-width:100%;height:auto;border:0;" />
                      </td>
                    </tr>
                  </table>
                  <div style="width:290px;max-width:80%;height:9px;background:#ffd72e;margin:12px 0 22px;"></div>
                  <div style="font-size:18px;line-height:1.6;">${htmlContent}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 26px 30px;">
                  <div style="background:#111;color:#fff;padding:18px 20px;font-size:24px;font-weight:900;text-transform:uppercase;line-height:1.25;">
                    Be loud.<br />Be kind.<br />Roar back.
                  </div>
                  <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#555;">
                    You received this because you subscribed to Roar Back Project updates.
                    <a href="${escapeHtml(unsubscribeUrl)}" style="color:#111;text-decoration:underline;">Unsubscribe</a>
                    or email <a href="mailto:roarbackproject@nudgeadvisors.com" style="color:#111;">roarbackproject@nudgeadvisors.com</a>.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const text = [
    plainGreeting,
    "",
    subject,
    "",
    textContent || fallbackText,
    "",
    "Be loud. Be kind. Roar back.",
    "",
    `Unsubscribe: ${unsubscribeUrl}`,
    "Contact: roarbackproject@nudgeadvisors.com"
  ].join("\n");

  return { html, text, unsubscribeUrl };
};

const sendMail = async ({
  sendgridApiKey,
  fromEmail,
  replyToEmail,
  toEmail,
  subject,
  text,
  html,
  unsubscribeUrl
}) => {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email: toEmail }],
        subject,
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` }
      }],
      from: { email: fromEmail, name: "DinoBoy Sticker Lab" },
      reply_to: { email: replyToEmail },
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SendGrid ${response.status}: ${errorText}`);
  }
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || "roarbackproject@nudgeadvisors.com";
  const replyToEmail = process.env.SENDGRID_REPLY_TO_EMAIL || fromEmail;

  if (!sendgridApiKey) {
    return sendJson(res, 503, { error: "SendGrid is not configured" });
  }

  const accessToken = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!await verifyAdmin(accessToken)) {
    return sendJson(res, 401, { error: "Admin authorization is required" });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const subject = String(body.subject || "").trim();
  const preheader = String(body.preheader || "").trim();
  const htmlContent = String(body.html_content || "").trim();
  const textContent = String(body.text_content || "").trim();
  const siteOrigin = String(body.site_origin || "https://dinoboy-sticker-lab.vercel.app").replace(/\/+$/g, "");

  if (!subject || !htmlContent) {
    return sendJson(res, 400, { error: "Subject and HTML message are required" });
  }

  try {
    const subscribers = await loadSubscribers(accessToken);
    if (!subscribers.length) {
      return sendJson(res, 400, { error: "There are no active subscribers" });
    }

    const failed = [];
    let sentCount = 0;

    for (const subscriber of subscribers) {
      try {
        const email = buildEmail({
          subscriber,
          subject,
          preheader,
          htmlContent,
          textContent,
          siteOrigin
        });

        await sendMail({
          sendgridApiKey,
          fromEmail,
          replyToEmail,
          toEmail: subscriber.email,
          subject,
          ...email
        });
        sentCount += 1;
      } catch (error) {
        failed.push({
          email: subscriber.email,
          error: error.message || "Send failed"
        });
      }
    }

    return sendJson(res, failed.length ? 207 : 200, {
      sentCount,
      failedCount: failed.length,
      failed
    });
  } catch (error) {
    console.error("Newsletter delivery failed", error);
    return sendJson(res, 500, { error: error.message || "Newsletter delivery failed" });
  }
};
