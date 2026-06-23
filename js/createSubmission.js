// Handles DinoBoy Sticker Lab form submissions.
// This creates a private review record, uploads drawing photos to Supabase
// Storage, and records file metadata. Nothing is published automatically.

const form = document.querySelector("#submission-form");
const submitButton = form?.querySelector("[type='submit']");
const statusMessage = document.querySelector("#submission-status");
const submissionModal = document.querySelector("[data-submission-modal]");
const submissionModalCard = document.querySelector("[data-submission-modal-card]");
const submissionModalTitle = document.querySelector("[data-submission-modal-title]");
const submissionModalMessage = document.querySelector("[data-submission-modal-message]");
const submissionModalClose = document.querySelector("[data-submission-modal-close]");
const uploadBucket = "submission-uploads";

const modalCopy = {
  success: "Roar Sent.",
  error: "Hold Up.",
  info: "One Sec."
};

const openStatusModal = (message, type = "info") => {
  if (!submissionModal || !submissionModalTitle || !submissionModalMessage) {
    return;
  }

  submissionModalTitle.textContent = modalCopy[type] || modalCopy.info;
  submissionModalMessage.textContent = message;
  submissionModalCard?.setAttribute("data-type", type);
  submissionModal.classList.add("is-open");
  submissionModal.setAttribute("aria-hidden", "false");
  submissionModalClose?.focus();
};

const closeStatusModal = () => {
  if (!submissionModal) {
    return;
  }

  submissionModal.classList.remove("is-open");
  submissionModal.setAttribute("aria-hidden", "true");
};

const setStatus = (message, type = "info") => {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.dataset.type = type;
  statusMessage.hidden = false;

  if (type === "success" || type === "error") {
    openStatusModal(message, type);
  }
};

const clearStatus = () => {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = "";
  statusMessage.removeAttribute("data-type");
  statusMessage.hidden = true;
};

const getValue = (formData, name) => {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const getNumber = (formData, name) => {
  const value = getValue(formData, name);
  return value === null ? null : Number(value);
};

const safeFilename = (filename) => {
  const cleaned = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || "drawing-photo";
};

const selectedFiles = () => [
  ["drawing_photo_1", document.querySelector("#drawing-photo-1")?.files?.[0]],
  ["drawing_photo_2", document.querySelector("#drawing-photo-2")?.files?.[0]],
  ["drawing_photo_3", document.querySelector("#drawing-photo-3")?.files?.[0]]
].filter(([, file]) => file);

const friendlyErrorMessage = (error, step) => {
  const message = error?.message || "Unknown error";
  const code = error?.code || error?.statusCode || error?.status;

  if (step === "submission" && (code === "42501" || message.toLowerCase().includes("row-level security"))) {
    return "The database blocked this submission. Please rerun the latest supabase/rls.sql in Supabase, then try again.";
  }

  if (step === "upload" && (code === "403" || code === 403 || message.toLowerCase().includes("row-level security"))) {
    return "The drawing was saved, but the photo upload was blocked. Check the submission-uploads bucket policy in supabase/rls.sql.";
  }

  if (step === "metadata" && (code === "42501" || message.toLowerCase().includes("row-level security"))) {
    return "The photo uploaded, but file metadata was blocked. Please rerun the latest supabase/rls.sql in Supabase.";
  }

  return `Something went wrong during ${step}. Supabase says: ${message}`;
};

const createSubmissionPayload = (formData) => ({
  child_name: getValue(formData, "child_name"),
  child_age: getNumber(formData, "age"),
  diagnosis: getValue(formData, "battle_type"),
  sticker_title: getValue(formData, "sticker_title"),
  sticker_message: getValue(formData, "sticker_says"),
  story: getValue(formData, "story_message"),
  parent_guardian_name: getValue(formData, "guardian_name"),
  parent_guardian_email: getValue(formData, "guardian_email"),
  parent_guardian_phone: getValue(formData, "guardian_phone"),
  shipping_recipient_name: getValue(formData, "shipping_recipient"),
  shipping_address_1: getValue(formData, "shipping_address_1"),
  shipping_address_2: getValue(formData, "shipping_address_2"),
  shipping_city: getValue(formData, "shipping_city"),
  shipping_state: getValue(formData, "shipping_state"),
  shipping_postal_code: getValue(formData, "shipping_postal_code"),
  shipping_country: getValue(formData, "shipping_country") || "US",
  consent_parent: formData.get("guardian_consent") === "on",
  consent_treatment: formData.get("treatment_confirmation") === "on",
  consent_review: formData.get("review_consent") === "on",
  consent_publish: formData.get("publish_consent") === "on",
  consent_shipping: formData.get("shipping_consent") === "on",
  consent_updates: formData.get("updates_consent") === "on"
});

const subscribeSubmissionEmail = async (payload) => {
  if (!payload.consent_updates) {
    return;
  }

  const supabaseClient = window.DinoBoySupabase?.client;
  const { error } = await supabaseClient.rpc("subscribe_to_updates", {
    subscriber_email: payload.parent_guardian_email,
    subscriber_name: payload.parent_guardian_name,
    subscriber_source: "sticker-submission"
  });

  if (error) {
    throw error;
  }
};

const sendConfirmationEmail = async (payload) => {
  const response = await fetch("/api/send-submission-confirmation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      submission_id: payload.id,
      site_origin: window.location.origin,
      child_name: payload.child_name,
      sticker_title: payload.sticker_title,
      parent_guardian_name: payload.parent_guardian_name,
      parent_guardian_email: payload.parent_guardian_email
    })
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Confirmation email could not be sent");
  }
};

