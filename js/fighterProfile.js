// Public fighter profile page.
// Fetches one approved fighter from the public_fighters view by URL slug.

const fighterStatus = document.querySelector("#fighterStatus");
const fighterProfile = document.querySelector("#fighterProfile");
const fighterImage = document.querySelector("#fighterImage");
const fighterName = document.querySelector("#fighterName");
const fighterAge = document.querySelector("#fighterAge");
const fighterBattle = document.querySelector("#fighterBattle");
const fighterTagline = document.querySelector("#fighterTagline");
const fighterStory = document.querySelector("#fighterStory");
const shareButton = document.querySelector("#shareButton");
const copyLinkButton = document.querySelector("#copyLinkButton");
const supabaseClient = window.DinoBoySupabase?.client;

let currentFighter = null;

const params = new URLSearchParams(window.location.search);
const slug = params.get("slug");

const setStatus = (title, message) => {
  fighterStatus.hidden = false;
  fighterProfile.hidden = true;
  fighterStatus.innerHTML = `<h1>${title}</h1><p>${message}</p>`;
};

const publicUrl = () => window.location.href.split("#")[0];

const profileImage = (fighter) => (
  fighter.approved_sticker_image_url
  || fighter.approved_card_image_url
  || "assets/stickers/kidsticker1.png"
);

const renderFighter = (fighter) => {
  currentFighter = fighter;
  const name = fighter.approved_display_name || "Fighter";

  document.title = `${name} | DinoBoy Sticker Lab`;
  fighterImage.src = profileImage(fighter);
  fighterImage.alt = `${name} sticker`;
  fighterImage.referrerPolicy = "no-referrer";
  fighterImage.addEventListener("error", () => {
    fighterImage.src = "assets/stickers/kidsticker1.png";
    fighterImage.alt = "Sticker image pending";
  }, { once: true });
  fighterName.textContent = name;
  fighterAge.textContent = fighter.approved_age ? `Age ${fighter.approved_age}` : "Age not listed";
  fighterBattle.textContent = fighter.approved_battle_type || "Battle type not listed";
  fighterTagline.textContent = fighter.approved_tagline || "Roaring back.";
  fighterStory.textContent = fighter.approved_story || "This fighter is part of the DinoBoy Sticker Lab wall.";

  fighterStatus.hidden = true;
  fighterProfile.hidden = false;
};

const loadFighter = async () => {
  if (!slug) {
    setStatus("Missing Slug.", "This fighter link needs a slug. Head back to the Fighters wall and choose a card.");
    return;
  }

  if (!window.DinoBoySupabase?.isConfigured() || !supabaseClient) {
    setStatus("Almost Ready.", "Supabase needs to be configured before fighter profiles can load.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("public_fighters")
    .select("*")
    .eq("fighter_slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Could not load fighter profile", error);
    setStatus("Could Not Load.", "Something went sideways while loading this fighter. Try again soon.");
    return;
  }

  if (!data) {
    setStatus("Fighter Not Found.", "This fighter may not be public yet, or the link may be wrong.");
    return;
  }

  renderFighter(data);
};

shareButton?.addEventListener("click", async () => {
  if (!currentFighter) {
    return;
  }

  const shareData = {
    title: `${currentFighter.approved_display_name} | DinoBoy Sticker Lab`,
    text: currentFighter.approved_tagline || "Meet this DinoBoy Sticker Lab fighter.",
    url: publicUrl()
  };

  if (navigator.share) {
    await navigator.share(shareData);
    return;
  }

  await navigator.clipboard.writeText(shareData.url);
  shareButton.textContent = "Link Copied";
});

copyLinkButton?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(publicUrl());
  copyLinkButton.textContent = "Copied";
  window.setTimeout(() => {
    copyLinkButton.textContent = "Copy Link";
  }, 1600);
});

loadFighter();
