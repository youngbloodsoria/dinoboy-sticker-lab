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

  const normalizeKey = (...parts) => parts
    .filter(Boolean)
    .join(",")
    .toLowerCase()
    .replace(/[^a-z0-9, ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const cityLookup = {
    "anaheim,ca,united states": [33.8366, -117.9143],
    "carlsbad,ca,united states": [33.1581, -117.3506],
    "costa mesa,ca,united states": [33.6411, -117.9187],
    "dana point,ca,united states": [33.4669, -117.6981],
    "huntington beach,ca,united states": [33.6595, -117.9988],
    "irvine,ca,united states": [33.6846, -117.8265],
    "ladera ranch,ca,united states": [33.5709, -117.6356],
    "laguna beach,ca,united states": [33.5427, -117.7854],
    "laguna niguel,ca,united states": [33.5225, -117.7076],
    "los angeles,ca,united states": [34.0522, -118.2437],
    "mission viejo,ca,united states": [33.6000, -117.6720],
    "newport beach,ca,united states": [33.6189, -117.9298],
    "oceanside,ca,united states": [33.1959, -117.3795],
    "orange,ca,united states": [33.7879, -117.8531],
    "phoenix,az,united states": [33.4484, -112.0740],
    "san clemente,ca,united states": [33.4269, -117.6119],
    "san diego,ca,united states": [32.7157, -117.1611],
    "san juan capistrano,ca,united states": [33.5017, -117.6626]
  };

  const stateLookup = {
    ca: [36.7783, -119.4179], az: [34.0489, -111.0937], tx: [31.9686, -99.9018],
    al: [32.3182, -86.9023], ak: [64.2008, -149.4937], ar: [35.2010, -91.8318],
    co: [39.5501, -105.7821], ct: [41.6032, -73.0877], de: [38.9108, -75.5277],
    fl: [27.6648, -81.5158], ga: [32.1656, -82.9001], hi: [19.8968, -155.5828],
    id: [44.0682, -114.7420], il: [40.6331, -89.3985], in: [40.2672, -86.1349],
    ia: [41.8780, -93.0977], ks: [39.0119, -98.4842], ky: [37.8393, -84.2700],
    la: [30.9843, -91.9623], me: [45.2538, -69.4455], md: [39.0458, -76.6413],
    ma: [42.4072, -71.3824], mi: [44.3148, -85.6024], mn: [46.7296, -94.6859],
    ms: [32.3547, -89.3985], mo: [37.9643, -91.8318], mt: [46.8797, -110.3626],
    ne: [41.4925, -99.9018], nv: [38.8026, -116.4194], nh: [43.1939, -71.5724],
    nj: [40.0583, -74.4057], nm: [34.5199, -105.8701], ny: [43.2994, -74.2179],
    nc: [35.7596, -79.0193], nd: [47.5515, -101.0020], oh: [40.4173, -82.9071],
    ok: [35.0078, -97.0929], or: [43.8041, -120.5542], pa: [41.2033, -77.1945],
    ri: [41.5801, -71.4774], sc: [33.8361, -81.1637], sd: [43.9695, -99.9018],
    tn: [35.5175, -86.5804], ut: [39.3210, -111.0937], vt: [44.5588, -72.5778],
    va: [37.4316, -78.6569], wa: [47.7511, -120.7401], wv: [38.5976, -80.4549],
    wi: [44.2685, -89.6165], wy: [42.7560, -107.3025]
  };

  const stateAliases = {
    alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca",
    colorado: "co", connecticut: "ct", delaware: "de", florida: "fl", georgia: "ga",
    hawaii: "hi", idaho: "id", illinois: "il", indiana: "in", iowa: "ia",
    kansas: "ks", kentucky: "ky", louisiana: "la", maine: "me", maryland: "md",
    massachusetts: "ma", michigan: "mi", minnesota: "mn", mississippi: "ms",
    missouri: "mo", montana: "mt", nebraska: "ne", nevada: "nv", newhampshire: "nh",
    "new hampshire": "nh", newjersey: "nj", "new jersey": "nj", newmexico: "nm",
    "new mexico": "nm", newyork: "ny", "new york": "ny", northcarolina: "nc",
    "north carolina": "nc", northdakota: "nd", "north dakota": "nd", ohio: "oh",
    oklahoma: "ok", oregon: "or", pennsylvania: "pa", rhodeisland: "ri",
    "rhode island": "ri", southcarolina: "sc", "south carolina": "sc",
    southdakota: "sd", "south dakota": "sd", tennessee: "tn", texas: "tx",
    utah: "ut", vermont: "vt", virginia: "va", washington: "wa",
    westvirginia: "wv", "west virginia": "wv", wisconsin: "wi", wyoming: "wy"
  };

  const countryLookup = {
    "united states": [39.8283, -98.5795],
    canada: [56.1304, -106.3468],
    mexico: [23.6345, -102.5528],
    australia: [-25.2744, 133.7751],
    "united kingdom": [55.3781, -3.4360],
    england: [52.3555, -1.1743],
    chile: [-35.6751, -71.5430]
  };

  const normalizeStateCode = (stateValue = "") => {
    const compact = stateValue.toLowerCase().replace(/[^a-z]/g, "");
    const spaced = stateValue.toLowerCase().replace(/[^a-z]+/g, " ").trim();
    return stateAliases[compact] || stateAliases[spaced] || compact;
  };

  const geocodeLocation = ({ city, state_region: stateRegion, country }) => {
    const countryValue = country || "United States";
    const stateValue = stateRegion || "";
    const cityStateCountry = normalizeKey(city, stateValue, countryValue);
    const countryKey = normalizeKey(countryValue);
    const stateCode = normalizeStateCode(stateValue);

    if (cityLookup[cityStateCountry]) return cityLookup[cityStateCountry];
    if (stateLookup[stateCode] && countryKey === "united states") return stateLookup[stateCode];
    if (countryLookup[countryKey]) return countryLookup[countryKey];
    return [null, null];
  };

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

    const { data, error } = await client.rpc("admin_list_celebration_guestbook");

    if (error) {
      console.error("Could not load celebration guestbook entries", error);
      setStatus(`Could not load the guest book. Supabase says: ${error.message}`, "error");
      listElement.innerHTML = `<div class="empty">Guest book unavailable.</div>`;
      return;
    }

    entries = data || [];
    loaded = true;
    renderEntries();
  };

  const updateEntry = async (entryId, updates, successMessage) => {
    const { error } = await client.rpc("admin_update_celebration_guestbook", {
      entry_id: entryId,
      guest_name: updates.name,
      guest_email: updates.email,
      guest_city: updates.city,
      guest_state_region: updates.state_region,
      guest_country: updates.country,
      guest_relationship: updates.relationship_to_brighton,
      guest_came_with: updates.came_with,
      guest_memory: updates.memory,
      guest_photo_bucket: updates.photo_bucket,
      guest_photo_path: updates.photo_path,
      guest_photo_original_filename: updates.photo_original_filename,
      guest_subscribed_to_updates: updates.subscribed_to_updates,
      guest_display_publicly: updates.display_publicly,
      guest_is_hidden: updates.is_hidden,
      guest_is_deleted: updates.is_deleted,
      guest_latitude: updates.latitude,
      guest_longitude: updates.longitude,
      guest_location_label: updates.location_label,
      guest_admin_notes: updates.admin_notes
    });

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

    const [latitude, longitude] = geocodeLocation(updates);
    updates.latitude = latitude;
    updates.longitude = longitude;

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