const uploadSubmissionFiles = async (supabaseClient, submissionId, files) => {
  const metadataRows = [];

  for (const [fileType, file] of files) {
    const timestamp = Date.now();
    const path = `submissions/${submissionId}/${timestamp}-${safeFilename(file.name)}`;

    const { error: uploadError } = await supabaseClient.storage
      .from(uploadBucket)
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type || "application/octet-stream",
        upsert: false
      });

    if (uploadError) {
      uploadError.step = "upload";
      throw uploadError;
    }

    metadataRows.push({
      submission_id: submissionId,
      file_type: fileType,
      bucket: uploadBucket,
      path,
      original_filename: file.name,
      mime_type: file.type || null,
      file_size: file.size
    });
  }

  if (!metadataRows.length) {
    return;
  }

  const { error: metadataError } = await supabaseClient
    .from("submission_files")
    .insert(metadataRows);

  if (metadataError) {
    metadataError.step = "metadata";
    throw metadataError;
  }
};

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const supabaseClient = window.DinoBoySupabase?.client;

  if (!window.DinoBoySupabase?.isConfigured() || !supabaseClient) {
    setStatus(
      "Submissions are almost ready. Supabase needs to be configured before this form can send.",
      "error"
    );
    return;
  }

  const files = selectedFiles();

  if (!files.length) {
    setStatus("Please upload at least one drawing photo.", "error");
    return;
  }

  const formData = new FormData(form);
  const submissionId = crypto.randomUUID();
  const payload = createSubmissionPayload(formData);
  payload.id = submissionId;

  submitButton.disabled = true;
  submitButton.dataset.originalHtml = submitButton.innerHTML;
  submitButton.textContent = "Sending Your Roar...";
  setStatus("Creating your private submission...", "info");

  try {
    const { error: insertError } = await supabaseClient
      .from("sticker_submissions")
      .insert(payload);

    if (insertError) {
      insertError.step = "submission";
      throw insertError;
    }

    setStatus("Uploading drawing photos...", "info");
    await uploadSubmissionFiles(supabaseClient, submissionId, files);

    if (payload.consent_updates) {
      try {
        await subscribeSubmissionEmail(payload);
      } catch (newsletterError) {
        console.warn("Submission saved, but newsletter signup failed", newsletterError);
      }
    }

    let confirmationEmailSent = true;

    try {
      await sendConfirmationEmail(payload);
    } catch (emailError) {
      confirmationEmailSent = false;
      console.warn("Submission saved, but confirmation email failed", emailError);
    }

    form.reset();
    setStatus(
      confirmationEmailSent
        ? "Your roar was submitted! We sent a confirmation email and will review it before anything appears on the site."
        : "Your roar was submitted! We will review it before anything appears on the site. The confirmation email could not be sent yet, but your submission is saved.",
      "success"
    );
  } catch (error) {
    console.error("Submission failed", error);
    setStatus(friendlyErrorMessage(error, error.step || "submission"), "error");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = submitButton.dataset.originalHtml || "Submit Your Roar";
  }
});

submissionModalClose?.addEventListener("click", closeStatusModal);
submissionModal?.addEventListener("click", (event) => {
  if (event.target === submissionModal) {
    closeStatusModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && submissionModal?.classList.contains("is-open")) {
    closeStatusModal();
  }
});
