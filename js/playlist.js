(() => {
  const playlistGate = document.querySelector("#playlistGate");
  const playlistExperience = document.querySelector("#playlistExperience");
  const playlistUnavailable = document.querySelector("#playlistUnavailable");
  const playerSlot = document.querySelector("#appleMusicPlayer");
  const openAppleMusic = document.querySelector("#openAppleMusic");
  const sharePlaylistButton = document.querySelector("#sharePlaylist");
  const trackListSection = document.querySelector("#trackListSection");
  const musicCultureSection = document.querySelector("#musicCultureSection");
  const playlistTracks = document.querySelector("#playlistTracks");
  const providerLinks = document.querySelector("#providerLinks");
  const providerLinkList = document.querySelector("#providerLinkList");
  const privateNav = document.querySelector("#playlistPrivateNav");
  const shareCard = document.querySelector("#playlistShareCard");
  const celebrationVideo = document.querySelector("#celebrationVideo");
  const accessHelper = window.DinoBoyPrivateAccess;
  const privatePageBaseUrl = window.location.origin + "/";
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

  const songQuery = (song) => `${song.title} ${song.artist}`;

  const songSearchUrl = (provider, song) => {
    const query = encodeURIComponent(songQuery(song));
    const spotifyQuery = encodeURIComponent(songQuery(song)).replace(/%20/g, "%20");

    if (provider === "appleMusic") return `https://music.apple.com/us/search?term=${query}`;
    if (provider === "spotify") return `https://open.spotify.com/search/${spotifyQuery}`;
    if (provider === "amazonMusic") return `https://music.amazon.com/search/${query}`;
    return "#";
  };

  const renderTracks = () => {
    const tracks = playlistData?.tracks || [];
    playlistTracks.innerHTML = tracks.map((song, index) => `
      <li class="track-card">
        <span class="track-number">${String(index + 1).padStart(2, "0")}</span>
        <div>
          <strong>${escapeHtml(song.title)}</strong>
          <span>${escapeHtml(song.artist)}</span>
          <div class="track-service-links" aria-label="Find ${escapeHtml(song.title)} on music services">
            <a href="${escapeHtml(songSearchUrl("appleMusic", song))}" target="_blank" rel="noopener" data-provider="appleMusic">Apple</a>
            <a href="${escapeHtml(songSearchUrl("spotify", song))}" target="_blank" rel="noopener" data-provider="spotify">Spotify</a>
            <a href="${escapeHtml(songSearchUrl("amazonMusic", song))}" target="_blank" rel="noopener" data-provider="amazonMusic">Amazon</a>
          </div>
        </div>
      </li>
    `).join("");
    trackListSection.hidden = false;
  };

  const showUnavailable = () => {
    playlistGate.hidden = true;
    playlistUnavailable.hidden = false;
    playlistExperience.hidden = true;
    celebrationVideo.hidden = true;
    trackListSection.hidden = true;
    if (musicCultureSection) musicCultureSection.hidden = true;
    providerLinks.hidden = true;
    if (shareCard) shareCard.hidden = true;
  };

  const showGate = () => {
    playlistGate.hidden = false;
    playlistUnavailable.hidden = true;
    playlistExperience.hidden = true;
    celebrationVideo.hidden = true;
    trackListSection.hidden = true;
    if (musicCultureSection) musicCultureSection.hidden = true;
    providerLinks.hidden = true;
    if (shareCard) shareCard.hidden = true;
  };

  const showPlaylist = async () => {
    await loadPlaylistData();
    playlistGate.hidden = true;
    playlistUnavailable.hidden = true;
    playlistExperience.hidden = false;
    celebrationVideo.hidden = false;
    openAppleMusic.href = playlistData.playlistLinks.appleMusic;
    loadApplePlayer();
    renderProviders();
    renderTracks();
    if (musicCultureSection) musicCultureSection.hidden = false;
    if (shareCard) shareCard.hidden = false;
    track("brighton_playlist_opened");
  };

  const videoModal = document.querySelector("#celebrationVideoModal");
  const videoSurface = document.querySelector("#celebrationVideoSurface");
  const videoSlot = document.querySelector("#celebrationVideoPlayer");
  const fullscreenVideo = document.querySelector("#fullscreenCelebrationVideo");

  document.querySelector("#watchCelebrationVideo").addEventListener("click", () => {
    if (!currentAccess || celebrationVideo.hidden) return;
    const iframe = document.createElement("iframe");
    // Playback is requested only after the visitor presses Watch Video.
    iframe.src = "https://www.youtube.com/embed/70u9L5ybRD4?autoplay=1";
    iframe.title = "Brighton's Celebration of Life";
    iframe.allow = "autoplay; accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    videoSlot.replaceChildren(iframe);
    videoModal.showModal();
    document.body.classList.add("video-modal-open");
  });
  const stopVideo = () => {
    videoSlot.replaceChildren(); // Unload the player so audio stops, including on Escape.
    document.body.classList.remove("video-modal-open");
    if (document.fullscreenElement === videoSurface) document.exitFullscreen().catch(() => {});
  };
  const closeVideo = () => { stopVideo(); videoModal.close(); };
  document.querySelector("#closeCelebrationVideo").addEventListener("click", closeVideo);
  videoModal.addEventListener("cancel", stopVideo);
  videoModal.addEventListener("close", stopVideo);
  videoModal.addEventListener("click", (event) => {
    if (event.target !== videoModal) return;
    const bounds = videoModal.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeVideo();
  });
  fullscreenVideo.hidden = !document.fullscreenEnabled;
  fullscreenVideo.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement === videoSurface) await document.exitFullscreen();
      else await videoSurface.requestFullscreen();
    } catch { /* The embedded player also offers its own fullscreen control. */ }
  });
  document.addEventListener("fullscreenchange", () => {
    fullscreenVideo.textContent = document.fullscreenElement === videoSurface ? "Exit Full Screen" : "Full Screen";
  });

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
    const settings = await window.DinoBoySiteSettings?.applyCelebrationPageLinks?.();

    const enabled = settings?.brighton_playlist_enabled !== false;
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
