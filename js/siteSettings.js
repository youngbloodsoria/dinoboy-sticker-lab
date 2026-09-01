(() => {
  const client = window.DinoBoySupabase?.client;
  const cache = new Map();

  const defaultSettings = {
    five_lessons_enabled: false
  };

  const normalize = (settings = {}) => ({
    ...defaultSettings,
    ...settings,
    five_lessons_enabled: settings.five_lessons_enabled === true
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

  window.DinoBoySiteSettings = {
    fetchSettings,
    isFiveLessonsEnabled
  };
})();
