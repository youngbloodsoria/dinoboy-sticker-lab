(() => {
  const client = window.DinoBoySupabase?.client;
  const accessHelper = window.DinoBoyPrivateAccess;
  const gate = document.querySelector("#guestbookGate");
  const content = document.querySelector("#guestbookContent");
  const form = document.querySelector("#guestbookForm");
  const formStatus = document.querySelector("#guestbookFormStatus");
  const statsPanel = document.querySelector("#celebrationStats");
  const recentMemories = document.querySelector("#recentMemories");
  const allMemoriesModal = document.querySelector("#allMemoriesModal");
  const allMemoriesList = document.querySelector("#allMemoriesList");
  const viewAllMemoriesButton = document.querySelector("#viewAllMemoriesButton");
  const closeMemoriesButton = document.querySelector("#closeMemoriesButton");
  const memoryDetailModal = document.querySelector("#memoryDetailModal");
  const memoryDetailContent = document.querySelector("#memoryDetailContent");
  const closeMemoryDetailButton = document.querySelector("#closeMemoryDetailButton");
  const mapPins = document.querySelector("#guestbookMapPins");
  const mapPopup = document.querySelector("#guestbookMapPopup");
  const copyGuestbookLinkButton = document.querySelector("#copyGuestbookLinkButton");
  const shareGuestbookButton = document.querySelector("#shareGuestbookButton");
  const qrCanvas = document.querySelector("#guestbookQrCanvas");

  let currentAccess = null;
  let memories = [];
  let cyclingTimer = null;
  const celebrationLocation = [33.4617, -117.7056]; // Ocean Institute, Dana Point Harbor.

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character]));

  const setStatus = (message, type = "info") => {
    formStatus.textContent = message;
    formStatus.dataset.type = type;
    formStatus.hidden = false;
  };

  const clearStatus = () => {
    formStatus.textContent = "";
    formStatus.hidden = true;
    formStatus.removeAttribute("data-type");
  };

  const formatRelativeTime = (value) => {
    const date = new Date(value);
    const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (seconds < 60) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    return `${days} day${days === 1 ? "" : "s"} ago`;
  };

  const locationText = (entry) => [
    entry.city,
    entry.state_region,
    entry.country && entry.country !== "United States" ? entry.country : ""
  ].filter(Boolean).join(", ");

  const memoryText = (entry) => entry.memory || "Thank you for being here for Brighton.";

  const memoryPhoto = (entry) => entry.photo_url
    ? `<img class="memory-photo" src="${escapeHtml(entry.photo_url)}" alt="${escapeHtml(entry.photo_original_filename || `${entry.name}'s celebration photo`)}" loading="lazy" />`
    : "";

  const safeFilename = (name = "celebration-photo") => name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "celebration-photo";

  const uploadSelfiePhoto = async (file) => {
    if (!file || !file.size) {
      return null;
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("Please upload an image file for the selfie station photo.");
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new Error("Please keep the selfie station photo under 10MB.");
    }

    const randomId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `celebration/${Date.now()}-${randomId}-${safeFilename(file.name)}`;
    const { error } = await client.storage
      .from("celebration-photos")
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type || "application/octet-stream",
        upsert: false
      });

    if (error) {
      throw new Error(error.message || "The selfie station photo could not upload.");
    }

    return {
      bucket: "celebration-photos",
      path,
      originalFilename: file.name,
      mimeType: file.type,
      fileSize: file.size
    };
  };

  const cityLookup = {
    "anaheim,ca,united states": [33.8366, -117.9143],
    "carlsbad,ca,united states": [33.1581, -117.3506],
    "costa mesa,ca,united states": [33.6411, -117.9187],
    "danapoint,ca,united states": [33.4669, -117.6981],
    "dana point,ca,united states": [33.4669, -117.6981],
    "huntington beach,ca,united states": [33.6595, -117.9988],
    "laguna beach,ca,united states": [33.5427, -117.7854],
    "laguna niguel,ca,united states": [33.5225, -117.7076],
    "mission viejo,ca,united states": [33.6000, -117.6720],
    "newport beach,ca,united states": [33.6189, -117.9298],
    "oceanside,ca,united states": [33.1959, -117.3795],
    "phoenix,az,united states": [33.4484, -112.0740],
    "dallas,tx,united states": [32.7767, -96.7970],
    "irvine,ca,united states": [33.6846, -117.8265],
    "orange,ca,united states": [33.7879, -117.8531],
    "san clemente,ca,united states": [33.4269, -117.6119],
    "san diego,ca,united states": [32.7157, -117.1611],
    "ladera ranch,ca,united states": [33.5709, -117.6356],
    "san juan capistrano,ca,united states": [33.5017, -117.6626],
    "los angeles,ca,united states": [34.0522, -118.2437],
    "new york,ny,united states": [40.7128, -74.0060],
    "chicago,il,united states": [41.8781, -87.6298],
    "denver,co,united states": [39.7392, -104.9903],
    "seattle,wa,united states": [47.6062, -122.3321]
  };

  const stateLookup = {
    al: [32.8067, -86.7911], ak: [61.3707, -152.4044], az: [33.7298, -111.4312],
    ar: [34.9697, -92.3731], ca: [36.1162, -119.6816], co: [39.0598, -105.3111],
    ct: [41.5978, -72.7554], de: [39.3185, -75.5071], fl: [27.7663, -81.6868],
    ga: [33.0406, -83.6431], hi: [21.0943, -157.4983], id: [44.2405, -114.4788],
    il: [40.3495, -88.9861], in: [39.8494, -86.2583], ia: [42.0115, -93.2105],
    ks: [38.5266, -96.7265], ky: [37.6681, -84.6701], la: [31.1695, -91.8678],
    me: [44.6939, -69.3819], md: [39.0639, -76.8021], ma: [42.2302, -71.5301],
    mi: [43.3266, -84.5361], mn: [45.6945, -93.9002], ms: [32.7416, -89.6787],
    mo: [38.4561, -92.2884], mt: [46.9219, -110.4544], ne: [41.1254, -98.2681],
    nv: [38.3135, -117.0554], nh: [43.4525, -71.5639], nj: [40.2989, -74.5210],
    nm: [34.8405, -106.2485], ny: [42.1657, -74.9481], nc: [35.6301, -79.8064],
    nd: [47.5289, -99.7840], oh: [40.3888, -82.7649], ok: [35.5653, -96.9289],
    or: [44.5720, -122.0709], pa: [40.5908, -77.2098], ri: [41.6809, -71.5118],
    sc: [33.8569, -80.9450], sd: [44.2998, -99.4388], tn: [35.7478, -86.6923],
    tx: [31.0545, -97.5635], ut: [40.1500, -111.8624], vt: [44.0459, -72.7107],
    va: [37.7693, -78.1700], wa: [47.4009, -121.4905], wv: [38.4912, -80.9545],
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
    "united kingdom": [55.3781, -3.4360],
    ireland: [53.1424, -7.6921],
    france: [46.2276, 2.2137],
    germany: [51.1657, 10.4515],
    italy: [41.8719, 12.5674],
    spain: [40.4637, -3.7492],
    australia: [-25.2744, 133.7751],
    japan: [36.2048, 138.2529],
    indonesia: [-0.7893, 113.9213]
  };

  const normalizeKey = (...parts) => parts
    .filter(Boolean)
    .join(",")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const normalizeStateCode = (stateValue = "") => {
    const compact = stateValue.toLowerCase().replace(/[^a-z]/g, "");
    const spaced = stateValue.toLowerCase().replace(/[^a-z]+/g, " ").trim();
    return stateAliases[compact] || stateAliases[spaced] || compact;
  };

  const milesBetween = ([lat1, lon1], [lat2, lon2]) => {
    if ([lat1, lon1, lat2, lon2].some((value) => value === null || value === undefined || Number.isNaN(Number(value)))) {
      return 0;
    }

    const radiusMiles = 3958.8;
    const toRadians = (degrees) => Number(degrees) * (Math.PI / 180);
    const deltaLatitude = toRadians(lat2 - lat1);
    const deltaLongitude = toRadians(lon2 - lon1);
    const startLatitude = toRadians(lat1);
    const endLatitude = toRadians(lat2);
    const haversine = Math.sin(deltaLatitude / 2) ** 2
      + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(deltaLongitude / 2) ** 2;

    return radiusMiles * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  };

  const calculateMilesTraveled = () => Math.round(memories.reduce((total, entry) => {
    const [latitude, longitude] = resolvedCoordinates(entry);

    if (latitude === null || longitude === null) {
      return total;
    }

    return total + milesBetween([latitude, longitude], celebrationLocation);
  }, 0));

  const geocodeLocation = ({ city, state_region: stateRegion, country }) => {
    const countryValue = country || "United States";
    const stateValue = stateRegion || "";
    const cityStateCountry = normalizeKey(city, stateValue, countryValue);
    const stateCountry = normalizeKey(stateValue, countryValue);
    const countryKey = normalizeKey(countryValue);
    const stateCode = normalizeStateCode(stateValue);
    const normalizedState = stateAliases[stateCountry.split(",")[0]] || stateCountry.split(",")[0];

    if (cityLookup[cityStateCountry]) return cityLookup[cityStateCountry];
    if (stateLookup[stateCode] && countryKey === "united states") return stateLookup[stateCode];
    if (stateLookup[normalizedState] && countryKey === "united states") return stateLookup[normalizedState];
    if (countryLookup[countryKey]) return countryLookup[countryKey];
    return [null, null];
  };

  const validCoordinate = (value) => value !== null && value !== undefined && !Number.isNaN(Number(value));

  const resolvedCoordinates = (entry) => {
    const [geocodedLatitude, geocodedLongitude] = geocodeLocation(entry);

    if (validCoordinate(geocodedLatitude) && validCoordinate(geocodedLongitude)) {
      return [Number(geocodedLatitude), Number(geocodedLongitude)];
    }

    if (validCoordinate(entry.latitude) && validCoordinate(entry.longitude)) {
      return [Number(entry.latitude), Number(entry.longitude)];
    }

    return [null, null];
  };

  const renderStats = async () => {
    const { data, error } = await client.rpc("celebration_guestbook_stats");
    const stats = Array.isArray(data) ? data[0] : data;

    if (error || !stats) {
      statsPanel.innerHTML = `<div class="celebration-stat"><strong>--</strong><span>Memories Shared</span></div>`;
      return;
    }

    const statCards = [
      ["People Here", stats.people_here || 0],
      ["Countries", stats.countries || 0],
      ["States / Regions", stats.state_regions || 0],
      ["Miles Traveled", calculateMilesTraveled().toLocaleString()],
      ["Memories Shared", stats.memories_shared || 0]
    ];

    statsPanel.innerHTML = statCards.map(([label, value]) => `
      <div class="celebration-stat">
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(label)}</span>
      </div>
    `).join("");
  };

  const renderRecentMemories = () => {
    const recent = memories.slice(0, 4);

    recentMemories.innerHTML = recent.length ? recent.map((entry, index) => `
      <button class="memory-note memory-note-${index + 1}" type="button" data-memory-id="${escapeHtml(entry.id)}">
        ${memoryPhoto(entry)}
        <p>${escapeHtml(memoryText(entry))}</p>
        <strong>-- ${escapeHtml(entry.name)}</strong>
        <span>${escapeHtml(locationText(entry))}</span>
        <small>${escapeHtml(formatRelativeTime(entry.created_at))}</small>
      </button>
    `).join("") : `<div class="empty-paper">Be the first to leave a memory here.</div>`;

    allMemoriesList.innerHTML = memories.length ? memories.map((entry) => `
      <button class="memory-list-item" type="button" data-memory-id="${escapeHtml(entry.id)}">
        <strong>${escapeHtml(entry.name)}</strong>
        <span>${escapeHtml(locationText(entry))} · ${escapeHtml(formatRelativeTime(entry.created_at))}</span>
        ${entry.photo_url ? `<small>Photo shared</small>` : ""}
        <p>${escapeHtml(memoryText(entry))}</p>
      </button>
    `).join("") : `<div class="empty-paper">No memories yet.</div>`;
  };

  const projectPoint = (latitude, longitude) => ({
    x: Math.min(91, Math.max(11, 11 + (((Number(longitude) + 180) / 360) * 80))),
    y: Math.min(84, Math.max(16, 16 + (((90 - Number(latitude)) / 180) * 68)))
  });

  const showMapPopup = (entry, point) => {
    mapPopup.innerHTML = `
      <strong>${escapeHtml(entry.name)}</strong>
      <span>${escapeHtml(locationText(entry))}</span>
      ${entry.came_with ? `<span>With: ${escapeHtml(entry.came_with)}</span>` : ""}
      <p>${escapeHtml(memoryText(entry).length > 120 ? `${memoryText(entry).slice(0, 117)}...` : memoryText(entry))}</p>
      <small>Tap for more</small>
    `;
    mapPopup.style.left = `${point.x}%`;
    mapPopup.style.top = `${point.y}%`;
    mapPopup.hidden = false;
  };

  const openMemoryDetail = (entry) => {
    if (!entry || !memoryDetailModal || !memoryDetailContent) {
      return;
    }

    memoryDetailContent.innerHTML = `
      <article class="memory-detail-card">
        ${memoryPhoto(entry)}
        <strong>${escapeHtml(entry.name)}</strong>
        <span>${escapeHtml(locationText(entry))}</span>
        ${entry.relationship_to_brighton ? `<span>Relationship: ${escapeHtml(entry.relationship_to_brighton)}</span>` : ""}
        ${entry.came_with ? `<span>Came with: ${escapeHtml(entry.came_with)}</span>` : ""}
        <p>${escapeHtml(memoryText(entry))}</p>
        <small>${escapeHtml(formatRelativeTime(entry.created_at))}</small>
      </article>
    `;
    memoryDetailModal.showModal();
  };

  const renderMap = () => {
    const entriesWithLocations = memories
      .map((entry) => ({
        entry,
        coordinates: resolvedCoordinates(entry)
      }))
      .filter(({ coordinates }) => validCoordinate(coordinates[0]) && validCoordinate(coordinates[1]));

    mapPins.innerHTML = entriesWithLocations.map(({ entry, coordinates }, index) => {
      const point = projectPoint(coordinates[0], coordinates[1]);
      return `
        <button class="map-pin" type="button" style="left:${point.x}%;top:${point.y}%;" data-map-index="${index}">
          <span class="sr-only">${escapeHtml(entry.name)} from ${escapeHtml(locationText(entry))}</span>
        </button>
      `;
    }).join("");

    const pins = [...mapPins.querySelectorAll(".map-pin")];
    pins.forEach((pin, index) => {
      const { entry, coordinates } = entriesWithLocations[index];
      const point = projectPoint(coordinates[0], coordinates[1]);
      pin.addEventListener("click", () => openMemoryDetail(entry));
      pin.addEventListener("mouseenter", () => showMapPopup(entry, point));
    });

    window.clearInterval(cyclingTimer);
    if (entriesWithLocations.length) {
      let cycleIndex = 0;
      cyclingTimer = window.setInterval(() => {
        const { entry, coordinates } = entriesWithLocations[cycleIndex % entriesWithLocations.length];
        const point = projectPoint(coordinates[0], coordinates[1]);
        showMapPopup(entry, point);
        cycleIndex += 1;
      }, 4000);
    }
  };

  const loadMemories = async () => {
    const { data, error } = await client
      .from("celebration_guestbook_public")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      console.error("Could not load celebration memories", error);
      recentMemories.innerHTML = `<div class="empty-paper">Memories are temporarily unavailable.</div>`;
      return;
    }

    memories = await hydrateMemoryPhotos(data || []);
    renderRecentMemories();
    renderMap();
    await renderStats();
  };

  const hydrateMemoryPhotos = async (entries) => Promise.all(entries.map(async (entry) => {
    if (!entry.photo_bucket || !entry.photo_path) {
      return entry;
    }

    const { data, error } = await client.storage
      .from(entry.photo_bucket)
      .createSignedUrl(entry.photo_path, 60 * 60);

    if (error || !data?.signedUrl) {
      console.warn("Could not load celebration photo", error);
      return entry;
    }

    return {
      ...entry,
      photo_url: data.signedUrl
    };
  }));

  const currentShareUrl = () => {
    const url = new URL(window.location.href);
    const storedToken = currentAccess?.token || accessHelper?.readStoredAccess()?.token || "";
    if (storedToken) {
      url.searchParams.set("t", storedToken);
    }
    return url.toString();
  };

  const renderQr = () => {
    if (!qrCanvas || !window.QRCode || !currentAccess) {
      return;
    }

    window.QRCode.toCanvas(qrCanvas, currentShareUrl(), {
      width: 156,
      margin: 1,
      color: {
        dark: "#151515",
        light: "#fffaf0"
      }
    });
  };

  const submitGuestbook = async (event) => {
    event.preventDefault();
    clearStatus();

    if (!currentAccess?.token) {
      setStatus("This private guest book link is missing or no longer valid.", "error");
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Adding place...";

    const formData = new FormData(form);
    const country = formData.get("country") || "United States";
    const payloadLocation = {
      city: formData.get("city"),
      state_region: formData.get("state_region"),
      country
    };
    const [latitude, longitude] = geocodeLocation(payloadLocation);

    let uploadedPhoto = null;
    let photoWarning = "";
    try {
      uploadedPhoto = await uploadSelfiePhoto(formData.get("photo"));
    } catch (photoError) {
      console.warn("Selfie station photo upload failed; saving memory without photo.", photoError);
      photoWarning = " Your memory was saved, but the selfie photo did not upload. We can still help add it later.";
    }

    const { data, error } = await client.rpc("submit_celebration_guestbook_v2", {
      raw_token: currentAccess.token,
      guest_name: formData.get("name"),
      guest_email: formData.get("email"),
      guest_city: formData.get("city"),
      guest_state_region: formData.get("state_region"),
      guest_country: country,
      guest_relationship: formData.get("relationship_to_brighton"),
      guest_came_with: formData.get("came_with"),
      guest_memory: formData.get("memory"),
      guest_photo_bucket: uploadedPhoto?.bucket || null,
      guest_photo_path: uploadedPhoto?.path || null,
      guest_photo_original_filename: uploadedPhoto?.originalFilename || null,
      guest_photo_mime_type: uploadedPhoto?.mimeType || null,
      guest_photo_file_size: uploadedPhoto?.fileSize || null,
      guest_subscribe_updates: formData.get("subscribe_updates") === "on",
      guest_display_publicly: formData.get("display_publicly") === "on",
      guest_latitude: latitude,
      guest_longitude: longitude,
      guest_location_label: locationText(payloadLocation),
      guest_user_agent: navigator.userAgent
    });

    submitButton.disabled = false;
    submitButton.textContent = "Add My Memory";

    if (error) {
      console.error("Could not submit celebration memory", error);
      setStatus("Something went wrong while saving your memory. Please try again.", "error");
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (result?.status !== "success") {
      setStatus(result?.message || "We could not save that memory yet.", result?.status === "duplicate" ? "success" : "error");
      return;
    }

    accessHelper.saveAccess(currentAccess);
    form.reset();
    form.querySelector('[name="display_publicly"]').checked = true;
    setStatus(`Your place is here. Thank you for celebrating Brighton.${photoWarning}`, "success");
    await loadMemories();
  };

  const initSharing = () => {
    copyGuestbookLinkButton?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(currentShareUrl());
      copyGuestbookLinkButton.textContent = "Copied";
      window.setTimeout(() => {
        copyGuestbookLinkButton.textContent = "Copy Link";
      }, 1800);
    });

    shareGuestbookButton?.addEventListener("click", async () => {
      const shareData = {
        title: "Brighton's Celebration Guest Book",
        text: "Leave a memory for Brighton.",
        url: currentShareUrl()
      };

      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(shareData.url);
      shareGuestbookButton.textContent = "Link Copied";
      window.setTimeout(() => {
        shareGuestbookButton.textContent = "Share This Page";
      }, 1800);
    });
  };

  const init = async () => {
    if (!client || !accessHelper) {
      gate.hidden = false;
      content.hidden = true;
      return;
    }

    currentAccess = await accessHelper.ensureAccess();
    if (!currentAccess) {
      gate.hidden = false;
      content.hidden = true;
      return;
    }

    gate.hidden = true;
    content.hidden = false;
    form.addEventListener("submit", submitGuestbook);
    viewAllMemoriesButton?.addEventListener("click", () => allMemoriesModal.showModal());
    closeMemoriesButton?.addEventListener("click", () => allMemoriesModal.close());
    closeMemoryDetailButton?.addEventListener("click", () => memoryDetailModal.close());
    recentMemories?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-memory-id]");
      if (!button) return;
      openMemoryDetail(memories.find((entry) => entry.id === button.dataset.memoryId));
    });
    allMemoriesList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-memory-id]");
      if (!button) return;
      openMemoryDetail(memories.find((entry) => entry.id === button.dataset.memoryId));
    });
    initSharing();
    renderQr();
    await loadMemories();
  };

  document.addEventListener("DOMContentLoaded", init);
})();
