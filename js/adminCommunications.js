// Admin communications workspace for publishing site updates and sending
// branded subscriber emails. Supabase Auth and RLS enforce admin access.

const communicationsClient = window.DinoBoySupabase?.client;
const workspaceTabs = document.querySelectorAll("[data-workspace-tab]");
const workspaceViews = document.querySelectorAll("[data-workspace-view]");
const communicationsForm = document.querySelector("#newsletterForm");
const communicationsStatus = document.querySelector("#newsletterStatus");
const subscriberCountElement = document.querySelector("#newsletterSubscriberCount");
const recentCommunications = document.querySelector("#recentCommunications");
const communicationsSubmitButton = communicationsForm?.querySelector('button[type="submit"]');
const communicationsDateInput = document.querySelector("#communicationDate");
const updateImageBucket = "update-images";

let activeSubscriberCount = 0;
let communicationsLoaded = false;

const setCommunicationsStatus = (message, type = "info") => {
  communicationsStatus.textContent = message;
  communicationsStatus.dataset.type = type;
  communicationsStatus.hidden = false;
};

const clearCommunicationsStatus = () => {
  communicationsStatus.textContent = "";
  communicationsStatus.removeAttribute("data-type");
  communicationsStatus.hidden = true;
};

const escapeCommunicationHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#039;"
}[character]));

const communicationSlug = (value) => String(value || "")
  .toLowerCase()
  .trim()
  .replace(/['"]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 72);

const safeUpdateImageName = (filename) => {
  const extension = String(filename || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const basename = String(filename || "update-image")
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "update-image";

  return `${Date.now()}-${basename}.${extension}`;
};

const paragraphList = (value) => String(value || "")
  .split(/\n\s*\n/)
  .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
  .filter(Boolean);

const defaultExcerpt = (paragraphs) => {
  const text = paragraphs.join(" ");
  return text.length > 220 ? `${text.slice(0, 217).trim()}...` : text;
};

const setDefaultCommunicationDate = () => {
  if (!communicationsDateInput.value) {
    const now = new Date();
    const offsetDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    communicationsDateInput.value = offsetDate.toISOString().slice(0, 10);
  }
};

const switchWorkspace = async (workspaceName) => {
  workspaceTabs.forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.workspaceTab === workspaceName));
  });

  workspaceViews.forEach((view) => {
    view.hidden = view.dataset.workspaceView !== workspaceName;
  });

  if (workspaceName === "communications") {
    await loadCommunicationsWorkspace();
  }
};

const loadSubscriberCount = async () => {
  const { count, error } = await communicationsClient
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("status", "subscribed");

  if (error) {
    console.error("Could not load subscriber count", error);
    subscriberCountElement.textContent = "Subscriber count unavailable. Run the latest schema.sql and rls.sql.";
    activeSubscriberCount = 0;
    return;
  }

  activeSubscriberCount = count || 0;
  subscriberCountElement.textContent = `${activeSubscriberCount} active subscriber${activeSubscriberCount === 1 ? "" : "s"}`;
};

