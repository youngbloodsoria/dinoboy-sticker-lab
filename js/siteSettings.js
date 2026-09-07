(() => {
  const client = window.DinoBoySupabase?.client;
  const cache = new Map();

  const defaultSettings = {
    celebration_guestbook_enabled: true,
    five_lessons_enabled: true,
    brighton_memories_enabled: true,
    brighton_playlist_enabled: true
  };

  const normalize = (settings = {}) => ({
    ...defaultSettings,
    ...settings,
    celebration_guestbook_enabled: settings.celebration_guestbook_enabled !== false,
    five_lessons_enabled: settings.five_lessons_enabled !== false,
    brighton_memories_enabled: settings.brighton_memories_enabled !== false,
    brighton_playlist_enabled: settings.brighton_playlist_enabled !== false
  });

  const fetchSettings = async () => {
    if (cache.has("settings")) {
      return cache.get("settings");
    }

    if (!client) {
      const settings = normalize();
      cache.set("settings", settings);
      return settings;
    }

    try {
      const { data, error } = await client.rpc("get_public_site_settings");
      if (error) throw error;

      const settings = normalize(data || {});
      cache.set("settings", settings);
      return settings;
    } catch (error) {
      console.warn("Could not load site settings", error);
      const settings = normalize();
      cache.set("settings", settings);
      return settings;
    }
  };

  const isFiveLessonsEnabled = async () => {
    const settings = await fetchSettings();
    return settings.five_lessons_enabled;
  };

  const isCelebrationGuestbookEnabled = async () => {
    const settings = await fetchSettings();
    return settings.celebration_guestbook_enabled;
  };

  const isBrightonMemoriesEnabled = async () => {
    const settings = await fetchSettings();
    return settings.brighton_memories_enabled;
  };

  const isBrightonPlaylistEnabled = async () => {
    const settings = await fetchSettings();
    return settings.brighton_playlist_enabled;
  };

  const applyCelebrationPageLinks = async () => {
    const settings = await fetchSettings();
    const selectors = {
      "[data-guestbook-link]": settings.celebration_guestbook_enabled,
      "[data-five-lessons-link]": settings.five_lessons_enabled,
      "[data-memories-link]": settings.brighton_memories_enabled,
      "[data-playlist-link]": settings.brighton_playlist_enabled
    };

    Object.entries(selectors).forEach(([selector, enabled]) => {
      document.querySelectorAll(selector).forEach((link) => {
        link.hidden = enabled === false;
      });
    });

    return settings;
  };

  window.DinoBoySiteSettings = {
    fetchSettings,
    applyCelebrationPageLinks,
    isCelebrationGuestbookEnabled,
    isFiveLessonsEnabled,
    isBrightonMemoriesEnabled,
    isBrightonPlaylistEnabled
  };
})();
