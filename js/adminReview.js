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
const statusFilter = document.querySelector("#statusFilter");
const refreshButton = document.querySelector("#refreshButton");
const batchStatus = document.querySelector("#batchStatus");
const batchSelect = document.querySelector("#batchSelect");
const createBatchButton = document.querySelector("#createBatchButton");
const downloadBatchButton = document.querySelector("#downloadBatchButton");
const markBatchSentButton = document.querySelector("#markBatchSentButton");
const submissionsList = document.querySelector("#submissionsList");
const template = document.querySelector("#submissionTemplate");
const uploadBucket = "submission-uploads";
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

const compactAddress = (submission) => [
  submission.shipping_recipient_name,
  submission.shipping_address_1,
  submission.shipping_address_2,
  [submission.shipping_city, submission.shipping_state, submission.shipping_postal_code].filter(Boolean).join(", "),
  submission.shipping_country
].filter(Boolean).join("\n");

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

const csvEscape = (value) => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

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
  card.querySelector('[data-field="shipping"]').textContent = compactAddress(submission) || "Not provided";
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
  setFormValue(form, "producer_quantity", submission.producer_quantity || producerDefaults.quantity);
  setFormValue(form, "producer_size", submission.producer_size || producerDefaults.size);
  setFormValue(form, "producer_edge_text", submission.producer_edge_text || producerDefaults.edgeText);
  setFormValue(form, "producer_finish", submission.producer_finish || producerDefaults.finish);
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
    producer_quantity: getNumberValue(formData, "producer_quantity") || producerDefaults.quantity,
    producer_size: getInputValue(formData, "producer_size") || producerDefaults.size,
    producer_edge_text: getInputValue(formData, "producer_edge_text") || producerDefaults.edgeText,
    producer_finish: getInputValue(formData, "producer_finish") || producerDefaults.finish,
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
  await loadProductionBatches();
};

const loadProductionBatches = async () => {
  if (!batchSelect) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("production_batches")
    .select("id,name,status,created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    setStatus(batchStatus, "Could not load production batches. Confirm the production SQL has been applied.", "error");
    return;
  }

  batchSelect.innerHTML = "";

  if (!data?.length) {
    batchSelect.innerHTML = `<option value="">No batches yet</option>`;
    return;
  }

  for (const batch of data) {
    const option = document.createElement("option");
    option.value = batch.id;
    option.textContent = `${batch.name} (${batch.status})`;
    batchSelect.append(option);
  }
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
  setButtonsBusy([createBatchButton, downloadBatchButton, markBatchSentButton], true);
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

    const readySubmissions = (submissions || []).filter((submission) => submission.approved_sticker_image_url);

    if (!readySubmissions.length) {
      setStatus(batchStatus, "No approved Ready submissions with a final sticker image URL were found.", "error");
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
    await loadSubmissions();
  } catch (error) {
    console.error("Could not create production batch", error);
    setStatus(batchStatus, "Could not create production batch. Check the production SQL and admin permissions.", "error");
  } finally {
    setButtonsBusy([createBatchButton, downloadBatchButton, markBatchSentButton], false);
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

const downloadSelectedBatch = async () => {
  const batchId = batchSelect?.value;

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

    const selectedBatchName = batchSelect.options[batchSelect.selectedIndex]?.textContent || "production-batch";
    const header = [
      "batch_item_id",
      "submission_id",
      "display_name",
      "sticker_title",
      "quantity",
      "sticker_size",
      "cut_type",
      "edge_text",
      "finish_instructions",
      "artwork_url",
      "card_image_url",
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
        item.id,
        item.submission_id,
        item.display_name,
        item.sticker_title,
        item.quantity,
        item.sticker_size,
        "die cut",
        item.edge_text,
        item.finish,
        item.artwork_url,
        item.card_image_url,
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

    const filename = `${selectedBatchName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.csv`;
    downloadCsv(filename, csvRows);
    setStatus(batchStatus, "Printer CSV downloaded.", "success");
  } catch (error) {
    console.error("Could not download production batch", error);
    setStatus(batchStatus, "Could not download this batch.", "error");
  }
};

const markSelectedBatchSent = async () => {
  const batchId = batchSelect?.value;

  if (!batchId) {
    setStatus(batchStatus, "Choose a batch first.", "error");
    return;
  }

  setButtonsBusy([createBatchButton, downloadBatchButton, markBatchSentButton], true);

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
        .update({ producer_status: "sent", producer_sent_at: sentAt })
        .in("id", submissionIds);

      if (submissionError) {
        throw submissionError;
      }
    }

    setStatus(batchStatus, "Batch marked sent to producer.", "success");
    await loadProductionBatches();
    batchSelect.value = batchId;
    await loadSubmissions();
  } catch (error) {
    console.error("Could not mark production batch sent", error);
    setStatus(batchStatus, "Could not mark this batch sent.", "error");
  } finally {
    setButtonsBusy([createBatchButton, downloadBatchButton, markBatchSentButton], false);
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
  } finally {
    loginSubmitButton.disabled = false;
    loginSubmitButton.textContent = "Sign In";
  }
});

signOutButton?.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  showLogin();
});

refreshButton?.addEventListener("click", loadSubmissions);
statusFilter?.addEventListener("change", loadSubmissions);
createBatchButton?.addEventListener("click", createBatchFromReady);
downloadBatchButton?.addEventListener("click", downloadSelectedBatch);
markBatchSentButton?.addEventListener("click", markSelectedBatchSent);

initializeAdmin();