const formatCommunicationDate = (value) => value
  ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`))
  : "No date";

const loadRecentCommunications = async () => {
  const { data, error } = await communicationsClient
    .from("site_updates")
    .select("id,title,update_date,status,email_sent_at,published_at")
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.error("Could not load recent communications", error);
    recentCommunications.innerHTML = `<div class="empty">Run the latest schema.sql and rls.sql to enable published updates.</div>`;
    return;
  }

  if (!data?.length) {
    recentCommunications.innerHTML = `<div class="empty">No admin-created updates yet.</div>`;
    return;
  }

  recentCommunications.innerHTML = data.map((update) => `
    <article class="communication-card">
      <strong>${escapeCommunicationHtml(update.title)}</strong>
      <span>${escapeCommunicationHtml(formatCommunicationDate(update.update_date))}</span>
      <small>
        ${update.status === "published" ? "Published on Updates page" : "Not public"}
        · ${update.email_sent_at ? "Email sent" : "Email not sent"}
      </small>
    </article>
  `).join("");
};

const loadCommunicationsWorkspace = async () => {
  if (!communicationsClient) {
    setCommunicationsStatus("Supabase is not configured.", "error");
    return;
  }

  setDefaultCommunicationDate();
  await Promise.all([
    loadSubscriberCount(),
    loadRecentCommunications()
  ]);
  communicationsLoaded = true;
};

const uploadUpdateImage = async (file) => {
  if (!file?.size) {
    return "";
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("The update photo must be 10 MB or smaller.");
  }

  const path = `updates/${safeUpdateImageName(file.name)}`;
  const { error } = await communicationsClient.storage
    .from(updateImageBucket)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: false
    });

  if (error) {
    throw new Error(`The photo could not be uploaded. ${error.message}`);
  }

  return communicationsClient.storage.from(updateImageBucket).getPublicUrl(path).data.publicUrl;
};

const sendSubscriberUpdate = async ({
  title,
  preheader,
  paragraphs,
  imageUrl,
  imageAlt
}) => {
  const { data } = await communicationsClient.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new Error("Your admin session expired. Sign in again.");
  }

  const htmlContent = paragraphs
    .map((paragraph) => `<p style="margin:0 0 18px;">${escapeCommunicationHtml(paragraph)}</p>`)
    .join("");

  const response = await fetch("/api/send-newsletter", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Supabase-Access-Token": accessToken,
      "X-Supabase-Anon-Key": window.APP_CONFIG?.SUPABASE_ANON_KEY || "",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      subject: title,
      preheader,
      html_content: htmlContent,
      text_content: paragraphs.join("\n\n"),
      image_url: imageUrl,
      image_alt: imageAlt,
      site_origin: window.location.origin
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "The subscriber email could not be sent.");
  }

  return result;
};

const publishSiteUpdate = async ({
  title,
  updateDate,
  category,
  excerpt,
  paragraphs,
  imageUrl,
  imageAlt
}) => {
  const { data: sessionData } = await communicationsClient.auth.getSession();
  const slug = `${updateDate}-${communicationSlug(title) || "update"}-${Date.now().toString(36).slice(-4)}`;
  const publishedAt = new Date().toISOString();

  const { data, error } = await communicationsClient
    .from("site_updates")
    .insert({
      title,
      slug,
      update_date: updateDate,
      category,
      excerpt,
      body: paragraphs,
      image_url: imageUrl || null,
      image_alt: imageAlt || title,
      status: "published",
      published_at: publishedAt,
      created_by: sessionData.session?.user?.email || null
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`The update could not be published. ${error.message}`);
  }

  return data.id;
};

const markUpdateEmailed = async (updateId) => {
  if (!updateId) {
    return;
  }

  const { error } = await communicationsClient
    .from("site_updates")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", updateId);

  if (error) {
    console.warn("Update was emailed, but email_sent_at was not saved", error);
  }
};

const submitCommunication = async (event) => {
  event.preventDefault();
  clearCommunicationsStatus();

  const formData = new FormData(communicationsForm);
  const shouldPublish = formData.get("publish_update") === "on";
  const shouldSend = formData.get("send_email") === "on";
  const title = String(formData.get("title") || "").trim();
  const updateDate = String(formData.get("update_date") || "").trim();
  const category = String(formData.get("category") || "Big Moments").trim();
  const paragraphs = paragraphList(formData.get("body"));
  const excerpt = String(formData.get("excerpt") || "").trim() || defaultExcerpt(paragraphs);
  const preheader = String(formData.get("preheader") || "").trim() || excerpt;
  const imageFile = formData.get("image");
  const imageAlt = String(formData.get("image_alt") || "").trim() || title;

  if (!shouldPublish && !shouldSend) {
    setCommunicationsStatus("Choose at least one action: publish the update, send the email, or both.", "error");
    return;
  }

  if (!title || !updateDate || !paragraphs.length) {
    setCommunicationsStatus("Add a title, date, and full update before continuing.", "error");
    return;
  }

  if (shouldSend && activeSubscriberCount === 0) {
    setCommunicationsStatus("There are no active subscribers. Uncheck email delivery to publish this only on the Updates page.", "error");
    return;
  }

  if (shouldSend) {
    const confirmed = window.confirm(
      `Send "${title}" to ${activeSubscriberCount} active subscriber${activeSubscriberCount === 1 ? "" : "s"}${shouldPublish ? " and publish it on the Updates page" : ""}?`
    );

    if (!confirmed) {
      return;
    }
  }

  communicationsSubmitButton.disabled = true;
  const originalText = communicationsSubmitButton.textContent;
  communicationsSubmitButton.textContent = "Working...";

  let publishedUpdateId = null;
  let published = false;

  try {
    setCommunicationsStatus(imageFile?.size ? "Uploading the update photo..." : "Preparing the update...", "info");
    const imageUrl = await uploadUpdateImage(imageFile);

    if (shouldPublish) {
      setCommunicationsStatus("Publishing the update...", "info");
      publishedUpdateId = await publishSiteUpdate({
        title,
        updateDate,
        category,
        excerpt,
        paragraphs,
        imageUrl,
        imageAlt
      });
      published = true;
    }

    let deliveryResult = null;
    if (shouldSend) {
      setCommunicationsStatus("Sending the branded update email...", "info");
      deliveryResult = await sendSubscriberUpdate({
        title,
        preheader,
        paragraphs,
        imageUrl,
        imageAlt
      });
      await markUpdateEmailed(publishedUpdateId);
    }

    const messages = [];
    if (published) {
      messages.push("published on the Updates page");
    }
    if (deliveryResult) {
      messages.push(`sent to ${deliveryResult.sentCount} subscriber${deliveryResult.sentCount === 1 ? "" : "s"}`);
      if (deliveryResult.failedCount) {
        messages.push(`${deliveryResult.failedCount} delivery failed`);
      }
    }

    setCommunicationsStatus(`Update ${messages.join(" and ")}.`, deliveryResult?.failedCount ? "error" : "success");
    communicationsForm.reset();
    setDefaultCommunicationDate();
    document.querySelector("#publishUpdate").checked = true;
    document.querySelector("#sendUpdateEmail").checked = true;
    await loadRecentCommunications();
  } catch (error) {
    console.error("Could not complete communication", error);
    if (published) {
      document.querySelector("#publishUpdate").checked = false;
    }
    const prefix = published ? "The update is live, but the remaining action failed. " : "";
    const retryNote = published ? " Publishing has been turned off so retrying will send the email without creating a duplicate update. " : "";
    setCommunicationsStatus(`${prefix}${error.message || "Please try again."}${retryNote}`, "error");
  } finally {
    communicationsSubmitButton.disabled = false;
    communicationsSubmitButton.textContent = originalText;
  }
};

workspaceTabs.forEach((tab) => {
  tab.addEventListener("click", () => switchWorkspace(tab.dataset.workspaceTab));
});

communicationsForm?.addEventListener("submit", submitCommunication);

window.addEventListener("dinoboy:admin-ready", async () => {
  if (document.querySelector('[data-workspace-tab="communications"]')?.getAttribute("aria-selected") === "true") {
    await loadCommunicationsWorkspace();
  }
});

setDefaultCommunicationDate();
