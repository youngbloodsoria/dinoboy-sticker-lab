(() => {
  const client = window.DinoBoySupabase?.client;
  const accessHelper = window.DinoBoyPrivateAccess;
  const gate = document.querySelector("#memoriesGate");
  const content = document.querySelector("#memoriesContent");
  const unavailable = document.querySelector("#memoriesUnavailable");
  const privateNav = document.querySelector("#memoriesPrivateNav");
  const collage = document.querySelector("#memoriesCollage");
  const hero = document.querySelector(".memories-hero");
  const collageSection = document.querySelector(".collage-section");
  const shareCard = document.querySelector(".celebration-share");
  const memoriesCount = document.querySelector("#memoriesCount");
  const modal = document.querySelector("#memoryModal");
  const modalContent = document.querySelector("#memoryModalContent");
  const closeModalButton = document.querySelector("#closeMemoryModal");
  const privatePageBaseUrl = "https://dinoboysc.com/";

  let currentAccess = null;
  let memories = [];

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character]));

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

  const memoryText = (entry) => entry.memory || "";

  const excerpt = (entry, limit = 180) => {
    const text = memoryText(entry);
    return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
  };

  const hydrateMemoryPhotos = async (entries) => Promise.all(entries.map(async (entry) => {
    if (!entry.photo_bucket || !entry.photo_path) {
      return entry;
    }

    const { data, error } = await client.storage
      .from(entry.photo_bucket)
      .createSignedUrl(entry.photo_path, 60 * 60);

    if (error || !data?.signedUrl) {
      console.warn("Could not load celebration photo for memories collage", error);
      return entry;
    }

    return {
      ...entry,
      photo_url: data.signedUrl
    };
  }));

  const collageClass = (entry, index) => {
    const classes = ["collage-card", `tilt-${(index % 6) + 1}`];
    if (entry.photo_url) classes.push("photo-memory");
    if (!entry.photo_url) classes.push("text-memory");
    if ((memoryText(entry).length > 150 && !entry.photo_url) || index % 5 === 2) classes.push("wide-memory");
    return classes.join(" ");
  };

  const renderCard = (entry, index) => `
    <button class="${collageClass(entry, index)}" type="button" data-memory-id="${escapeHtml(entry.id)}">
      <span class="tape tape-${(index % 4) + 1}"></span>
      ${entry.photo_url ? `
        <img src="${escapeHtml(entry.photo_url)}" alt="${escapeHtml(entry.photo_original_filename || `${entry.name}'s celebration photo`)}" loading="lazy" />
      ` : ""}
      ${entry.memory ? `
        <span class="quote-mark">“</span>
        <p>${escapeHtml(excerpt(entry, entry.photo_url ? 120 : 220))}</p>
      ` : ""}
      <strong>-- ${escapeHtml(entry.name)}</strong>
      <small>${escapeHtml(locationText(entry))}${locationText(entry) ? " · " : ""}${escapeHtml(formatRelativeTime(entry.created_at))}</small>
    </button>
  `;

  const renderCollage = () => {
    const displayMemories = memories.filter((entry) => entry.photo_url || entry.memory);
    memoriesCount.textContent = `${displayMemories.length} shared`;

    collage.innerHTML = displayMemories.length
      ? displayMemories.map(renderCard).join("")
      : `<div class="empty-paper">The collage will begin as guest book photos and memories are shared.</div>`;
  };

  const openMemory = (entry) => {
    if (!entry || !modal || !modalContent) return;

    modalContent.innerHTML = `
      <article class="modal-memory-card">
        ${entry.photo_url ? `
          <img src="${escapeHtml(entry.photo_url)}" alt="${escapeHtml(entry.photo_original_filename || `${entry.name}'s celebration photo`)}" />
        ` : ""}
        <div>
          <h2 id="memoryModalTitle">${escapeHtml(entry.name)}</h2>
          <span>${escapeHtml(locationText(entry))}</span>
          ${entry.came_with ? `<span>Came with: ${escapeHtml(entry.came_with)}</span>` : ""}
          ${entry.memory ? `<p>${escapeHtml(memoryText(entry))}</p>` : ""}
          <small>${escapeHtml(formatRelativeTime(entry.created_at))}</small>
        </div>
      </article>
    `;
    modal.showModal();
  };

  const loadMemories = async () => {
    const { data, error } = await client
      .from("celebration_guestbook_public")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      console.error("Could not load celebration memories collage", error);
      collage.innerHTML = `<div class="empty-paper">Brighton's memories are temporarily unavailable.</div>`;
      memoriesCount.textContent = "Unavailable";
      return;
    }

    memories = await hydrateMemoryPhotos(data || []);
    renderCollage();
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
    connectPrivatePageLinks();
    await updatePlaylistLinks();

    const memoriesEnabled = typeof window.DinoBoySiteSettings?.isBrightonMemoriesEnabled === "function"
      ? await window.DinoBoySiteSettings.isBrightonMemoriesEnabled()
      : true;

    if (memoriesEnabled === false) {
      if (unavailable) unavailable.hidden = false;
      if (hero) hero.hidden = true;
      if (collageSection) collageSection.hidden = true;
      if (shareCard) shareCard.hidden = true;
      return;
    }

    if (unavailable) unavailable.hidden = true;
    if (hero) hero.hidden = false;
    if (collageSection) collageSection.hidden = false;
    if (shareCard) shareCard.hidden = false;

    collage?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-memory-id]");
      if (!card) return;
      openMemory(memories.find((entry) => entry.id === card.dataset.memoryId));
    });
    closeModalButton?.addEventListener("click", () => modal.close());
    await loadMemories();
  };

  document.addEventListener("DOMContentLoaded", init);
})();
