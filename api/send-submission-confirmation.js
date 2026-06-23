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
  const firstName = body.parent_guardian_name || "there";

  const subject = "We got your DinoBoy Sticker Lab submission";
  const text = [
    `Hi ${firstName},`,
    "",
    `We received ${childName}'s DinoBoy Sticker Lab submission: ${stickerTitle}.`,
    "",
    "Our team will review it before anything appears on the site or goes to production. If approved, the first 100 stickers are on us, and families can order more directly later.",
    "",
    submissionId ? `Submission ID: ${submissionId}` : "",
    "",
    "Thank you for helping your fighter roar back.",
    "",
    "DinoBoy Sticker Lab",
    "A Roar Back Project"
  ].filter(Boolean).join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.55;">
      <h1 style="font-size: 28px; margin: 0 0 12px;">We got your roar.</h1>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>We received <strong>${escapeHtml(childName)}'s</strong> DinoBoy Sticker Lab submission: <strong>${escapeHtml(stickerTitle)}</strong>.</p>
      <p>Our team will review it before anything appears on the site or goes to production. If approved, the first 100 stickers are on us, and families can order more directly later.</p>
      ${submissionId ? `<p><strong>Submission ID:</strong> ${escapeHtml(submissionId)}</p>` : ""}
      <p>Thank you for helping your fighter roar back.</p>
      <p><strong>DinoBoy Sticker Lab</strong><br />A Roar Back Project</p>
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
