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

const isValidEmail = (email) => (
  typeof email === "string"
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
);

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const formatRoarId = (submissionId = "") => {
  const cleanId = String(submissionId).trim();
  return cleanId ? `ROAR-${cleanId.slice(0, 8).toUpperCase()}` : "";
};

const appConfig = {
  supabaseUrl: process.env.SUPABASE_URL || "https://icrqmvkjfnwkbipjhhlw.supabase.co",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljcnFtdmtqZm53a2JpcGpoaGx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MzU3OTksImV4cCI6MjA5NzQxMTc5OX0.SwLDNfSLMxTVtHm3sN5vVTdVUrqxBZ4-AUzCcjDaDhU"
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

  const adminResponse = await fetch(`${appConfig.supabaseUrl}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`, {
    headers: {
      apikey: appConfig.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!adminResponse.ok) {
    return false;
  }

  const rows = await adminResponse.json();
  return Array.isArray(rows) && rows.length > 0;
};

const buildProfileUrl = (siteOrigin, submission) => {
  if (!submission?.is_public || !submission?.fighter_slug) {
    return "";
  }

  const origin = String(siteOrigin || "https://dinoboy-sticker-lab.vercel.app").replace(/\/+$/g, "");
  return `${origin}/fighter.html?slug=${encodeURIComponent(submission.fighter_slug)}`;
};

const buildEmail = (submission, profileUrl, requestedSiteOrigin) => {
  const firstName = submission.parent_guardian_name || "there";
  const childName = submission.approved_display_name || submission.child_name || "your fighter";
  const stickerTitle = submission.approved_tagline || submission.sticker_title || "your sticker";
  const roarId = submission.roar_id || formatRoarId(submission.id);
  const siteOrigin = String(
    requestedSiteOrigin
    || (profileUrl ? new URL(profileUrl).origin : "")
    || "https://dinoboy-sticker-lab.vercel.app"
  ).replace(/\/+$/g, "");
  const stickerImageUrl = `${siteOrigin}/assets/stickers/brighton-original-sticker.PNG`;

  const text = [
    "DinoBoy Sticker Lab",
    "A Roar Back Project",
    "",
    "YOUR ROAR IS HEADED TO PRINT.",
    "",
    `Hi ${firstName},`,
    "",
    `${childName}'s sticker, ${stickerTitle}, has been approved and sent to the sticker producer.`,
    "",
    "The first 100 stickers are covered by DinoBoy Sticker Lab. We will use the shipping information from your submission for delivery.",
    "",
    profileUrl ? `Share your fighter page: ${profileUrl}` : "This submission is approved for production, but the public fighter page is not turned on.",
    roarId ? `RoarID: ${roarId}` : "",
    "",
    "Thank you for helping your fighter roar back.",
    "DinoBoy Sticker Lab"
  ].filter(Boolean).join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f4f0e8;font-family:Arial,Helvetica,sans-serif;color:#111;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f0e8;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffdf7;border:3px solid #111;box-shadow:10px 10px 0 #ff4fa3;">
              <tr>
                <td style="background:#050505;color:#fff;padding:22px 26px;border-bottom:8px solid #ffd72e;">
                  <div style="font-size:24px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;line-height:1;">DinoBoy Sticker Lab</div>
                  <div style="display:inline-block;margin-top:8px;background:#ff4fa3;color:#111;padding:5px 10px;font-size:13px;font-weight:900;text-transform:uppercase;">A Roar Back Project</div>
                </td>
              </tr>
              <tr>
                <td style="padding:30px 26px 10px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <h1 style="margin:0 0 10px;font-size:38px;line-height:1;text-transform:uppercase;font-weight:900;">Your roar is<br />headed to print.</h1>
                      </td>
                      <td width="150" align="right" style="vertical-align:middle;">
                        <img src="${escapeHtml(stickerImageUrl)}" width="138" alt="Brighton's original DinoBoy sticker" style="display:block;width:138px;max-width:100%;height:auto;border:0;" />
                      </td>
                    </tr>
                  </table>
                  <div style="width:300px;height:9px;background:#ffd72e;margin:0 0 22px;"></div>
                  <p style="font-size:18px;line-height:1.5;margin:0 0 18px;">Hi ${escapeHtml(firstName)},</p>
                  <p style="font-size:18px;line-height:1.5;margin:0 0 18px;"><strong>${escapeHtml(childName)}'s</strong> sticker, <strong>${escapeHtml(stickerTitle)}</strong>, has been approved and sent to the sticker producer.</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;background:#ffe05c;border-left:8px solid #111;">
                    <tr>
                      <td style="padding:16px 18px;font-size:17px;line-height:1.5;font-weight:700;">
                        The first 100 stickers are covered by DinoBoy Sticker Lab. We will use the shipping information from your submission for delivery.
                      </td>
                    </tr>
                  </table>
                  ${profileUrl ? `
                    <p style="font-size:18px;line-height:1.5;margin:0 0 14px;">Your fighter page is live and ready to share:</p>
                    <a href="${escapeHtml(profileUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 18px;font-size:16px;font-weight:900;text-transform:uppercase;">View + Share Fighter Page</a>
                  ` : `
                    <p style="font-size:18px;line-height:1.5;margin:0 0 14px;">This submission is approved for production, but the public fighter page is not turned on.</p>
                  `}
                  ${roarId ? `
                    <div style="display:block;width:max-content;margin:22px 0 0;padding:11px 14px;background:#111;color:#fff;font-size:18px;font-weight:900;">
                      RoarID: ${escapeHtml(roarId)}
                    </div>
                  ` : ""}
                </td>
              </tr>
              <tr>
                <td style="padding:20px 26px 30px;">
                  <div style="background:#111;color:#fff;padding:18px 20px;font-size:24px;font-weight:900;text-transform:uppercase;line-height:1.25;">
                    Be loud.<br />Be kind.<br />Roar back.
                  </div>
                  <p style="margin:22px 0 0;font-size:14px;line-height:1.5;color:#333;">Artwork belongs to its creator. Public pages only appear when gallery permission is on.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  return {
    childName,
    subject: `${childName}'s sticker is headed to print`,
    text,
    html
  };
};

const sendMail = async ({ sendgridApiKey, fromEmail, replyToEmail, toEmail, subject, text, html }) => {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }], subject }],
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
  const isAdmin = await verifyAdmin(accessToken);

  if (!isAdmin) {
    return sendJson(res, 401, { error: "Admin authorization is required" });
  }

  let body;

  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const submissions = Array.isArray(body.submissions) ? body.submissions : [];

  if (!submissions.length) {
    return sendJson(res, 400, { error: "At least one submission is required" });
  }

  const sent = [];
  const failed = [];

  for (const submission of submissions) {
    const toEmail = submission.parent_guardian_email;

    if (!isValidEmail(toEmail)) {
      failed.push({ id: submission.id, error: "Missing valid parent/guardian email" });
      continue;
    }

    const profileUrl = buildProfileUrl(body.site_origin, submission);
    const email = buildEmail(submission, profileUrl, body.site_origin);

    try {
      await sendMail({
        sendgridApiKey,
        fromEmail,
        replyToEmail,
        toEmail,
        subject: email.subject,
        text: email.text,
        html: email.html
      });
      sent.push({ id: submission.id, email: toEmail });
    } catch (error) {
      console.error("SendGrid production confirmation failed", submission.id, error);
      failed.push({ id: submission.id, error: error.message || "Email failed" });
    }
  }

  return sendJson(res, failed.length ? 207 : 200, { sent, failed });
};
