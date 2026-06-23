const statusMessage = document.querySelector("[data-unsubscribe-status]");
const token = new URLSearchParams(window.location.search).get("token");

const showStatus = (message, type = "info") => {
  statusMessage.textContent = message;
  statusMessage.dataset.type = type;
};

const unsubscribe = async () => {
  const supabaseClient = window.DinoBoySupabase?.client;

  if (!token) {
    showStatus("This unsubscribe link is incomplete.", "error");
    return;
  }

  if (!window.DinoBoySupabase?.isConfigured() || !supabaseClient) {
    showStatus("Unsubscribe is temporarily unavailable. Please contact us directly.", "error");
    return;
  }

  const { data, error } = await supabaseClient.rpc("unsubscribe_from_updates", { token });

  if (error) {
    console.error("Unsubscribe failed", error);
    showStatus("We could not update your subscription. Please contact us directly.", "error");
    return;
  }

  if (data?.ok) {
    showStatus("You're unsubscribed. Thank you for being part of the village.", "success");
  } else {
    showStatus("This link was already used or is no longer active.", "info");
  }
};

unsubscribe();
