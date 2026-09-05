(() => {
  const playlistGate = document.querySelector("#playlistGate");
  const playlistExperience = document.querySelector("#playlistExperience");
  const playlistUnavailable = document.querySelector("#playlistUnavailable");
  const playerSlot = document.querySelector("#appleMusicPlayer");
  const openAppleMusic = document.querySelector("#openAppleMusic");
  const sharePlaylistButton = document.querySelector("#sharePlaylist");
  const trackListSection = document.querySelector("#trackListSection");
  const playlistTracks = document.querySelector("#playlistTracks");
  const providerLinks = document.querySelector("#providerLinks");
  const providerLinkList = document.querySelector("#providerLinkList");
  const privateNav = document.querySelector("#playlistPrivateNav");
  const accessHelper = window.DinoBoyPrivateAccess;
  const privatePageBaseUrl = "https://dinoboysc.com/";
  const providerLabels = {
    appleMusic: "Apple Music",
    spotify: "Spotify",
    youtubeMusic: "YouTube Music",
    amazonMusic: "Amazon Music"
  };

  let playlistData = null;
  let currentAccess = null;

  const track = (name, data = {}) => {
    if (typeof window.va === "function") {
      window.va("event", name, data);
    }
  };

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

  const currentPrivateUrl = () => {
    const token = currentAccess?.token || accessHelper?.tokenFromUrl?.() || accessHelper?.readStoredAccess?.()?.token || "";
    const url = new URL("/playlist", privatePageBaseUrl);
    if (token) {
      url.searchParams.set("t", token);
    }
    return url.toString();
  };

  const loadPlaylistData = async () => {
    const response = await fetch("data/brighton-playlist.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load Brighton's Playlist data.");
    }
    playlistData = await response.json();
  };

  const loadApplePlayer = () => {
    if (!playlistData?.embedUrl || !playerSlot || playerSlot.querySelector("iframe")) return;

    const iframe = document.createElement("iframe");
    iframe.allow = "autoplay *; encrypted-media *;";
    iframe.frameBorder = "0";
    iframe.height = "450";
    iframe.loading = "lazy";
    iframe.sandbox = "allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation";
    iframe.src = playlistData.embedUrl;
    iframe.title = "Brighton's Playlist on Apple Music";
    iframe.style.cssText = "width:100%;max-width:660px;overflow:hidden;background:transparent;";
    playerSlot.appendChild(iframe);
  };

  const renderProviders = () => {
    const links = playlistData?.playlistLinks || {};
    const entries = Object.entries(links).filter(([, url]) => Boolean(url));
    if (entries.length <= 1) {
      providerLinks.hidden = true;
      return;
    }

    providerLinkList.innerHTML = entries.map(([provider, url]) => `
      <a class="provider-link" href="${escapeHtml(url)}" target="_blank" rel="noopener" data-provider="${escapeHtml(provider)}">
        ${escapeHtml(providerLabels[provider] || provider)}
      </a>
    `).join("");
    providerLinks.hidden = false;
  };

  const renderTracks = () => {
    const tracks = playlistData?.tracks || [];
    playlistTracks.innerHTML = tracks.map((song, index) => `
      <li class="track-card">
        <span class="track-number">${String(index + 1).padStart(2, "0")}</span>
        <div>
          <strong>${escapeHtml(song.title)}</strong>
          <span>${escapeHtml(song.artist)}</span>
        </div>
      </li>
    `).join("");
    trackListSection.hidden = false;
  };

  const showUnavailable = () => {
    playlistGate.hidden = true;
    playlistUnavailable.hidden = false;
    playlistExperience.hidden = true;
    trackListSection.hidden = true;
    providerLinks.hidden = true;
  };

  const showGate = () => {
    playlistGate.hidden = false;
    playlistUnavailable.hidden = true;
    playlistExperience.hidden = true;
    trackListSection.hidden = true;
    providerLinks.hidden = true;
  };

  const showPlaylist = async () => {
    await loadPlaylistData();
    playlistGate.hidden = true;
    playlistUnavailable.hidden = true;
    playlistExperience.hidden = false;
    openAppleMusic.href = playlistData.playlistLinks.appleMusic;
    loadApplePlayer();
    renderProviders();
    renderTracks();
    track("brighton_playlist_opened");
  };

  const sharePlaylist = async () => {
    const shareData = {
      title: "Brighton's Playlist",
      text: "The songs Brighton loved and made part of the soundtrack of his life.",
      url: currentPrivateUrl()
    };

    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(shareData.url);
      sharePlaylistButton.textContent = "Link Copied";
      window.setTimeout(() => {
        sharePlaylistButton.textContent = "Share";
      }, 1800);
    }

    track("brighton_playlist_shared");
  };

  const init = async () => {
    if (!accessHelper) {
      showGate();
      return;
    }

    currentAccess = await accessHelper?.ensureAccess?.();
    if (!currentAccess) {
      showGate();
      return;
    }

    connectPrivatePageLinks();

    const enabled = typeof window.DinoBoySiteSettings?.isBrightonPlaylistEnabled === "function"
      ? await window.DinoBoySiteSettings.isBrightonPlaylistEnabled()
      : true;
    if (enabled === false) {
      showUnavailable();
      return;
    }

    try {
      await showPlaylist();
    } catch (error) {
      console.warn(error);
      showUnavailable();
      playlistUnavailable.querySelector("p").textContent = "Brighton's Playlist could not load right now. Please refresh and try again.";
    }
  };

  openAppleMusic?.addEventListener("click", () => {
    track("brighton_playlist_provider_clicked", { provider: "appleMusic" });
  });

  providerLinkList?.addEventListener("click", (event) => {
    const link = event.target.closest("[data-provider]");
    if (!link) return;
    track("brighton_playlist_provider_clicked", { provider: link.dataset.provider });
  });

  sharePlaylistButton?.addEventListener("click", sharePlaylist);

  init();
})();
