// Handles DinoBoy Sticker Lab form submissions.
// This creates a private review record, uploads drawing photos to Supabase
// Storage, and records file metadata. Nothing is published automatically.

const form = document.querySelector("#submission-form");
const submitButton = form?.querySelector("[type='submit']");
const statusMessage = document.querySelector("#submission-status");
const uploadBucket = "submission-uploads";

const setStatus = (message, type = "info") => {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.dataset.type = type;
  statusMessage.hidden = false;
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
  consent_parent: formData.get("guardian_consent") === "on",
  consent_review: formData.get("review_consent") === "on",
  consent_publish: formData.get("publish_consent") === "on",
  status: "new",
  producer_status: "not_ready"
});

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
      throw insertError;
    }

    setStatus("Uploading drawing photos...", "info");
    await uploadSubmissionFiles(supabaseClient, submissionId, files);

    form.reset();
    setStatus(
      "Your roar was submitted! We will review it before anything appears on the site.",
      "success"
    );
  } catch (error) {
    console.error("Submission failed", error);
    setStatus(
      "Something went wrong while sending your submission. Please try again or contact us if it keeps happening.",
      "error"
    );
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = submitButton.dataset.originalHtml || "Submit Your Roar";
  }
});
