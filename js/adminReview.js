// Private admin review UI for DinoBoy Sticker Lab submissions.
// Access is enforced by Supabase Auth plus RLS policies checking admin_users.

const supabaseClient = window.DinoBoySupabase?.client;
const loginPanel = document.querySelector("#loginPanel");
const adminPanel = document.querySelector("#adminPanel");
const loginForm = document.querySelector("#loginForm");
const loginStatus = document.querySelector("#loginStatus");
const loginSubmitButton = loginForm?.querySelector('button[type="submit"]');
const adminStatus = document.querySelector("#adminStatus");
const adminEmail = document.querySelector("#adminEmail");
const signOutButton = document.querySelector("#signOutButton");
const adminSearch = document.querySelector("#adminSearch");
const statusFilter = document.querySelector("#statusFilter");
const refreshButton = document.querySelector("#refreshButton");
const batchStatus = document.querySelector("#batchStatus");
const batchPreview = document.querySelector("#batchPreview");
const batchList = document.querySelector("#batchList");
const batchDetails = document.querySelector("#batchDetails");
const batchSelect = document.querySelector("#batchSelect");
const createBatchButton = document.querySelector("#createBatchButton");
const downloadBatchButton = document.querySelector("#downloadBatchButton");
const markBatchSentButton = document.querySelector("#markBatchSentButton");
const submissionsList = document.querySelector("#submissionsList");
const template = document.querySelector("#submissionTemplate");
const uploadBucket = "submission-uploads";
const approvedBucket = "approved-stickers";
const tiltValues = ["-0.7deg", "0.8deg", "-0.4deg", "0.6deg"];
const producerDefaults = {
  quantity: 100,
  size: "3 inch die-cut sticker",
  edgeText: "dinoboysc.com",
  finish: "Full-color die-cut vinyl sticker with dinoboysc.com around the edge of the final approved art"
};

const setStatus = (element, message, type = "info") => {
  element.textContent = message;
  element.dataset.type = type;
  element.hidden = false;
};

const clearStatus = (element) => {
  element.textContent = "";
  element.removeAttribute("data-type");
  element.hidden = true;
};

const valueOrDash = (value) => value || "Not provided";

const roarId = (submission) => `ROAR-${String(submission.id || "").slice(0, 8).toUpperCase()}`;

const hasCompleteShipping = (submission) => Boolean(
  submission.shipping_recipient_name
  && submission.shipping_address_1
  && submission.shipping_city
  && submission.shipping_state
  && submission.shipping_postal_code
);

const shippingSummaryText = (submission) => (
  hasCompleteShipping(submission)
    ? "Shipping details on file. Open Edit shipping details if needed."
    : "Shipping incomplete. Open Edit shipping details to finish it."
);

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value))
  : "Unknown";

