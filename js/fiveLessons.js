(() => {
  const reader = document.querySelector("#fiveLessonsReader");
  const hero = document.querySelector("#fiveLessonsHero");
  const cover = document.querySelector("#fiveLessonsCover");
  const comingSoon = document.querySelector("#fiveLessonsComingSoon");
  const spread = document.querySelector("#bookSpread");
  const pageStatus = document.querySelector("#pageStatus");
  const prevButton = document.querySelector("#previousPage");
  const nextButton = document.querySelector("#nextPage");
  const shareButton = document.querySelector("#shareBook");
  const fullscreenButton = document.querySelector("#fullscreenBook");
  const canonicalUrl = "https://dinoboysc.com/five-lessons";

  let manifest = null;
  let currentPageIndex = 0;
  let touchStartX = null;

  const track = (name, data = {}) => {
    if (typeof window.va === "function") {
      window.va("event", name, data);
    }
  };

  const isMobileLayout = () => window.matchMedia("(max-width: 780px)").matches;

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

  const shareBook = async () => {
    const shareData = {
      title: "Five Lessons from Brighton",
      text: "Read Five Lessons from Brighton.",
      url: canonicalUrl
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(canonicalUrl);
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

  const showComingSoon = () => {
    hero.hidden = true;
    comingSoon.hidden = false;
    reader.hidden = true;
  };

  const showReader = async () => {
    const response = await fetch("/public/five-lessons/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load the Five Lessons manifest.");
    manifest = await response.json();

    if (!manifest?.pages?.length) {
      throw new Error("The Five Lessons manifest has no pages.");
    }

    comingSoon.hidden = true;
    hero.hidden = false;
    reader.hidden = false;
    if (cover?.dataset.src && !cover.src) {
      cover.src = cover.dataset.src;
    }
    render();
    track("five_lessons_opened");
  };

  const init = async () => {
    const enabled = await window.DinoBoySiteSettings?.isFiveLessonsEnabled?.();
    if (!enabled) {
      showComingSoon();
      return;
    }

    try {
      await showReader();
    } catch (error) {
      console.warn(error);
      showComingSoon();
    }
  };

  prevButton.addEventListener("click", () => goToPage(-1));
  nextButton.addEventListener("click", () => goToPage(1));
  shareButton.addEventListener("click", shareBook);
  fullscreenButton.addEventListener("click", toggleFullscreen);
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
