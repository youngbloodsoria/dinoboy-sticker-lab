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

  let body;

  try {
    body = await readBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const toEmail = body?.parent_guardian_email;

  if (!isValidEmail(toEmail)) {
    return sendJson(res, 400, { error: "A valid parent/guardian email is required" });
  }

  const childName = body.child_name || "your fighter";
  const stickerTitle = body.sticker_title || "your sticker";
  const submissionId = body.submission_id || "";
  const roarId = body.roar_id || formatRoarId(submissionId);
  const firstName = body.parent_guardian_name || "there";

  const subject = "We got your roar";
  const text = [
    "DinoBoy Sticker Lab",
    "A Roar Back Project",
    "",
    "WE GOT YOUR ROAR.",
    "",
    `Hi ${firstName},`,
    "",
    `We received ${childName}'s DinoBoy Sticker Lab submission: ${stickerTitle}.`,
    "",
    "Our team will review it before anything appears on the site or goes to production. If approved, the first 100 stickers are on us, and families can order more directly later.",
    "",
    roarId ? `RoarID: ${roarId}` : "",
    "",
    "Thank you for helping your fighter roar back.",
    "",
    "Be loud. Be kind. Roar back.",
    "DinoBoy Sticker Lab"
  ].filter(Boolean).join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f4f0e8;font-family:Arial,Helvetica,sans-serif;color:#111;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f0e8;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffdf7;border:3px solid #111;box-shadow:10px 10px 0 #ffd72e;">
              <tr>
                <td style="background:#050505;color:#fff;padding:22px 26px;border-bottom:8px solid #ff4fa3;">
                  <div style="font-size:24px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;line-height:1;">DinoBoy Sticker Lab</div>
                  <div style="display:inline-block;margin-top:8px;background:#ffd72e;color:#111;padding:5px 10px;font-size:13px;font-weight:900;text-transform:uppercase;">A Roar Back Project</div>
                </td>
              </tr>
              <tr>
                <td style="padding:30px 26px 10px;">
                  <h1 style="margin:0 0 10px;font-size:42px;line-height:.95;text-transform:uppercase;font-weight:900;">We got<br />your roar.</h1>
                  <div style="width:260px;height:9px;background:#ff4fa3;margin:0 0 22px;"></div>
                  <p style="font-size:18px;line-height:1.5;margin:0 0 18px;">Hi ${escapeHtml(firstName)},</p>
                  <p style="font-size:18px;line-height:1.5;margin:0 0 18px;">We received <strong>${escapeHtml(childName)}'s</strong> DinoBoy Sticker Lab submission: <strong>${escapeHtml(stickerTitle)}</strong>.</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;background:#ffe05c;border-left:8px solid #111;">
                    <tr>
                      <td style="padding:16px 18px;font-size:17px;line-height:1.5;font-weight:700;">
                        Our team will review it before anything appears on the site or goes to production. If approved, the first 100 stickers are on us, and families can order more directly later.
                      </td>
                    </tr>
                  </table>
                  ${roarId ? `
                    <div style="display:inline-block;margin:4px 0 22px;padding:11px 14px;background:#111;color:#fff;font-size:18px;font-weight:900;">
                      RoarID: ${escapeHtml(roarId)}
                    </div>
                  ` : ""}
                  <p style="font-size:18px;line-height:1.5;margin:0 0 18px;">Thank you for helping your fighter roar back.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 26px 30px;">
                  <div style="background:#111;color:#fff;padding:18px 20px;font-size:24px;font-weight:900;text-transform:uppercase;line-height:1.25;">
                    Be loud.<br />Be kind.<br />Roar back.
                  </div>
                  <p style="margin:22px 0 0;font-size:14px;line-height:1.5;color:#333;">DinoBoy Sticker Lab reviews every submission before anything appears publicly. Artwork belongs to its creator.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: toEmail }],
          subject
        }
      ],
      from: {
        email: fromEmail,
        name: "DinoBoy Sticker Lab"
      },
      reply_to: {
        email: replyToEmail
      },
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("SendGrid send failed", response.status, errorText);
    return sendJson(res, 502, { error: "SendGrid could not send the confirmation email" });
  }

  return sendJson(res, 200, { ok: true });
};
