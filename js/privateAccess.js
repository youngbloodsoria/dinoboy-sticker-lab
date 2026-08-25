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
    window.localStorage.setItem(storageKey, JSON.stringify({
      token: access.token,
      tokenId: access.tokenId,
      label: access.label,
      savedAt: new Date().toISOString()
    }));
  };

  const clearAccess = () => {
    window.localStorage.removeItem(storageKey);
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
    ensureAccess,
    readStoredAccess,
    saveAccess,
    clearAccess,
    tokenFromUrl
  };
})();
