(() => {
  const reader = document.querySelector("#fiveLessonsReader");
  const hero = document.querySelector("#fiveLessonsHero");
  const cover = document.querySelector("#fiveLessonsCover");
  const offline = document.querySelector("#fiveLessonsOffline");
  const spread = document.querySelector("#bookSpread");
  const privateLinks = document.querySelector("#fiveLessonsPrivateLinks");
  const pageStatus = document.querySelector("#pageStatus");
  const readButton = document.querySelector(".book-read-button");
  const prevButton = document.querySelector("#previousPage");
  const nextButton = document.querySelector("#nextPage");
  const shareButton = document.querySelector("#shareBook");
  const fullscreenButton = document.querySelector("#fullscreenBook");
  const canonicalUrl = "https://dinoboysc.com/five-lessons";
  const accessHelper = window.DinoBoyPrivateAccess;

  let manifest = null;
  let currentPageIndex = 0;
  let touchStartX = null;
  let readerPromise = null;
  let currentAccess = null;

  const track = (name, data = {}) => {
    if (typeof window.va === "function") {
      window.va("event", name, data);
    }
  };

  const isMobileLayout = () => window.matchMedia("(max-width: 780px)").matches;

  const connectPrivatePageLinks = () => {
    const token = currentAccess?.token || accessHelper?.tokenFromUrl?.() || accessHelper?.readStoredAccess?.()?.token || "";
    if (!token) return;

    document.querySelectorAll("[data-private-page-link]").forEach((link) => {
      const url = new URL(link.getAttribute("href"), window.location.href);
      url.searchParams.set("t", token);
      link.href = `${url.pathname}${url.search}${url.hash}`;
    });
  };

  const renderPage = (page, className = "") => {
    if (!page) return "";

    return `
      <figure class="book-page ${className}">
        <img src="${page.src}" alt="Five Lessons from Brighton page ${page.pageNumber}" width="${page.width || ""}" height="${page.height || ""}" />
      </figure>
    `;
  };

  const pagesForView = () => {
    if (!manifest?.pages?.length) return [];
    if (isMobileLayout() || currentPageIndex === 0) {
      return [manifest.pages[currentPageIndex]];
    }

    const leftIndex = currentPageIndex % 2 === 0 ? currentPageIndex - 1 : currentPageIndex;
    return [
      manifest.pages[leftIndex],
      manifest.pages[leftIndex + 1]
    ].filter(Boolean);
  };

  const updateControls = () => {
    const lastIndex = Math.max(0, (manifest?.pages?.length || 1) - 1);
    prevButton.disabled = currentPageIndex <= 0;
    nextButton.disabled = currentPageIndex >= lastIndex;

    const viewPages = pagesForView().map((page) => page.pageNumber);
    pageStatus.textContent = viewPages.length > 1
      ? `Pages ${viewPages[0]}-${viewPages[viewPages.length - 1]} of ${manifest.pageCount}`
      : `Page ${viewPages[0] || 1} of ${manifest.pageCount}`;
  };

  const preloadNeighbors = () => {
    if (!manifest?.pages) return;
    [currentPageIndex - 2, currentPageIndex - 1, currentPageIndex + 1, currentPageIndex + 2]
      .filter((index) => manifest.pages[index])
      .forEach((index) => {
        const image = new Image();
        image.src = manifest.pages[index].src;
      });
  };

  const render = () => {
    if (!manifest?.pages?.length) return;

    const viewPages = pagesForView();
    spread.classList.toggle("single-page", viewPages.length === 1);
    spread.innerHTML = viewPages
      .map((page, index) => renderPage(page, index === 0 ? "left-page" : "right-page"))
      .join("");
    updateControls();
    preloadNeighbors();
  };

  const goToPage = (direction) => {
    const step = isMobileLayout() || currentPageIndex === 0 ? 1 : 2;
    const nextIndex = Math.min(
      Math.max(currentPageIndex + (direction * step), 0),
      manifest.pages.length - 1
    );

    if (nextIndex === currentPageIndex) return;
    currentPageIndex = nextIndex;
    spread.classList.remove("turning");
    requestAnimationFrame(() => {
      spread.classList.add("turning");
      render();
    });
    track(direction > 0 ? "five_lessons_next" : "five_lessons_previous", {
      page: currentPageIndex + 1
    });
  };

  const currentShareUrl = () => {
    const token = currentAccess?.token || accessHelper?.tokenFromUrl?.() || accessHelper?.readStoredAccess?.()?.token || "";
    if (!token) return canonicalUrl;

    const url = new URL(window.location.href);
    url.searchParams.set("t", token);
    return url.toString();
  };

  const shareBook = async () => {
    const url = currentShareUrl();
    const shareData = {
      title: "Five Lessons from Brighton",
      text: "Read Five Lessons from Brighton.",
      url
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        shareButton.textContent = "Link Copied";
        setTimeout(() => { shareButton.textContent = "Share"; }, 1800);
      }
      track("five_lessons_share");
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.warn("Share failed", error);
      }
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await reader.requestFullscreen();
        fullscreenButton.textContent = "Exit Fullscreen";
      } else {
        await document.exitFullscreen();
        fullscreenButton.textContent = "Fullscreen";
      }
    } catch (error) {
      console.warn("Fullscreen failed", error);
    }
  };

  const hideOffline = () => {
    if (offline) {
      offline.hidden = true;
    }
  };

  const showOffline = () => {
    hero.hidden = true;
    reader.hidden = true;
    if (privateLinks) {
      privateLinks.hidden = true;
    }
    if (offline) {
      offline.hidden = false;
    }
  };

  const showReaderError = (message) => {
    hideOffline();
    hero.hidden = false;
    reader.hidden = false;
    if (privateLinks) {
      privateLinks.hidden = false;
    }
    spread.classList.add("single-page");
    spread.innerHTML = `
      <div class="reader-error" role="status">
        <h2>Book pages did not load.</h2>
        <p>${message}</p>
      </div>
    `;
  };

  const showReader = async () => {
    if (manifest?.pages?.length) {
      hideOffline();
      hero.hidden = false;
      reader.hidden = false;
      if (privateLinks) {
        privateLinks.hidden = false;
      }
      render();
      return;
    }

    const [enabled, access] = await Promise.all([
      window.DinoBoySiteSettings?.isFiveLessonsEnabled?.(),
      accessHelper?.ensureAccess?.()
    ]);
    currentAccess = access;
    connectPrivatePageLinks();

    if (enabled === false && !currentAccess) {
      showOffline();
      return;
    }

    const response = await fetch("/assets/five-lessons/book/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load the Five Lessons manifest.");
    manifest = await response.json();

    if (!manifest?.pages?.length) {
      throw new Error("The Five Lessons manifest has no pages.");
    }

    hideOffline();
    hero.hidden = false;
    reader.hidden = false;
    if (privateLinks) {
      privateLinks.hidden = false;
    }
    if (cover?.dataset.src && !cover.src) {
      cover.src = cover.dataset.src;
    }
    render();
    track("five_lessons_opened");
  };

  const revealReader = async ({ shouldScroll = false } = {}) => {
    readerPromise ||= showReader();
    await readerPromise;

    if (shouldScroll && !reader.hidden) {
      reader.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const init = async () => {
    try {
      currentAccess = await accessHelper?.ensureAccess?.();
      connectPrivatePageLinks();
      await revealReader();
    } catch (error) {
      console.warn(error);
      readerPromise = null;
      showReaderError("Please refresh the page. If this keeps happening, the book manifest or generated page images need to be redeployed.");
    }
  };

  readButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await revealReader({ shouldScroll: true });
    } catch (error) {
      console.warn(error);
      readerPromise = null;
      showReaderError("Please refresh the page. If this keeps happening, the book manifest or generated page images need to be redeployed.");
    }
  });
  prevButton.addEventListener("click", () => goToPage(-1));
  nextButton.addEventListener("click", () => goToPage(1));
  shareButton.addEventListener("click", shareBook);
  fullscreenButton.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => {
    fullscreenButton.textContent = document.fullscreenElement === reader ? "Exit Fullscreen" : "Fullscreen";
    render();
  });
  window.addEventListener("resize", render);
  window.addEventListener("keydown", (event) => {
    if (reader.hidden) return;
    if (event.key === "ArrowLeft") goToPage(-1);
    if (event.key === "ArrowRight") goToPage(1);
  });
  spread.addEventListener("touchstart", (event) => {
    touchStartX = event.touches[0]?.clientX ?? null;
  }, { passive: true });
  spread.addEventListener("touchend", (event) => {
    if (touchStartX === null) return;
    const delta = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
    if (Math.abs(delta) > 45) {
      goToPage(delta < 0 ? 1 : -1);
    }
    touchStartX = null;
  }, { passive: true });

  init();
})();