const getInputValue = (formData, name) => {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const getNumberValue = (formData, name) => {
  const value = getInputValue(formData, name);
  return value === null ? null : Number(value);
};

const slugify = (value) => String(value || "")
  .toLowerCase()
  .trim()
  .replace(/['"]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const safeStorageName = (value) => slugify(value).slice(0, 80) || "approved-sticker";

const publicStatusText = (submission) => {
  if (!["approved", "archived"].includes(submission.status)) {
    return "Not public: status is not approved or archived";
  }

  if (!submission.consent_publish) {
    return "Not public: family did not give gallery permission";
  }

  if (!submission.is_public) {
    return "Not public: publish checkbox is off";
  }

  if (!submission.fighter_slug) {
    return "Not public: fighter slug is missing";
  }

  return `Public at fighter.html?slug=${submission.fighter_slug}`;
};

const selectedImageLabel = (file) => file?.original_filename || file?.file_type || "first uploaded drawing photo";

const parseSelectedImageFile = (form) => {
  try {
    return JSON.parse(form.dataset.selectedImageFile || form.dataset.firstImageFile || "null");
  } catch {
    return null;
  }
};

const shouldRegenerateApprovedImage = (formData, approvedStickerImageUrl) => (
  formData.get("replace_approved_image") === "on"
  || !approvedStickerImageUrl
  || approvedStickerImageUrl.includes("/storage/v1/object/sign/")
  || approvedStickerImageUrl.includes("/submission-uploads/")
);

const batchReadinessText = (submission) => {
  if (submission.status !== "approved") {
    return "Not batchable: status must be approved";
  }

  if (submission.producer_status !== "ready") {
    return "Not batchable: producer status must be Ready";
  }

  if (!submission.approved_sticker_image_url) {
    return "Not batchable: final sticker image URL is missing";
  }

  if (!hasCompleteShipping(submission)) {
    return "Not batchable: shipping address is incomplete";
  }

  return "Ready for the next printer batch";
};

const submissionMatchesSearch = (submission, searchTerm) => {
  if (!searchTerm) {
    return true;
  }

  const haystack = [
    submission.id,
    roarId(submission),
    submission.child_name,
    submission.child_age,
    submission.diagnosis,
    submission.sticker_title,
    submission.sticker_message,
    submission.story,
    submission.parent_guardian_name,
    submission.parent_guardian_email,
    submission.parent_guardian_phone,
    submission.approved_display_name,
    submission.approved_age,
    submission.approved_battle_type,
    submission.approved_tagline,
    submission.approved_story,
    submission.fighter_slug,
    submission.status,
    submission.producer_status
  ]
    .filter((value) => value !== null && value !== undefined)
    .join(" ")
    .toLowerCase();

  return haystack.includes(searchTerm.toLowerCase());
};

const normalizeSubmissionWorkflow = async (submissions) => {
  const approvedNotReadyIds = submissions
    .filter((submission) => submission.status === "approved" && submission.producer_status === "not_ready")
    .map((submission) => submission.id);
  const sentNotArchivedIds = submissions
    .filter((submission) => submission.producer_status === "sent" && submission.status !== "archived")
    .map((submission) => submission.id);
  const archivedNotSentIds = submissions
    .filter((submission) => submission.status === "archived" && submission.producer_status !== "sent")
    .map((submission) => submission.id);

  if (approvedNotReadyIds.length) {
    const { error } = await supabaseClient
      .from("sticker_submissions")
      .update({ producer_status: "ready" })
      .in("id", approvedNotReadyIds);

    if (!error) {
      submissions.forEach((submission) => {
        if (approvedNotReadyIds.includes(submission.id)) {
          submission.producer_status = "ready";
        }
      });
    }
  }

  if (sentNotArchivedIds.length) {
    const sentAt = new Date().toISOString();
    const { error } = await supabaseClient
      .from("sticker_submissions")
      .update({ status: "archived", producer_sent_at: sentAt })
      .in("id", sentNotArchivedIds);

    if (!error) {
      submissions.forEach((submission) => {
        if (sentNotArchivedIds.includes(submission.id)) {
          submission.status = "archived";
          submission.producer_sent_at = submission.producer_sent_at || sentAt;
        }
      });
    }
  }

  if (archivedNotSentIds.length) {
    const sentAt = new Date().toISOString();
    const { error } = await supabaseClient
      .from("sticker_submissions")
      .update({ producer_status: "sent", producer_sent_at: sentAt })
      .in("id", archivedNotSentIds);

    if (!error) {
      submissions.forEach((submission) => {
        if (archivedNotSentIds.includes(submission.id)) {
          submission.producer_status = "sent";
          submission.producer_sent_at = submission.producer_sent_at || sentAt;
        }
      });
    }
  }
};

const csvEscape = (value) => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const downloadCsv = (filename, rows) => {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const setButtonsBusy = (buttons, busy) => {
  for (const button of buttons) {
    if (button) {
      button.disabled = busy;
    }
  }
};

const updateBatchActionState = () => {
  const selectedOption = batchSelect?.options[batchSelect.selectedIndex];
  const hasBatch = Boolean(batchSelect?.value);
  const isSent = selectedOption?.dataset.status === "sent";

  if (downloadBatchButton) {
    downloadBatchButton.disabled = !hasBatch;
  }

  if (markBatchSentButton) {
    markBatchSentButton.disabled = !hasBatch || isSent;
    markBatchSentButton.textContent = isSent ? "Batch Already Sent" : "Mark Batch Sent";
  }
};

const setProductionButtonsBusy = (busy) => {
  setButtonsBusy([createBatchButton, downloadBatchButton, markBatchSentButton], busy);

  if (!busy) {
    updateBatchActionState();
  }
};

const hasUnsavedReviewChanges = () => Boolean(document.querySelector(".review-form.is-dirty"));

const markFormDirty = (form, dirty = true) => {
  form.classList.toggle("is-dirty", dirty);
};

const authErrorMessage = (error) => {
  const message = error?.message || "Unknown auth error";

  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Could not sign in. Check the admin email and password.";
  }

  return `Could not sign in. Supabase says: ${message}`;
};

const showLogin = () => {
  loginPanel.hidden = false;
  adminPanel.hidden = true;
  signOutButton.hidden = true;
  adminEmail.textContent = "";
};

const showAdmin = (email) => {
  loginPanel.hidden = true;
  adminPanel.hidden = false;
  signOutButton.hidden = false;
  adminEmail.textContent = email || "";
};

const ensureConfigured = () => {
  if (!window.DinoBoySupabase?.isConfigured() || !supabaseClient) {
    setStatus(loginStatus, "Supabase is not configured yet.", "error");
    return false;
  }

  return true;
};

const verifyAdmin = async (user) => {
  const { data, error } = await supabaseClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return true;
};

const getSignedFileUrl = async (path) => {
  const { data, error } = await supabaseClient.storage
    .from(uploadBucket)
    .createSignedUrl(path, 60 * 10);

  if (error) {
    throw error;
  }

  return data.signedUrl;
};

const createApprovedImageFromUpload = async (submissionId, file) => {
  if (!file?.path) {
    return null;
  }

  const signedUrl = await getSignedFileUrl(file.path);
  const response = await fetch(signedUrl);

  if (!response.ok) {
    throw new Error("Could not read the submitted drawing photo.");
  }

  const blob = await response.blob();
  const extension = (file.original_filename || "image.jpg").split(".").pop() || "jpg";
  const publicPath = `approved/${submissionId}/${Date.now()}-${safeStorageName(file.original_filename || file.file_type)}.${extension}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(approvedBucket)
    .upload(publicPath, blob, {
      cacheControl: "3600",
      contentType: file.mime_type || blob.type || "image/jpeg",
      upsert: true
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabaseClient.storage
    .from(approvedBucket)
    .getPublicUrl(publicPath);

  return data.publicUrl;
};

const prepareApprovedImageForSubmission = async (submission) => {
  if (submission.approved_sticker_image_url) {
    return submission;
  }

  const fileMap = await loadFiles([submission.id]);
  const firstImageFile = (fileMap.get(submission.id) || []).find((file) => file.mime_type?.startsWith("image/"));

  if (!firstImageFile) {
    return submission;
  }

  const approvedImageUrl = await createApprovedImageFromUpload(submission.id, firstImageFile);
  const updates = {
    approved_card_image_url: submission.approved_card_image_url || approvedImageUrl,
    approved_sticker_image_url: approvedImageUrl
  };

  const { error } = await supabaseClient
    .from("sticker_submissions")
    .update(updates)
    .eq("id", submission.id);

  if (error) {
    throw error;
  }

  return {
    ...submission,
    ...updates
  };
};

const loadFiles = async (submissionIds) => {
  if (!submissionIds.length) {
    return new Map();
  }

  const { data, error } = await supabaseClient
    .from("submission_files")
    .select("*")
    .in("submission_id", submissionIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const fileMap = new Map();

  for (const file of data || []) {
    if (!fileMap.has(file.submission_id)) {
      fileMap.set(file.submission_id, []);
    }

    fileMap.get(file.submission_id).push(file);
  }

  return fileMap;
};

const renderFiles = async (container, files, form, selectedLabelElement, summaryThumbElement) => {
  container.innerHTML = "";

  if (!files.length) {
    container.innerHTML = `<div class="file-card">No files found</div>`;
    if (summaryThumbElement) {
      summaryThumbElement.textContent = "No image";
    }
    return;
  }

  const imageFiles = files.filter((file) => file.mime_type?.startsWith("image/"));
  const firstImageFile = imageFiles[0] || null;
  form.dataset.firstImageFile = JSON.stringify(firstImageFile);
  form.dataset.selectedImageFile = JSON.stringify(firstImageFile);

  if (selectedLabelElement) {
    selectedLabelElement.textContent = firstImageFile
      ? `Selected final image: ${selectedImageLabel(firstImageFile)}`
      : "Selected final image: no drawing photo available";
  }

  if (summaryThumbElement && firstImageFile) {
    try {
      const signedUrl = await getSignedFileUrl(firstImageFile.path);
      summaryThumbElement.innerHTML = `<img src="${escapeHtml(signedUrl)}" alt="${escapeHtml(firstImageFile.original_filename || "Submitted sticker photo")}" />`;
    } catch {
      summaryThumbElement.textContent = "Image unavailable";
    }
  } else if (summaryThumbElement) {
    summaryThumbElement.textContent = "No image";
  }

  for (const [index, file] of files.entries()) {
    const fileCard = document.createElement("div");
    fileCard.className = "file-card";
    fileCard.classList.toggle("is-selected", firstImageFile?.id === file.id);

    const link = document.createElement("a");
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = file.original_filename || file.file_type;

    try {
      const signedUrl = await getSignedFileUrl(file.path);
      link.href = signedUrl;

      if (file.mime_type?.startsWith("image/")) {
        const image = document.createElement("img");
        image.src = signedUrl;
        image.alt = file.original_filename || "Uploaded drawing photo";
        link.textContent = "";
        link.append(image);
      }
    } catch {
      link.removeAttribute("href");
      link.textContent = "Could not load file";
    }

    fileCard.append(link);

    if (file.mime_type?.startsWith("image/")) {
      const radioId = `final-image-${file.submission_id}-${index}`;
      const label = document.createElement("label");
      label.setAttribute("for", radioId);

      const radio = document.createElement("input");
      radio.id = radioId;
      radio.name = `final_image_${file.submission_id}`;
      radio.type = "radio";
      radio.checked = firstImageFile?.id === file.id;
      radio.addEventListener("change", () => {
        form.dataset.selectedImageFile = JSON.stringify(file);

        for (const card of container.querySelectorAll(".file-card")) {
          card.classList.remove("is-selected");
        }

        fileCard.classList.add("is-selected");

        if (selectedLabelElement) {
          selectedLabelElement.textContent = `Selected final image: ${selectedImageLabel(file)}`;
        }
      });

      label.append(radio, document.createTextNode(" Use as final image"));
      fileCard.append(label);
    }

    container.append(fileCard);
  }
};

const setFormValue = (form, name, value) => {
  const input = form.elements[name];
  if (input) {
    input.value = value ?? "";
  }
};

const syncStatusControls = (form, changedField) => {
  const statusInput = form.elements.status;
  const producerStatusInput = form.elements.producer_status;

  if (!statusInput || !producerStatusInput) {
    return;
  }

  if (changedField === "status" && statusInput.value === "approved" && producerStatusInput.value === "not_ready") {
    producerStatusInput.value = "ready";
  }

  if (changedField === "status" && statusInput.value === "archived") {
    producerStatusInput.value = "sent";
  }

  if (changedField === "producer_status" && producerStatusInput.value === "sent") {
    statusInput.value = "archived";
  }
};

const submissionPublicSummary = (submission) => (
  submission.consent_publish && submission.is_public && submission.fighter_slug
    ? "On"
    : "Off"
);

const renderSubmissionSummary = (card, submission) => {
  const title = submission.sticker_title || "Untitled Sticker";
  const fighter = `${submission.child_name || "Unnamed fighter"}${submission.child_age ? `, ${submission.child_age}` : ""}`;

  card.querySelector('[data-field="summaryRoarId"]').textContent = roarId(submission);
  card.querySelector('[data-field="summaryTitle"]').textContent = title;
  card.querySelector('[data-field="summaryMeta"]').textContent = fighter;
  card.querySelector('[data-field="summaryStatus"]').textContent = submission.status || "new";
  card.querySelector('[data-field="summaryProducer"]').textContent = submission.producer_status || "not_ready";
  card.querySelector('[data-field="summaryShipping"]').textContent = hasCompleteShipping(submission) ? "Ready" : "Incomplete";
  card.querySelector('[data-field="summaryPublic"]').textContent = submissionPublicSummary(submission);
};

const renderSubmission = async (submission, files, index) => {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".submission-card");
  const form = fragment.querySelector(".review-form");

  card.style.setProperty("--tilt", tiltValues[index % tiltValues.length]);
  renderSubmissionSummary(card, submission);
  form.dataset.approvedAt = submission.approved_at || "";
  form.dataset.producerSentAt = submission.producer_sent_at || "";
  form.dataset.publishConsent = submission.consent_publish ? "true" : "false";
  form.dataset.childName = submission.child_name || "";
  form.dataset.childAge = submission.child_age || "";
  form.dataset.diagnosis = submission.diagnosis || "";
  form.dataset.stickerTitle = submission.sticker_title || "";
  form.dataset.story = submission.story || "";
  card.querySelector('[data-field="title"]').textContent = submission.sticker_title || "Untitled Sticker";
  card.querySelector('[data-field="roarId"]').textContent = roarId(submission);
  card.querySelector('[data-field="fighter"]').textContent = `${submission.child_name}, ${submission.child_age || "age not listed"}`;
  card.querySelector('[data-field="diagnosis"]').textContent = valueOrDash(submission.diagnosis);
  card.querySelector('[data-field="message"]').textContent = valueOrDash(submission.sticker_message);
  card.querySelector('[data-field="story"]').textContent = valueOrDash(submission.story);
  card.querySelector('[data-field="guardian"]').textContent = `${submission.parent_guardian_name} · ${submission.parent_guardian_email}${submission.parent_guardian_phone ? ` · ${submission.parent_guardian_phone}` : ""}`;
  card.querySelector('[data-field="shipping"]').textContent = shippingSummaryText(submission);
  card.querySelector('[data-field="publishConsent"]').textContent = submission.consent_publish
    ? "Yes, family allowed public gallery/profile use"
    : "No, keep private for sticker production only";
  card.querySelector('[data-field="publicStatus"]').textContent = publicStatusText(submission);
  card.querySelector('[data-field="batchReadiness"]').textContent = batchReadinessText(submission);
  card.querySelector('[data-field="created"]').textContent = formatDate(submission.created_at);

  setFormValue(form, "id", submission.id);
  setFormValue(form, "status", submission.status);
  setFormValue(form, "producer_status", submission.producer_status);
  setFormValue(form, "approved_display_name", submission.approved_display_name);
  setFormValue(form, "approved_age", submission.approved_age);
  setFormValue(form, "approved_battle_type", submission.approved_battle_type);
  setFormValue(form, "approved_tagline", submission.approved_tagline);
  setFormValue(form, "fighter_slug", submission.fighter_slug);
  form.elements.is_public.checked = Boolean(submission.is_public);
  setFormValue(form, "approved_story", submission.approved_story);
  setFormValue(form, "shipping_recipient_name", submission.shipping_recipient_name);
  setFormValue(form, "shipping_address_1", submission.shipping_address_1);
  setFormValue(form, "shipping_address_2", submission.shipping_address_2);
  setFormValue(form, "shipping_city", submission.shipping_city);
  setFormValue(form, "shipping_state", submission.shipping_state);
  setFormValue(form, "shipping_postal_code", submission.shipping_postal_code);
  setFormValue(form, "shipping_country", submission.shipping_country || "US");
  setFormValue(form, "admin_notes", submission.admin_notes);
  setFormValue(form, "producer_notes", submission.producer_notes);
  setFormValue(form, "producer_quantity", submission.producer_quantity || producerDefaults.quantity);
  setFormValue(form, "producer_size", submission.producer_size || producerDefaults.size);
  setFormValue(form, "producer_edge_text", submission.producer_edge_text || producerDefaults.edgeText);
  setFormValue(form, "producer_finish", submission.producer_finish || producerDefaults.finish);
  setFormValue(form, "approved_card_image_url", submission.approved_card_image_url);
  setFormValue(form, "approved_sticker_image_url", submission.approved_sticker_image_url);
  setFormValue(form, "producer_tracking_url", submission.producer_tracking_url);

  await renderFiles(
    card.querySelector('[data-field="files"]'),
    files,
    form,
    card.querySelector('[data-field="selectedImageLabel"]'),
    card.querySelector('[data-field="summaryThumb"]')
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveReview(form);
  });

  form.elements.status?.addEventListener("change", () => syncStatusControls(form, "status"));
  form.elements.producer_status?.addEventListener("change", () => syncStatusControls(form, "producer_status"));
  form.addEventListener("input", () => markFormDirty(form));
  form.addEventListener("change", () => markFormDirty(form));

  card.querySelector("[data-action='toggle-submission']")?.addEventListener("click", (event) => {
    const isOpen = card.classList.toggle("is-open");
    event.currentTarget.textContent = isOpen ? "Close" : "Open";
  });

  submissionsList.append(fragment);
};

const loadSubmissions = async () => {
  clearStatus(adminStatus);
  submissionsList.innerHTML = `<div class="empty">Loading submissions...</div>`;
  const searchTerm = adminSearch?.value?.trim() || "";

  let query = supabaseClient
    .from("sticker_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (statusFilter.value !== "all" && !searchTerm) {
    query = query.eq("status", statusFilter.value);
  }

  const { data, error } = await query;

  if (error) {
    submissionsList.innerHTML = "";
    setStatus(adminStatus, "Could not load submissions. Confirm your admin allowlist and RLS SQL were applied.", "error");
    return;
  }

  const normalizedData = data || [];
  await normalizeSubmissionWorkflow(normalizedData);
  const submissions = normalizedData.filter((submission) => submissionMatchesSearch(submission, searchTerm));

  if (!submissions.length) {
    submissionsList.innerHTML = `<div class="empty">No submissions in this view yet.</div>`;
    return;
  }

  const fileMap = await loadFiles(submissions.map((submission) => submission.id));
  submissionsList.innerHTML = "";

  for (const [index, submission] of submissions.entries()) {
    await renderSubmission(submission, fileMap.get(submission.id) || [], index);
  }
};

const saveReview = async (form) => {
  const formData = new FormData(form);
  const id = formData.get("id");
  const submitButton = form.querySelector("[type='submit']");
  const status = getInputValue(formData, "status");
  const wantsPublic = formData.get("is_public") === "on";
  const hasPublishConsent = form.dataset.publishConsent === "true";

  if (wantsPublic && !hasPublishConsent) {
    setStatus(adminStatus, "This family did not give public gallery permission. Save as approved/private for sticker production, or get updated permission before publishing.", "error");
    return;
  }

  let producerStatus = getInputValue(formData, "producer_status");
  let nextStatus = status;
  let producerSentAt = form.dataset.producerSentAt || null;

  if (nextStatus === "approved" && producerStatus === "not_ready") {
    producerStatus = "ready";
  }

  if (producerStatus === "sent") {
    nextStatus = "archived";
    producerSentAt = producerSentAt || new Date().toISOString();
  }

  if (nextStatus === "archived" && producerStatus !== "sent") {
    producerStatus = "sent";
    producerSentAt = producerSentAt || new Date().toISOString();
  }

  const publicAllowedStatus = ["approved", "archived"].includes(nextStatus);
  const isPublic = publicAllowedStatus && wantsPublic;
  const useSubmittedDetails = formData.get("use_submitted_details") === "on";
  const displayName = getInputValue(formData, "approved_display_name")
    || (useSubmittedDetails ? form.dataset.childName : null);
  const approvedAge = getNumberValue(formData, "approved_age")
    || (useSubmittedDetails && form.dataset.childAge ? Number(form.dataset.childAge) : null);
  const approvedBattleType = getInputValue(formData, "approved_battle_type")
    || (useSubmittedDetails ? form.dataset.diagnosis : null);
  const approvedTagline = getInputValue(formData, "approved_tagline")
    || (useSubmittedDetails ? form.dataset.stickerTitle : null);
  const approvedStory = getInputValue(formData, "approved_story")
    || (useSubmittedDetails ? form.dataset.story : null);
  const fighterSlug = isPublic
    ? (getInputValue(formData, "fighter_slug") || slugify(`${displayName || "fighter"} ${approvedTagline || "sticker"}`))
    : null;

  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  let approvedCardImageUrl = getInputValue(formData, "approved_card_image_url");
  let approvedStickerImageUrl = getInputValue(formData, "approved_sticker_image_url");

  if (["approved", "archived"].includes(nextStatus) && shouldRegenerateApprovedImage(formData, approvedStickerImageUrl)) {
    const selectedImageFile = parseSelectedImageFile(form);

    if (selectedImageFile) {
      submitButton.textContent = "Preparing approved image...";
      try {
        const approvedImageUrl = await createApprovedImageFromUpload(id, selectedImageFile);
        approvedCardImageUrl = approvedImageUrl;
        approvedStickerImageUrl = approvedImageUrl;
      } catch (error) {
        console.error("Could not prepare approved image", error);
        submitButton.disabled = false;
        submitButton.textContent = "Save Review";
        setStatus(adminStatus, `Could not prepare the approved image. Supabase says: ${error?.message || "Unknown error"}`, "error");
        return;
      }
    }
  }

  const payload = {
    status: nextStatus,
    producer_status: producerStatus,
    producer_sent_at: producerSentAt,
    approved_display_name: displayName,
    approved_age: approvedAge,
    approved_battle_type: approvedBattleType,
    approved_tagline: approvedTagline,
    fighter_slug: fighterSlug,
    is_public: isPublic,
    approved_story: approvedStory,
    shipping_recipient_name: getInputValue(formData, "shipping_recipient_name"),
    shipping_address_1: getInputValue(formData, "shipping_address_1"),
    shipping_address_2: getInputValue(formData, "shipping_address_2"),
    shipping_city: getInputValue(formData, "shipping_city"),
    shipping_state: getInputValue(formData, "shipping_state"),
    shipping_postal_code: getInputValue(formData, "shipping_postal_code"),
    shipping_country: getInputValue(formData, "shipping_country") || "US",
    admin_notes: getInputValue(formData, "admin_notes"),
    producer_notes: getInputValue(formData, "producer_notes"),
    producer_quantity: getNumberValue(formData, "producer_quantity") || producerDefaults.quantity,
    producer_size: getInputValue(formData, "producer_size") || producerDefaults.size,
    producer_edge_text: getInputValue(formData, "producer_edge_text") || producerDefaults.edgeText,
    producer_finish: getInputValue(formData, "producer_finish") || producerDefaults.finish,
    approved_card_image_url: approvedCardImageUrl,
    approved_sticker_image_url: approvedStickerImageUrl,
    producer_tracking_url: getInputValue(formData, "producer_tracking_url")
  };

  if (["approved", "archived"].includes(nextStatus) && isPublic) {
    payload.approved_at = form.dataset.approvedAt || new Date().toISOString();
    payload.approved_by = adminEmail.textContent || null;
  } else {
    payload.approved_at = null;
    payload.approved_by = null;
  }

  const { error } = await supabaseClient
    .from("sticker_submissions")
    .update(payload)
    .eq("id", id);

  submitButton.disabled = false;
  submitButton.textContent = "Save Review";

  if (error) {
    console.error("Could not save review changes", error);
    setStatus(adminStatus, `Could not save review changes. Supabase says: ${error?.message || "Unknown error"}`, "error");
    return;
  }

  markFormDirty(form, false);
  setStatus(adminStatus, "Review saved.", "success");
  await loadSubmissions();
  await loadProductionBatches();
  await renderBatchPreview();
};

const renderBatchPreview = async () => {
  if (!batchPreview) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("sticker_submissions")
    .select("id,created_at,child_name,sticker_title,approved_display_name,status,producer_status,approved_sticker_image_url,shipping_recipient_name,shipping_address_1,shipping_city,shipping_state,shipping_postal_code,is_public,fighter_slug,consent_publish")
    .eq("status", "approved")
    .eq("producer_status", "ready")
    .order("created_at", { ascending: true })
    .limit(25);

  if (error) {
    batchPreview.innerHTML = `<div class="batch-preview-row">Could not load batch readiness rows.</div>`;
    return;
  }

  if (!data?.length) {
    batchPreview.innerHTML = `<div class="batch-preview-row">No approved submissions are ready for a new batch.</div>`;
    return;
  }

  batchPreview.innerHTML = data.map((submission) => {
    const hasImage = Boolean(submission.approved_sticker_image_url);
    const hasShipping = hasCompleteShipping(submission);
    const publicReady = Boolean(submission.consent_publish && submission.is_public && submission.fighter_slug);
    const name = submission.approved_display_name || submission.child_name || "Unnamed fighter";

    return `
      <div class="batch-preview-row">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(submission.sticker_title || "Untitled sticker")}</span>
        <span>${escapeHtml(submission.producer_status)}</span>
        <span>${hasImage ? "Final image ready" : "Missing final image"}</span>
        <span>${hasShipping ? "Shipping ready" : "Shipping incomplete"}</span>
        <span>${publicReady ? "Public profile on" : "Public profile off"}</span>
      </div>
    `;
  }).join("");
};

const loadProductionBatches = async () => {
  if (!batchSelect) {
    return;
  }

  const { data: batches, error } = await supabaseClient
    .from("production_batches")
    .select("id,name,status,created_at,sent_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    setStatus(batchStatus, "Could not load production batches. Confirm the production SQL has been applied.", "error");
    return;
  }

  batchSelect.innerHTML = "";
  if (batchList) {
    batchList.innerHTML = "";
  }

  if (!batches?.length) {
    batchSelect.innerHTML = `<option value="">No batches yet</option>`;
    if (batchList) {
      batchList.innerHTML = `<div class="batch-preview-row">No saved batches yet.</div>`;
    }
    updateBatchActionState();
    await renderSelectedBatchDetails();
    return;
  }

  const { data: items, error: itemsError } = await supabaseClient
    .from("production_batch_items")
    .select("batch_id,quantity,status,display_name,sticker_title")
    .in("batch_id", batches.map((batch) => batch.id));

  if (itemsError) {
    setStatus(batchStatus, "Could not load batch statistics.", "error");
    return;
  }

  const statsByBatch = new Map();

  for (const batch of batches) {
    statsByBatch.set(batch.id, {
      count: 0,
      quantity: 0,
      names: []
    });
  }

  for (const item of items || []) {
    const stats = statsByBatch.get(item.batch_id);
    if (!stats) {
      continue;
    }

    stats.count += 1;
    stats.quantity += Number(item.quantity || 0);
    stats.names.push(item.display_name || item.sticker_title || "Unnamed fighter");
  }

  for (const batch of batches) {
    const option = document.createElement("option");
    option.value = batch.id;
    option.dataset.status = batch.status;
    option.textContent = `${batch.name} (${batch.status})`;
    batchSelect.append(option);
  }

  if (batchList) {
    batchList.innerHTML = batches.map((batch) => {
      const stats = statsByBatch.get(batch.id) || { count: 0, quantity: 0, names: [] };
      const dateLabel = batch.sent_at
        ? `Sent ${formatDate(batch.sent_at)}`
        : `Created ${formatDate(batch.created_at)}`;
      const names = stats.names.slice(0, 4).join(", ");
      const more = stats.names.length > 4 ? ` +${stats.names.length - 4} more` : "";

      return `
        <div class="batch-card" data-batch-id="${escapeHtml(batch.id)}">
          <div>
            <strong>${escapeHtml(batch.name)}</strong>
            <small>${escapeHtml(dateLabel)}</small>
          </div>
          <span>${escapeHtml(batch.status)}</span>
          <span>${stats.count} item${stats.count === 1 ? "" : "s"}</span>
          <span>${stats.quantity} sticker${stats.quantity === 1 ? "" : "s"}</span>
          <span>${escapeHtml(`${names}${more}` || "No items")}</span>
          <div class="batch-card-actions">
            <button class="mini-button secondary" type="button" data-action="select-batch" data-batch-id="${escapeHtml(batch.id)}">Open</button>
            <button class="mini-button" type="button" data-action="download-batch" data-batch-id="${escapeHtml(batch.id)}" data-batch-name="${escapeHtml(batch.name)}">CSV</button>
          </div>
        </div>
      `;
    }).join("");
  }

  updateBatchActionState();
  await renderSelectedBatchDetails();
};

const createBatchName = () => {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date());

  return `${date} Sticker Batch`;
};

const createBatchFromReady = async () => {
  if (hasUnsavedReviewChanges()) {
    setStatus(batchStatus, "Save the open review changes first, then create the batch.", "error");
    return;
  }

  setProductionButtonsBusy(true);
  clearStatus(batchStatus);

  try {
    const { data: submissions, error: submissionsError } = await supabaseClient
      .from("sticker_submissions")
      .select("*")
      .eq("status", "approved")
      .eq("producer_status", "ready")
      .order("created_at", { ascending: true });

    if (submissionsError) {
      throw submissionsError;
    }

    let approvedReadySubmissions = submissions || [];

    if (!approvedReadySubmissions.length) {
      setStatus(batchStatus, "No submissions are both Approved and Producer Status Ready yet.", "error");
      return;
    }

    setStatus(batchStatus, "Preparing approved images for ready submissions...", "info");
    approvedReadySubmissions = await Promise.all(
      approvedReadySubmissions.map((submission) => prepareApprovedImageForSubmission(submission))
    );

    const missingStickerImage = approvedReadySubmissions.filter((submission) => !submission.approved_sticker_image_url);
    const missingShipping = approvedReadySubmissions.filter((submission) => (
      !submission.shipping_recipient_name
      || !submission.shipping_address_1
      || !submission.shipping_city
      || !submission.shipping_state
      || !submission.shipping_postal_code
    ));
    const readySubmissions = approvedReadySubmissions.filter((submission) => (
      submission.approved_sticker_image_url
      && submission.shipping_recipient_name
      && submission.shipping_address_1
      && submission.shipping_city
      && submission.shipping_state
      && submission.shipping_postal_code
    ));

    if (!readySubmissions.length) {
      const reasons = [];

      if (missingStickerImage.length) {
        reasons.push(`${missingStickerImage.length} missing final sticker image URL`);
      }

      if (missingShipping.length) {
        reasons.push(`${missingShipping.length} missing shipping details`);
      }

      setStatus(batchStatus, `Approved Ready submissions found, but none are batchable yet: ${reasons.join("; ")}.`, "error");
      return;
    }

    const { data: existingItems, error: existingError } = await supabaseClient
      .from("production_batch_items")
      .select("submission_id")
      .in("submission_id", readySubmissions.map((submission) => submission.id));

    if (existingError) {
      throw existingError;
    }

    const alreadyBatched = new Set((existingItems || []).map((item) => item.submission_id));
    const eligibleSubmissions = readySubmissions.filter((submission) => !alreadyBatched.has(submission.id));

    if (!eligibleSubmissions.length) {
      setStatus(batchStatus, "Those Ready submissions are already in production batches.", "error");
      return;
    }

    const { data: batch, error: batchError } = await supabaseClient
      .from("production_batches")
      .insert({
        name: createBatchName(),
        status: "draft",
        notes: "First 100 stickers are covered by DinoBoy Sticker Lab. Produce as die-cut stickers with dinoboysc.com around the edge of the approved final art."
      })
      .select()
      .single();

    if (batchError) {
      throw batchError;
    }

    const rows = eligibleSubmissions.map((submission) => ({
      batch_id: batch.id,
      submission_id: submission.id,
      quantity: submission.producer_quantity || producerDefaults.quantity,
      sticker_size: submission.producer_size || producerDefaults.size,
      edge_text: submission.producer_edge_text || producerDefaults.edgeText,
      finish: submission.producer_finish || producerDefaults.finish,
      artwork_url: submission.approved_sticker_image_url,
      card_image_url: submission.approved_card_image_url,
      display_name: submission.approved_display_name || submission.child_name,
      sticker_title: submission.sticker_title,
      producer_notes: submission.producer_notes,
      ship_to_name: submission.shipping_recipient_name,
      ship_to_address_1: submission.shipping_address_1,
      ship_to_address_2: submission.shipping_address_2,
      ship_to_city: submission.shipping_city,
      ship_to_state: submission.shipping_state,
      ship_to_postal_code: submission.shipping_postal_code,
      ship_to_country: submission.shipping_country || "US"
    }));

    const { error: itemsError } = await supabaseClient
      .from("production_batch_items")
      .insert(rows);

    if (itemsError) {
      throw itemsError;
    }

    const { error: updateError } = await supabaseClient
      .from("sticker_submissions")
      .update({ producer_status: "batched" })
      .in("id", eligibleSubmissions.map((submission) => submission.id));

    if (updateError) {
      throw updateError;
    }

    setStatus(batchStatus, `Created ${batch.name} with ${rows.length} item${rows.length === 1 ? "" : "s"}.`, "success");
    await loadProductionBatches();
    batchSelect.value = batch.id;
    updateBatchActionState();
    await renderSelectedBatchDetails();
    await loadSubmissions();
    await renderBatchPreview();
  } catch (error) {
    console.error("Could not create production batch", error);
    setStatus(batchStatus, `Could not create production batch. Supabase says: ${error?.message || "Unknown error"}`, "error");
  } finally {
    setProductionButtonsBusy(false);
  }
};

const loadBatchItems = async (batchId) => {
  const { data, error } = await supabaseClient
    .from("production_batch_items")
    .select("*")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
};

const renderSelectedBatchDetails = async () => {
  if (!batchDetails) {
    return;
  }

  const batchId = batchSelect?.value;

  if (!batchId) {
    batchDetails.innerHTML = "";
    return;
  }

  const batchName = batchSelect.options[batchSelect.selectedIndex]?.textContent || "Selected batch";
  batchDetails.innerHTML = `<div class="batch-preview-row">Loading ${escapeHtml(batchName)}...</div>`;

  try {
    const rows = await loadBatchItems(batchId);

    if (!rows.length) {
      batchDetails.innerHTML = `<div class="batch-preview-row">This batch has no items yet.</div>`;
      return;
    }

    batchDetails.innerHTML = `
      <h3>Open Batch: ${escapeHtml(batchName)}</h3>
      ${rows.map((item) => `
        <div class="batch-detail-row">
          <span>${escapeHtml(item.display_name || "Unnamed fighter")}</span>
          <span>${escapeHtml(item.sticker_title || "Untitled sticker")}</span>
          <span>${escapeHtml(item.status || "queued")}</span>
          <span>${escapeHtml([
            item.ship_to_name,
            item.ship_to_city,
            item.ship_to_state,
            item.ship_to_postal_code
          ].filter(Boolean).join(", ") || "No shipping snapshot")}</span>
        </div>
      `).join("")}
    `;
  } catch (error) {
    console.error("Could not load batch details", error);
    batchDetails.innerHTML = `<div class="batch-preview-row">Could not load this batch.</div>`;
  }
};

const downloadBatch = async (batchId, batchName = "production-batch") => {
  if (!batchId) {
    setStatus(batchStatus, "Choose a batch first.", "error");
    return;
  }

  try {
    const rows = await loadBatchItems(batchId);

    if (!rows.length) {
      setStatus(batchStatus, "This batch has no items yet.", "error");
      return;
    }

    const header = [
      "display_name",
      "sticker_title",
      "quantity",
      "sticker_size",
      "cut_type",
      "edge_text",
      "finish_instructions",
      "artwork_url",
      "producer_notes",
      "ship_to_name",
      "ship_to_address_1",
      "ship_to_address_2",
      "ship_to_city",
      "ship_to_state",
      "ship_to_postal_code",
      "ship_to_country"
    ];

    const csvRows = [
      header,
      ...rows.map((item) => [
        item.display_name,
        item.sticker_title,
        item.quantity,
        item.sticker_size,
        "die cut",
        item.edge_text,
        item.finish,
        item.artwork_url,
        item.producer_notes,
        item.ship_to_name,
        item.ship_to_address_1,
        item.ship_to_address_2,
        item.ship_to_city,
        item.ship_to_state,
        item.ship_to_postal_code,
        item.ship_to_country
      ])
    ];

    const filename = `${batchName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.csv`;
    downloadCsv(filename, csvRows);
    setStatus(batchStatus, "Printer CSV downloaded.", "success");
  } catch (error) {
    console.error("Could not download production batch", error);
    setStatus(batchStatus, "Could not download this batch.", "error");
  }
};

const downloadSelectedBatch = async () => {
  const batchId = batchSelect?.value;
  const selectedBatchName = batchSelect.options[batchSelect.selectedIndex]?.textContent || "production-batch";
  await downloadBatch(batchId, selectedBatchName);
};

const markSelectedBatchSent = async () => {
  const batchId = batchSelect?.value;

  if (!batchId) {
    setStatus(batchStatus, "Choose a batch first.", "error");
    return;
  }

  const selectedOption = batchSelect.options[batchSelect.selectedIndex];
  if (selectedOption?.dataset.status === "sent") {
    setStatus(batchStatus, "This batch is already marked sent. You can still re-download the printer CSV.", "info");
    return;
  }

  setProductionButtonsBusy(true);

  try {
    const sentAt = new Date().toISOString();
    const items = await loadBatchItems(batchId);
    const submissionIds = items.map((item) => item.submission_id);

    const { error: batchError } = await supabaseClient
      .from("production_batches")
      .update({ status: "sent", sent_at: sentAt })
      .eq("id", batchId);

    if (batchError) {
      throw batchError;
    }

    const { error: itemError } = await supabaseClient
      .from("production_batch_items")
      .update({ status: "sent" })
      .eq("batch_id", batchId);

    if (itemError) {
      throw itemError;
    }

    if (submissionIds.length) {
      const { error: submissionError } = await supabaseClient
        .from("sticker_submissions")
        .update({ producer_status: "sent", producer_sent_at: sentAt, status: "archived" })
        .in("id", submissionIds);

      if (submissionError) {
        throw submissionError;
      }
    }

    setStatus(batchStatus, "Batch marked sent to producer and submissions archived.", "success");
    await loadProductionBatches();
    batchSelect.value = batchId;
    updateBatchActionState();
    await renderSelectedBatchDetails();
    await loadSubmissions();
    await renderBatchPreview();
  } catch (error) {
    console.error("Could not mark production batch sent", error);
    setStatus(batchStatus, "Could not mark this batch sent.", "error");
  } finally {
    setProductionButtonsBusy(false);
  }
};

const initializeAdmin = async () => {
  if (!ensureConfigured()) {
    showLogin();
    return;
  }

  const { data } = await supabaseClient.auth.getSession();

  if (!data.session?.user) {
    showLogin();
    return;
  }

  const isAdmin = await verifyAdmin(data.session.user);

  if (!isAdmin) {
    showLogin();
    setStatus(loginStatus, "You are signed in, but this account is not on the admin allowlist.", "error");
    return;
  }

  showAdmin(data.session.user.email);
  await loadSubmissions();
  await loadProductionBatches();
  await renderBatchPreview();
};

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!ensureConfigured()) {
    return;
  }

  clearStatus(loginStatus);
  const formData = new FormData(loginForm);
  const email = getInputValue(formData, "email");
  const password = getInputValue(formData, "password");

  loginSubmitButton.disabled = true;
  loginSubmitButton.textContent = "Signing in...";

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setStatus(loginStatus, authErrorMessage(error), "error");
      return;
    }

    if (!data.session?.user) {
      setStatus(loginStatus, "Could not sign in. Supabase did not return an admin session.", "error");
      return;
    }

    const isAdmin = await verifyAdmin(data.session.user);

    if (!isAdmin) {
      await supabaseClient.auth.signOut();
      setStatus(loginStatus, "You are signed in, but this account is not on the admin allowlist.", "error");
      return;
    }

    showAdmin(data.session.user.email);
    await loadSubmissions();
    await loadProductionBatches();
    await renderBatchPreview();
  } finally {
    loginSubmitButton.disabled = false;
    loginSubmitButton.textContent = "Sign In";
  }
});

signOutButton?.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  showLogin();
});

refreshButton?.addEventListener("click", async () => {
  await loadSubmissions();
  await renderBatchPreview();
});
statusFilter?.addEventListener("change", loadSubmissions);
adminSearch?.addEventListener("input", loadSubmissions);
batchSelect?.addEventListener("change", async () => {
  updateBatchActionState();
  await renderSelectedBatchDetails();
});
batchList?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const batchId = button.dataset.batchId;

  if (button.dataset.action === "select-batch") {
    batchSelect.value = batchId;
    updateBatchActionState();
    await renderSelectedBatchDetails();
    batchDetails?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  if (button.dataset.action === "download-batch") {
    await downloadBatch(batchId, button.dataset.batchName || "production-batch");
  }
});
createBatchButton?.addEventListener("click", createBatchFromReady);
downloadBatchButton?.addEventListener("click", downloadSelectedBatch);
markBatchSentButton?.addEventListener("click", markSelectedBatchSent);

initializeAdmin();
