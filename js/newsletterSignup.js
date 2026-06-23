const newsletterForms = document.querySelectorAll("[data-newsletter-form]");

const setNewsletterStatus = (form, message, type = "info") => {
  const status = form.querySelector("[data-newsletter-status]");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.dataset.type = type;
  status.hidden = false;
};

const subscribeToUpdates = async ({ email, name = null, source = "website" }) => {
  const supabaseClient = window.DinoBoySupabase?.client;

  if (!window.DinoBoySupabase?.isConfigured() || !supabaseClient) {
    throw new Error("Newsletter signup is not configured yet.");
  }

  const { error } = await supabaseClient.rpc("subscribe_to_updates", {
    subscriber_email: email,
    subscriber_name: name,
    subscriber_source: source
  });

  if (error) {
    throw error;
  }
};

newsletterForms.forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const emailInput = form.querySelector("[name='email']");
    const submitButton = form.querySelector("[type='submit']");
    const email = emailInput?.value?.trim();

    if (!email) {
      setNewsletterStatus(form, "Add your email first.", "error");
      return;
    }

    submitButton.disabled = true;
    submitButton.dataset.originalText = submitButton.textContent;
    submitButton.textContent = "Signing Up...";

    try {
      await subscribeToUpdates({
        email,
        source: form.dataset.newsletterSource || "updates-page"
      });
      form.reset();
      setNewsletterStatus(form, "You're on the update list. Thank you for being part of the village.", "success");
    } catch (error) {
      console.error("Newsletter signup failed", error);
      setNewsletterStatus(form, `Could not sign up yet. ${error.message || "Please try again."}`, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = submitButton.dataset.originalText || "Sign Me Up";
    }
  });
});
