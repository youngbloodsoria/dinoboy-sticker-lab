(() => {
  const client = window.DinoBoySupabase?.client;
  const accessHelper = window.DinoBoyPrivateAccess;
  const gate = document.querySelector("#guestbookGate");
  const unavailable = document.querySelector("#guestbookUnavailable");
  const content = document.querySelector("#guestbookContent");
  const form = document.querySelector("#guestbookForm");
  const formStatus = document.querySelector("#guestbookFormStatus");
  const statsPanel = document.querySelector("#celebrationStats");
  const recentMemories = document.querySelector("#recentMemories");
  const allMemoriesModal = document.querySelector("#allMemoriesModal");
  const allMemoriesList = document.querySelector("#allMemoriesList");
  const returningGuest = document.querySelector("#returningGuest");
  const formCard = document.querySelector("#add-memory");
  let checkedInGuest = null;
  let loadingMemories = false;
  let pendingBatch = null;
  let submitting = false;
  const closeMemoriesButton = document.querySelector("#closeMemoriesButton");
  const memoryDetailModal = document.querySelector("#memoryDetailModal");
  const memoryDetailContent = document.querySelector("#memoryDetailContent");
  const closeMemoryDetailButton = document.querySelector("#closeMemoryDetailButton");
  const mapPins = document.querySelector("#guestbookMapPins");
  const mapPopup = document.querySelector("#guestbookMapPopup");
  const copyGuestbookLinkButton = document.querySelector("#copyGuestbookLinkButton");
  const shareGuestbookButton = document.querySelector("#shareGuestbookButton");
  const qrCanvas = document.querySelector("#guestbookQrCanvas");
  const privateNav = document.querySelector("#guestbookPrivateNav");
  const privatePageBaseUrl = window.location.origin + "/";

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

  const connectPrivatePageLinks = () => {
    const token = currentAccess?.token || accessHelper?.tokenFromUrl?.() || accessHelper?.readStoredAccess?.()?.token || "";
    if (!token) return;

    document.querySelectorAll("[data-private-page-link]").forEach((link) => {
      const url = new URL(link.getAttribute("href"), privatePageBaseUrl);
      url.searchParams.set("t", token);
      link.href = url.toString();
    });

    if (privateNav) {
      privateNav.hidden = false;
    }
  };

  const updatePlaylistLinks = async () => {
    await window.DinoBoySiteSettings?.applyCelebrationPageLinks?.();
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

  const memoryPhoto = (entry) => entry.photo_url && entry.photo_mime_type?.startsWith("video/")
    ? `<a class="button" href="${escapeHtml(entry.photo_url)}" target="_blank" rel="noopener">Open Celebration Video</a>`
    : entry.photo_url
    ? `<img class="memory-photo" src="${escapeHtml(entry.photo_url)}" alt="${escapeHtml(entry.photo_original_filename || `${entry.name}'s celebration photo`)}" loading="lazy" />`
    : entry.photo_path
      ? `<div class="memory-photo-pending">Photo shared. Loading soon.</div>`
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

    const video = file.type.startsWith("video/");
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "video/mp4", "video/webm", "video/quicktime"];
    if (!allowed.includes(file.type) || file.size > (video ? 50 : 10) * 1024 * 1024) {
      throw new Error("Use JPG, PNG, WebP, HEIC/HEIF photos up to 10 MB, or MP4, WebM, MOV videos up to 50 MB.");
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
    "austin,tx,united states": [30.2672, -97.7431],
    "london,united kingdom": [51.5074, -0.1278],
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

  const calculateMilesTraveled = () => {
    const countedGuests = new Set();
    return Math.round(memories.reduce((total, entry) => {
    const key = normalizeKey(entry.name, entry.city, entry.state_region, entry.country);
    if (countedGuests.has(key)) return total;
    countedGuests.add(key);
    const [latitude, longitude] = resolvedCoordinates(entry);

    if (latitude === null || longitude === null) {
      return total;
    }

    return total + milesBetween([latitude, longitude], celebrationLocation);
  }, 0));
  };

  const geocodeLocation = ({ city, state_region: stateRegion, country }) => {
    const countryValue = /^(uk|u\.k\.|england)$/i.test(country || "") ? "United Kingdom" : country || "United States";
    const stateValue = countryValue.toLowerCase() === "united states" ? normalizeStateCode(stateRegion || "") : stateRegion || "";
    const cityStateCountry = normalizeKey(city, stateValue, countryValue);
    const stateCountry = normalizeKey(stateValue, countryValue);
    const countryKey = normalizeKey(countryValue);
    const stateCode = normalizeStateCode(stateValue);
    const normalizedState = stateAliases[stateCountry.split(",")[0]] || stateCountry.split(",")[0];

    if (cityLookup[cityStateCountry]) return cityLookup[cityStateCountry];
    if (cityLookup[normalizeKey(city, countryValue)]) return cityLookup[normalizeKey(city, countryValue)];
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
        ${entry.photo_mime_type?.startsWith("video/") ? "<span>Celebration video · Tap to open</span>" : memoryPhoto(entry)}
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
    mapPopup.dataset.memoryId = entry.id;
    mapPopup.setAttribute("role", "button");
    mapPopup.setAttribute("tabindex", "0");
    mapPopup.setAttribute("aria-label", `Open ${entry.name}'s memory`);
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
    const map = document.querySelector("#guestbookMap");
    const left = Math.max(4, Math.min(map.clientWidth - mapPopup.offsetWidth - 4, map.clientWidth * point.x / 100 + 12));
    const top = Math.max(4, Math.min(map.clientHeight - mapPopup.offsetHeight - 4, map.clientHeight * point.y / 100 - mapPopup.offsetHeight / 2));
    mapPopup.style.left = `${left}px`;
    mapPopup.style.top = `${top}px`;
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
    memoryDetailModal.dataset.memoryId = entry.id;
    memoryDetailModal.showModal();
  };

  const renderMap = () => {
    // Only the persisted display coordinates position pins. Normalized coordinates
    // remain available for geographic statistics, never used as precise pin fallbacks.
    const entriesWithLocations = memories
      .filter((entry) => validCoordinate(entry.display_latitude) && validCoordinate(entry.display_longitude))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((entry) => ({ entry, point: projectPoint(entry.display_latitude, entry.display_longitude) }));
    const map = document.querySelector("#guestbookMap");
    const groups = [];
    // Combine nearby targets at the current screen size instead of stacking untappable dots.
    for (const item of entriesWithLocations) {
      const group = groups.find((group) => Math.hypot(
        (group.point.x - item.point.x) * map.clientWidth / 100,
        (group.point.y - item.point.y) * map.clientHeight / 100
      ) < 48);
      if (group) group.items.push(item);
      else groups.push({ point: item.point, items: [item] });
    }
    mapPins.innerHTML = groups.map((group, index) => `
      <button class="map-pin ${group.items.length > 1 ? "map-pin-group" : ""}" type="button"
        style="left:${group.point.x}%;top:${group.point.y}%;" data-map-index="${index}">
        ${group.items.length > 1 ? `<span aria-hidden="true">${group.items.length}</span>` : ""}
        <span class="sr-only">${group.items.length > 1 ? `${group.items.length} memories from this area` : `${escapeHtml(group.items[0].entry.name)} from ${escapeHtml(locationText(group.items[0].entry))}`}</span>
      </button>
    `).join("");
    mapPins.querySelectorAll(".map-pin").forEach((pin, index) => {
      const group = groups[index];
      pin.addEventListener("click", () => {
        if (group.items.length === 1) return openMemoryDetail(group.items[0].entry);
        allMemoriesList.innerHTML = group.items.map(({ entry }) => `
          <button class="memory-list-item" type="button" data-memory-id="${escapeHtml(entry.id)}">
            <strong>${escapeHtml(entry.name)}</strong><span>${escapeHtml(locationText(entry))}</span>
            <p>${escapeHtml(memoryText(entry))}</p>
          </button>`).join("");
        allMemoriesModal.showModal();
      });
      pin.addEventListener("mouseenter", () => showMapPopup(group.items[0].entry, group.point));
      pin.addEventListener("focus", () => showMapPopup(group.items[0].entry, group.point));
    });
    window.clearInterval(cyclingTimer);
    mapPopup.hidden = true;
    if (entriesWithLocations.length) {
      let cycleIndex = 0;
      cyclingTimer = window.setInterval(() => {
        if (document.hidden || allMemoriesModal.open || memoryDetailModal.open || map.matches(":hover") || map.contains(document.activeElement)) return;
        const { entry, point } = entriesWithLocations[cycleIndex % entriesWithLocations.length];
        showMapPopup(entry, point);
        cycleIndex += 1;
      }, 4000);
    }
  };

  const loadMemories = async () => {
    if (loadingMemories) return;
    loadingMemories = true;
    try {
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
    if (memoryDetailModal.open && !memories.some((entry) => entry.id === memoryDetailModal.dataset.memoryId)) memoryDetailModal.close();
    if (allMemoriesModal.open) allMemoriesModal.close();
    } catch (error) { console.warn("Could not refresh guest book", error); }
    finally { loadingMemories = false; }
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
      return {
        ...entry,
        photo_error: true
      };
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
    if (submitting) return;
    clearStatus();
    if (!currentAccess?.token) return setStatus("Please reopen your private invitation link.", "error");
    const formData = new FormData(form);
    if (!pendingBatch && ["name", "email", "city"].some((key) => !String(formData.get(key) || "").trim())) {
      return setStatus("Please add your name, email, and city.", "error");
    }
    const files = formData.getAll("photo").filter((file) => file?.size);
    if (files.length > 10) return setStatus("Please choose up to 10 photos or videos at a time.", "error");
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "video/mp4", "video/webm", "video/quicktime"];
    if (files.some((file) => !allowed.includes(file.type) || file.size > (file.type.startsWith("video/") ? 50 : 10) * 1024 * 1024)) {
      return setStatus("Use photos up to 10 MB or MP4, WebM, MOV videos up to 50 MB.", "error");
    }
    const profile = Object.fromEntries(formData.entries());
    const payloadLocation = { city: profile.city, state_region: profile.state_region, country: profile.country || "United States" };
    const [latitude, longitude] = geocodeLocation(payloadLocation);
    // Freeze the batch until confirmed, retaining upload paths across network retries.
    if (!pendingBatch) pendingBatch = {
      profile, payloadLocation, latitude, longitude,
      items: (files.length ? files : [null]).map((file) => ({ file, uploaded: null, saved: false }))
    };
    const batch = pendingBatch;
    const submitButton = form.querySelector('button[type="submit"]');
    submitting = true;
    form.querySelectorAll("input, textarea, select, button").forEach((input) => { input.disabled = true; });
    try {
      for (let index = 0; index < batch.items.length; index++) {
        const item = batch.items[index];
        if (item.saved) continue;
        setStatus(`Saving ${index + 1} of ${batch.items.length}…`);
        if (item.file && !item.uploaded) item.uploaded = await uploadSelfiePhoto(item.file);
        const p = batch.profile;
        const { data, error } = await client.rpc("submit_celebration_guestbook_v2", {
          raw_token: currentAccess.token,
          guest_name: p.name, guest_email: p.email,
          guest_city: p.city, guest_state_region: p.state_region, guest_country: batch.payloadLocation.country,
          guest_relationship: p.relationship_to_brighton, guest_came_with: p.came_with,
          guest_memory: index === 0 ? p.memory : "",
          guest_photo_bucket: item.uploaded?.bucket || null, guest_photo_path: item.uploaded?.path || null,
          guest_photo_original_filename: item.uploaded?.originalFilename || null,
          guest_photo_mime_type: item.uploaded?.mimeType || null, guest_photo_file_size: item.uploaded?.fileSize || null,
          guest_subscribe_updates: index === 0 && p.subscribe_updates === "on",
          guest_display_publicly: p.display_publicly === "on",
          guest_latitude: batch.latitude, guest_longitude: batch.longitude,
          guest_location_label: locationText(batch.payloadLocation), guest_user_agent: navigator.userAgent
        });
        if (error) throw new Error(error.message || "Please check your connection.");
        const result = Array.isArray(data) ? data[0] : data;
        if (!["success", "duplicate"].includes(result?.status)) throw new Error(result?.message || "Could not save this item.");
        item.saved = true;
      }
      const savedProfile = batch.profile;
      if (savedProfile.remember_guest === "on") accessHelper.rememberGuest(currentAccess, savedProfile);
      else accessHelper.forgetGuest();
      checkedInGuest = savedProfile;
      const hasMedia = batch.items.some((item) => item.file);
      pendingBatch = null;
      form.reset();
      showReturningGuest();
      const resultNote = document.querySelector("#guestbookResult");
      resultNote.textContent = `Thank you! Your place is in the book.${hasMedia ? " Your photos and videos are saved for admin approval." : ""}${savedProfile.memory && savedProfile.display_publicly === "on" ? " Your memory is now on Memories." : ""}`;
      resultNote.hidden = false;
      clearStatus();
      await loadMemories();
    } catch (error) {
      const saved = batch.items.filter((item) => item.saved).length;
      setStatus(`${error.message} ${saved ? `${saved} of ${batch.items.length} items saved. ` : ""}Your details and files are kept here. Press Retry to finish this submission.`, "error");
    } finally {
      submitting = false;
      // An uncertain response must be retried with identical details and upload paths.
      form.querySelectorAll("input, textarea, select, button").forEach((input) => { input.disabled = Boolean(pendingBatch); });
      document.querySelector("#differentGuest").disabled = Boolean(pendingBatch);
      submitButton.disabled = false;
      submitButton.textContent = pendingBatch ? "Retry Submission" : "Add My Memory";
    }
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

  const showReturningGuest = () => {
    returningGuest.hidden = !checkedInGuest;
    formCard.hidden = Boolean(checkedInGuest);
    if (!checkedInGuest) return;
    form.elements.namedItem("remember_guest").checked = Boolean(accessHelper.readCheckedInGuest(currentAccess));
    for (const key of ["name", "email", "city", "state_region", "country", "relationship_to_brighton", "came_with"]) {
      const input = form.elements.namedItem(key);
      if (input) input.value = checkedInGuest[key] || "";
    }
  };

  const openAdditionalMemory = () => {
    formCard.hidden = false;
    document.querySelector("#guestbookResult").hidden = true;
    document.querySelector("#form-title").textContent = checkedInGuest ? "Add Photos, Videos or a Memory" : "Leave Your Place Here";
    formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelector(checkedInGuest ? "#guest-memory" : "#guest-name").focus({ preventScroll: true });
  };

  const init = async () => {
    if (!client || !accessHelper) {
      gate.hidden = false;
      if (unavailable) unavailable.hidden = true;
      content.hidden = true;
      return;
    }

    currentAccess = await accessHelper.ensureAccess();
    if (!currentAccess) {
      gate.hidden = false;
      if (unavailable) unavailable.hidden = true;
      content.hidden = true;
      return;
    }

    const guestbookEnabled = typeof window.DinoBoySiteSettings?.isCelebrationGuestbookEnabled === "function"
      ? await window.DinoBoySiteSettings.isCelebrationGuestbookEnabled()
      : true;

    if (guestbookEnabled === false) {
      gate.hidden = true;
      if (unavailable) unavailable.hidden = false;
      content.hidden = true;
      return;
    }

    gate.hidden = true;
    if (unavailable) unavailable.hidden = true;
    content.hidden = false;
    connectPrivatePageLinks();
    await updatePlaylistLinks();
    form.addEventListener("submit", submitGuestbook);
    checkedInGuest = accessHelper.readCheckedInGuest(currentAccess);
    showReturningGuest();
    if (window.location.hash === "#add-memory") openAdditionalMemory();
    document.querySelector("#addAnotherMemory").addEventListener("click", () => openAdditionalMemory());
    document.querySelector("#differentGuest").addEventListener("click", () => {
      accessHelper.forgetGuest();
      checkedInGuest = null;
      form.reset();
      clearStatus();
      showReturningGuest();
      openAdditionalMemory();
    });
    closeMemoriesButton?.addEventListener("click", () => allMemoriesModal.close());
    closeMemoryDetailButton?.addEventListener("click", () => memoryDetailModal.close());
    mapPopup?.addEventListener("click", () => {
      if (!mapPopup.dataset.memoryId) return;
      openMemoryDetail(memories.find((entry) => entry.id === mapPopup.dataset.memoryId));
    });
    mapPopup?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!mapPopup.dataset.memoryId) return;
      openMemoryDetail(memories.find((entry) => entry.id === mapPopup.dataset.memoryId));
    });
    recentMemories?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-memory-id]");
      if (!button) return;
      openMemoryDetail(memories.find((entry) => entry.id === button.dataset.memoryId));
    });
    allMemoriesList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-memory-id]");
      if (!button) return;
      allMemoriesModal.close();
      openMemoryDetail(memories.find((entry) => entry.id === button.dataset.memoryId));
    });
    initSharing();
    renderQr();
    await loadMemories();
    window.setInterval(() => { if (!document.hidden) loadMemories(); }, 30000);
    window.addEventListener("focus", loadMemories);
    let resizeTimer;
    window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderMap, 150); });
  };

  document.addEventListener("DOMContentLoaded", init);
})();
