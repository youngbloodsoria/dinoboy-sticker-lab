// Admin moderation for the private Celebration of Life guest book.
// Raw entries stay private; public pages only read celebration_guestbook_public.

(() => {
  const client = window.DinoBoySupabase?.client;
  const statusElement = document.querySelector("#celebrationStatus");
  const listElement = document.querySelector("#celebrationList");
  const statsElement = document.querySelector("#celebrationStats");
  const searchInput = document.querySelector("#celebrationSearch");
  const statusFilter = document.querySelector("#celebrationStatusFilter");
  const sortSelect = document.querySelector("#celebrationSort");
  const refreshButton = document.querySelector("#refreshCelebrationButton");
  const celebrationTab = document.querySelector('[data-workspace-tab="celebration"]');

  let loaded = false;
  let entries = [];

  if (!statusElement || !listElement) {
    return;
  }

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character]));

  const setStatus = (message, type = "info") => {
    statusElement.textContent = message;
    statusElement.dataset.type = type;
    statusElement.hidden = false;
  };

  const clearStatus = () => {
    statusElement.textContent = "";
    statusElement.removeAttribute("data-type");
    statusElement.hidden = true;
  };

  const formatDate = (value) => value
    ? new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value))
    : "Unknown date";

  const locationText = (entry) => [
    entry.city,
    entry.state_region,
    entry.country
  ].filter(Boolean).join(", ");

  const entryStatus = (entry) => {
    if (entry.is_deleted) return "deleted";
    if (entry.is_hidden) return "hidden";
    if (!entry.display_publicly) return "private";
    return "public";
  };

  const renderStats = () => {
    const total = entries.length;
    const publicCount = entries.filter((entry) => entryStatus(entry) === "public").length;
    const hiddenCount = entries.filter((entry) => entry.is_hidden).length;
    const deletedCount = entries.filter((entry) => entry.is_deleted).length;

    statsElement.innerHTML = [
      ["Total", total],
      ["Public", publicCount],
      ["Hidden", hiddenCount],
      ["Deleted", deletedCount]
    ].map(([label, value]) => `
      <div class="comment-stat">
        <strong>${value}</strong>
        <span>${escapeHtml(label)}</span>
      </div>
    `).join("");
  };

  const filteredEntries = () => {
    const mode = statusFilter.value || "active";
    const searchTerm = searchInput.value.trim().toLowerCase();

    const filtered = entries.filter((entry) => {
      const status = entryStatus(entry);
      const modeMatches = (
        mode === "all"
        || (mode === "active" && status !== "hidden" && status !== "deleted")
        || mode === status
      );

      if (!modeMatches) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      return [
        entry.name,
        entry.email,
        entry.city,
        entry.state_region,
        entry.country,
        entry.relationship_to_brighton,
        entry.came_with,
        entry.memory,
        entry.photo_path,
        entry.photo_original_filename,
        entry.admin_notes
      ].some((value) => String(value || "").toLowerCase().includes(searchTerm));
    });

    const sortMode = sortSelect.value || "newest";
    return filtered.sort((a, b) => {
      if (sortMode === "oldest") return new Date(a.created_at) - new Date(b.created_at);
      if (sortMode === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sortMode === "location") return locationText(a).localeCompare(locationText(b));
      return new Date(b.created_at) - new Date(a.created_at);
    });
  };

  const actionButtons = (entry) => {
    const actions = [];

    if (!entry.is_deleted) {
      if (entry.photo_path) {
        actions.push(`<button class="mini-button" type="button" data-celebration-action="open-photo" data-entry-id="${escapeHtml(entry.id)}">Open Photo</button>`);
      }
      actions.push(entry.is_hidden
        ? `<button class="mini-button" type="button" data-celebration-action="unhide" data-entry-id="${escapeHtml(entry.id)}">Unhide</button>`
        : `<button class="mini-button secondary" type="button" data-celebration-action="hide" data-entry-id="${escapeHtml(entry.id)}">Hide</button>`);
      actions.push(`<button class="mini-button secondary" type="button" data-celebration-action="delete" data-entry-id="${escapeHtml(entry.id)}">Soft Delete</button>`);
    } else {
      actions.push(`<button class="mini-button" type="button" data-celebration-action="restore" data-entry-id="${escapeHtml(entry.id)}">Restore</button>`);
    }

    return actions.join("");
  };

  const renderEntries = () => {
    renderStats();
    const visibleEntries = filteredEntries();

    if (!visibleEntries.length) {
      listElement.innerHTML = `<div class="empty">No guest book memories in this view.</div>`;
      return;
    }

    listElement.innerHTML = visibleEntries.map((entry) => `
      <article class="comment-card" data-status="${escapeHtml(entryStatus(entry))}">
        <div>
          <strong>${escapeHtml(entry.name)}</strong>
          <span>${escapeHtml(locationText(entry))}</span>
          <small>${escapeHtml(entry.email)}</small>
          <small>${escapeHtml(formatDate(entry.created_at))}</small>
          <small>Status: ${escapeHtml(entryStatus(entry))}</small>
        </div>
        <div>
          <p class="comment-text">${escapeHtml(entry.memory || "No written memory added.")}</p>
          ${entry.photo_path ? `
            <div class="guestbook-photo-meta">
              <strong>Selfie Station Photo</strong>
              <span>${escapeHtml(entry.photo_original_filename || entry.photo_path)}</span>
            </div>
          ` : ""}
          <details class="admin-details">
            <summary>Edit details</summary>
            <form class="celebration-edit" data-celebration-edit="${escapeHtml(entry.id)}">
              <div class="field">
                <label>Name</label>
                <input name="name" type="text" value="${escapeHtml(entry.name)}" required />
              </div>
              <div class="field">
                <label>Email</label>
                <input name="email" type="email" value="${escapeHtml(entry.email)}" required />
              </div>
              <div class="field">
                <label>City</label>
                <input name="city" type="text" value="${escapeHtml(entry.city)}" required />
              </div>
              <div class="field">
                <label>State / Region</label>
                <input name="state_region" type="text" value="${escapeHtml(entry.state_region || "")}" />
              </div>
              <div class="field">
                <label>Country</label>
                <input name="country" type="text" value="${escapeHtml(entry.country || "United States")}" required />
              </div>
              <div class="field">
                <label>Relationship</label>
                <input name="relationship_to_brighton" type="text" value="${escapeHtml(entry.relationship_to_brighton || "")}" />
              </div>
              <div class="field">
                <label>Came With</label>
                <input name="came_with" type="text" value="${escapeHtml(entry.came_with || "")}" />
              </div>
              <div class="field">
                <label>Moderation Status</label>
                <select name="moderation_status">
                  <option value="public" ${entryStatus(entry) === "public" ? "selected" : ""}>Public</option>
                  <option value="private" ${entryStatus(entry) === "private" ? "selected" : ""}>Private / Not Displayed</option>
                  <option value="hidden" ${entryStatus(entry) === "hidden" ? "selected" : ""}>Hidden</option>
                  <option value="deleted" ${entryStatus(entry) === "deleted" ? "selected" : ""}>Soft Deleted</option>
                </select>
              </div>
              <div class="field">
                <label>Location Label</label>
                <input name="location_label" type="text" value="${escapeHtml(entry.location_label || locationText(entry))}" />
              </div>
              <div class="field full">
                <label>Memory</label>
                <textarea name="memory">${escapeHtml(entry.memory || "")}</textarea>
              </div>
              <div class="field">
                <label>Photo Bucket</label>
                <input name="photo_bucket" type="text" value="${escapeHtml(entry.photo_bucket || "")}" />
              </div>
              <div class="field">
                <label>Photo Path</label>
                <input name="photo_path" type="text" value="${escapeHtml(entry.photo_path || "")}" />
              </div>
              <div class="field">
                <label>Photo Filename</label>
                <input name="photo_original_filename" type="text" value="${escapeHtml(entry.photo_original_filename || "")}" />
              </div>
              <div class="field full">
                <label>Admin Notes</label>
                <textarea name="admin_notes">${escapeHtml(entry.admin_notes || "")}</textarea>
              </div>
              <label class="check-field full">
                <input name="subscribed_to_updates" type="checkbox" ${entry.subscribed_to_updates ? "checked" : ""} />
                <span>This guest opted in to DinoBoy updates</span>
              </label>
              <label class="check-field full">
                <input name="display_publicly" type="checkbox" ${entry.display_publicly ? "checked" : ""} />
                <span>Display this memory publicly on the guest book</span>
              </label>
              <button class="mini-button full" type="submit">Save Changes</button>
            </form>
          </details>
        </div>
        <div class="comment-actions">
          ${actionButtons(entry)}
        </div>
      </article>
    `).join("");
  };

  const loadEntries = async () => {
    clearStatus();

    if (!client) {
      setStatus("Supabase is not configured.", "error");
      return;
    }

    listElement.innerHTML = `<div class="empty">Loading guest book memories...</div>`;

    const { data, error } = await client
      .from("celebration_guestbook")
      .select("id,created_at,name,email,city,state_region,country,relationship_to_brighton,came_with,memory,photo_bucket,photo_path,photo_original_filename,photo_mime_type,photo_file_size,subscribed_to_updates,display_publicly,is_hidden,is_deleted,latitude,longitude,location_label,admin_notes")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Could not load celebration guestbook entries", error);
      setStatus("Could not load the guest book. Make sure supabase/celebration_guestbook.sql has been run.", "error");
      listElement.innerHTML = `<div class="empty">Guest book unavailable.</div>`;
      return;
    }

    entries = data || [];
    loaded = true;
    renderEntries();
  };

  const updateEntry = async (entryId, updates, successMessage) => {
    const { error } = await client
      .from("celebration_guestbook")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", entryId);

    if (error) {
      console.error("Could not update guestbook entry", error);
      setStatus(`Could not update that memory. Supabase says: ${error.message}`, "error");
      return;
    }

    entries = entries.map((entry) => (
      entry.id === entryId ? { ...entry, ...updates } : entry
    ));
    setStatus(successMessage, "success");
    renderEntries();
  };

  listElement.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-celebration-action]");
    if (!button) {
      return;
    }

    const entryId = button.dataset.entryId;
    const action = button.dataset.celebrationAction;
    button.disabled = true;

    if (action === "hide") await updateEntry(entryId, { is_hidden: true }, "Memory hidden.");
    if (action === "unhide") await updateEntry(entryId, { is_hidden: false }, "Memory restored to public/private view.");
    if (action === "delete") await updateEntry(entryId, { is_deleted: true, is_hidden: true }, "Memory soft deleted.");
    if (action === "restore") await updateEntry(entryId, { is_deleted: false, is_hidden: false }, "Memory restored.");
    if (action === "open-photo") {
      const entry = entries.find((item) => item.id === entryId);
      if (!entry?.photo_bucket || !entry?.photo_path) {
        setStatus("This entry does not have a selfie station photo.", "error");
        button.disabled = false;
        return;
      }
      const { data, error } = await client.storage
        .from(entry.photo_bucket)
        .createSignedUrl(entry.photo_path, 60 * 10);

      if (error || !data?.signedUrl) {
        console.error("Could not open celebration photo", error);
        setStatus("Could not open that photo. Make sure the latest celebration_guestbook.sql storage policies have been run.", "error");
        button.disabled = false;
        return;
      }

      window.open(data.signedUrl, "_blank", "noopener");
      button.disabled = false;
    }
  });

  listElement.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-celebration-edit]");
    if (!form) {
      return;
    }

    event.preventDefault();
    const formData = new FormData(form);
    const entryId = form.dataset.celebrationEdit;
    const moderationStatus = String(formData.get("moderation_status") || "public");
    const updates = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      city: String(formData.get("city") || "").trim(),
      state_region: String(formData.get("state_region") || "").trim() || null,
      country: String(formData.get("country") || "United States").trim(),
      relationship_to_brighton: String(formData.get("relationship_to_brighton") || "").trim() || null,
      came_with: String(formData.get("came_with") || "").trim() || null,
      memory: String(formData.get("memory") || "").trim(),
      photo_bucket: String(formData.get("photo_bucket") || "").trim() || null,
      photo_path: String(formData.get("photo_path") || "").trim() || null,
      photo_original_filename: String(formData.get("photo_original_filename") || "").trim() || null,
      subscribed_to_updates: formData.get("subscribed_to_updates") === "on",
      admin_notes: String(formData.get("admin_notes") || "").trim() || null,
      location_label: String(formData.get("location_label") || "").trim() || null,
      display_publicly: moderationStatus === "public" && formData.get("display_publicly") === "on",
      is_hidden: moderationStatus === "hidden" || moderationStatus === "deleted",
      is_deleted: moderationStatus === "deleted"
    };

    if (!updates.name || !updates.email || !updates.city || !updates.country) {
      setStatus("Name, email, city, and country are required.", "error");
      return;
    }

    await updateEntry(entryId, updates, "Guest book memory updated.");
  });

  celebrationTab?.addEventListener("click", async () => {
    await loadEntries();
  });

  refreshButton?.addEventListener("click", loadEntries);
  searchInput?.addEventListener("input", renderEntries);
  statusFilter?.addEventListener("change", renderEntries);
  sortSelect?.addEventListener("change", renderEntries);

  window.addEventListener("dinoboy:admin-ready", async () => {
    if (celebrationTab?.getAttribute("aria-selected") === "true" || loaded) {
      await loadEntries();
    }
  });
})();
