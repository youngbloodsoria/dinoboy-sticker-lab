(() => {
  const config = window.DinoBoyCelebrationConfig || {};
  const storageKey = config.storageKey || "dinoboy-private-access-v1";
  const client = window.DinoBoySupabase?.client;

  const readStoredAccess = () => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  };

  const saveAccess = (access) => {
    const previous = readStoredAccess();
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        token: access.token,
        tokenId: access.tokenId,
        label: access.label,
        savedAt: new Date().toISOString(),
        checkedIn: previous?.token === access.token ? previous.checkedIn || null : null
      }));
    } catch { /* A validated invitation still works if browser storage is unavailable. */ }
  };

  const readCheckedInGuest = (access) => {
    const stored = readStoredAccess();
    return stored?.token === access?.token ? stored.checkedIn || null : null;
  };

  const rememberGuest = (access, fields) => {
    saveAccess(access);
    const stored = readStoredAccess();
    if (stored?.token !== access?.token) return;
    const profile = {};
    ["name", "email", "city", "state_region", "country", "relationship_to_brighton", "came_with"].forEach((key) => {
      profile[key] = String(fields[key] || "").slice(0, 500);
    });
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ ...stored, checkedIn: { ...profile, savedAt: new Date().toISOString() } }));
    } catch { /* Remembering a guest is optional, not a condition of submission. */ }
  };

  const forgetGuest = () => {
    const stored = readStoredAccess();
    if (!stored) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify({ ...stored, checkedIn: null })); } catch { /* Optional persistence. */ }
  };

  const clearAccess = () => {
    try { window.localStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
  };

  const tokenFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("t") || params.get("token") || "";
  };

  const validateToken = async (token) => {
    if (!client || !token) {
      return null;
    }

    const { data, error } = await client.rpc("validate_celebration_access_token", {
      raw_token: token
    });

    if (error) {
      console.warn("Celebration token validation failed", error);
      return null;
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.access_token_id) {
      return null;
    }

    return {
      token,
      tokenId: result.access_token_id,
      label: result.label || "Celebration of Life"
    };
  };

  const ensureAccess = async () => {
    const urlToken = tokenFromUrl();
    const storedAccess = readStoredAccess();
    const token = urlToken || storedAccess?.token || "";
    const access = await validateToken(token);

    if (access) {
      saveAccess(access);
      return access;
    }

    if (urlToken || storedAccess?.token) {
      clearAccess();
    }

    return null;
  };

  window.DinoBoyPrivateAccess = {
    readCheckedInGuest,
    rememberGuest,
    forgetGuest,
    ensureAccess,
    readStoredAccess,
    saveAccess,
    clearAccess,
    tokenFromUrl
  };
})();
