// Private admin review UI for DinoBoy Sticker Lab submissions.
// Access is enforced by Supabase Auth plus RLS policies checking admin_users.

const supabaseClient = window.DinoBoySupabase?.client;
const loginPanel = document.querySelector("#loginPanel");
const adminPanel = document.querySelector("#adminPanel");
const loginForm = document.querySelector("#loginForm");
const loginStatus = document.querySelector("#loginStatus");
const adminStatus = document.querySelector("#adminStatus");
const adminEmail = document.querySelector("#adminEmail");
const signOutButton = document.querySelector("#signOutButton");
const statusFilter = document.querySelector("#statusFilter");
const refreshButton = document.querySelector("#refreshButton");
const submissionsList = document.querySelector("#submissionsList");
const template = document.querySelector("#submissionTemplate");
const uploadBucket = "submission-uploads";
const tiltValues = ["-0.7deg", "0.8deg", "-0.4deg", "0.6deg"];

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

const renderFiles = async (container, files) => {
  container.innerHTML = "";

  if (!files.length) {
    container.innerHTML = `<div class="file-card">No files found</div>`;
    return;
  }

  for (const file of files) {
    const link = document.createElement("a");
    link.className = "file-card";
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

    container.append(link);
  }
};

const setFormValue = (form, name, value) => {
  const input = form.elements[name];
  if (input) {
    input.value = value ?? "";
  }
};

const renderSubmission = async (submission, files, index) => {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".submission-card");
  const form = fragment.querySelector(".review-form");

  card.style.setProperty("--tilt", tiltValues[index % tiltValues.length]);
  card.querySelector('[data-field="title"]').textContent = submission.sticker_title || "Untitled Sticker";
  card.querySelector('[data-field="fighter"]').textContent = `${submission.child_name}, ${submission.child_age || "age not listed"}`;
  card.querySelector('[data-field="diagnosis"]').textContent = valueOrDash(submission.diagnosis);
  card.querySelector('[data-field="message"]').textContent = valueOrDash(submission.sticker_message);
  card.querySelector('[data-field="story"]').textContent = valueOrDash(submission.story);
  card.querySelector('[data-field="guardian"]').textContent = `${submission.parent_guardian_name} · ${submission.parent_guardian_email}${submission.parent_guardian_phone ? ` · ${submission.parent_guardian_phone}` : ""}`;
  card.querySelector('[data-field="created"]').textContent = formatDate(submission.created_at);

  setFormValue(form, "id", submission.id);
  setFormValue(form, "status", submission.status);
  setFormValue(form, "producer_status", submission.producer_status);
  setFormValue(form, "approved_display_name", submission.approved_display_name);
  setFormValue(form, "approved_age", submission.approved_age);
  setFormValue(form, "approved_battle_type", submission.approved_battle_type);
  setFormValue(form, "approved_tagline", submission.approved_tagline);
  setFormValue(form, "approved_story", submission.approved_story);
  setFormValue(form, "admin_notes", submission.admin_notes);
  setFormValue(form, "producer_notes", submission.producer_notes);
  setFormValue(form, "approved_card_image_url", submission.approved_card_image_url);
  setFormValue(form, "approved_sticker_image_url", submission.approved_sticker_image_url);
  setFormValue(form, "producer_tracking_url", submission.producer_tracking_url);

  await renderFiles(card.querySelector('[data-field="files"]'), files);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveReview(form);
  });

  submissionsList.append(fragment);
};

const loadSubmissions = async () => {
  clearStatus(adminStatus);
  submissionsList.innerHTML = `<div class="empty">Loading submissions...</div>`;

  let query = supabaseClient
    .from("sticker_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (statusFilter.value !== "all") {
    query = query.eq("status", statusFilter.value);
  }

  const { data: submissions, error } = await query;

  if (error) {
    submissionsList.innerHTML = "";
    setStatus(adminStatus, "Could not load submissions. Confirm your admin allowlist and RLS SQL were applied.", "error");
    return;
  }

  if (!submissions?.length) {
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

  const payload = {
    status: getInputValue(formData, "status"),
    producer_status: getInputValue(formData, "producer_status"),
    approved_display_name: getInputValue(formData, "approved_display_name"),
    approved_age: getNumberValue(formData, "approved_age"),
    approved_battle_type: getInputValue(formData, "approved_battle_type"),
    approved_tagline: getInputValue(formData, "approved_tagline"),
    approved_story: getInputValue(formData, "approved_story"),
    admin_notes: getInputValue(formData, "admin_notes"),
    producer_notes: getInputValue(formData, "producer_notes"),
    approved_card_image_url: getInputValue(formData, "approved_card_image_url"),
    approved_sticker_image_url: getInputValue(formData, "approved_sticker_image_url"),
    producer_tracking_url: getInputValue(formData, "producer_tracking_url")
  };

  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  const { error } = await supabaseClient
    .from("sticker_submissions")
    .update(payload)
    .eq("id", id);

  submitButton.disabled = false;
  submitButton.textContent = "Save Review";

  if (error) {
    setStatus(adminStatus, "Could not save review changes.", "error");
    return;
  }

  setStatus(adminStatus, "Review saved.", "success");
  await loadSubmissions();
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
};

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!ensureConfigured()) {
    return;
  }

  clearStatus(loginStatus);
  const formData = new FormData(loginForm);
  const email = getInputValue(formData, "email");

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.href.split("#")[0]
    }
  });

  if (error) {
    setStatus(loginStatus, "Could not send the magic link. Check the email and Supabase Auth settings.", "error");
    return;
  }

  setStatus(loginStatus, "Magic link sent. Check your email to sign in.", "success");
});

signOutButton?.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  showLogin();
});

refreshButton?.addEventListener("click", loadSubmissions);
statusFilter?.addEventListener("change", loadSubmissions);

initializeAdmin();
