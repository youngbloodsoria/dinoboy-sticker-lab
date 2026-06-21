// Public Fighters gallery.
// Reads only from the public_fighters view. Raw submissions stay private.

const fightersGrid = document.querySelector("#fightersGrid");
const fightersStatus = document.querySelector("#fightersStatus");
const fighterSearch = document.querySelector("#fighterSearch");
const battleFilter = document.querySelector("#battleFilter");
const supabaseClient = window.DinoBoySupabase?.client;
const tiltValues = ["-2deg", "1.5deg", "-1deg", "2deg", "1deg", "-1.5deg", "1.8deg", "-2deg"];
const tapeTiltValues = ["5deg", "-4deg", "3deg", "-5deg", "-2deg", "4deg", "-3deg", "5deg"];

let fighters = [];

const setStatus = (message, hidden = false) => {
  if (!fightersStatus) {
    return;
  }

  fightersStatus.textContent = message;
  fightersStatus.hidden = hidden;
};

const fighterImage = (fighter) => (
  fighter.approved_card_image_url
  || fighter.approved_sticker_image_url
  || "assets/stickers/kidsticker1.png"
);

const fighterName = (fighter) => {
  const name = fighter.approved_display_name || "Fighter";
  return fighter.approved_age ? `${name}, ${fighter.approved_age}` : name;
};

const matchesSearch = (fighter, query, battleType) => {
  const haystack = [
    fighter.approved_display_name,
    fighter.approved_battle_type,
    fighter.approved_tagline,
    fighter.approved_story
  ].filter(Boolean).join(" ").toLowerCase();

  return (!query || haystack.includes(query))
    && (!battleType || fighter.approved_battle_type === battleType);
};

const renderBattleOptions = () => {
  const battleTypes = [...new Set(fighters.map((fighter) => fighter.approved_battle_type).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  battleFilter.innerHTML = `<option value="">All Battle Types</option>`;

  for (const battleType of battleTypes) {
    const option = document.createElement("option");
    option.value = battleType;
    option.textContent = battleType;
    battleFilter.append(option);
  }
};

const renderFighters = () => {
  const query = fighterSearch.value.trim().toLowerCase();
  const battleType = battleFilter.value;
  const visibleFighters = fighters.filter((fighter) => matchesSearch(fighter, query, battleType));

  fightersGrid.innerHTML = "";

  if (!visibleFighters.length) {
    setStatus(fighters.length ? "No fighters match that search yet." : "No approved fighters are public yet.");
    return;
  }

  setStatus("", true);

  for (const [index, fighter] of visibleFighters.entries()) {
    const card = document.createElement("a");
    card.className = "fighter-card";
    card.href = `fighter.html?slug=${encodeURIComponent(fighter.fighter_slug)}`;
    card.style.setProperty("--tilt", tiltValues[index % tiltValues.length]);
    card.style.setProperty("--tape-tilt", tapeTiltValues[index % tapeTiltValues.length]);

    const image = document.createElement("img");
    image.src = fighterImage(fighter);
    image.alt = `${fighter.approved_display_name || "Fighter"} sticker`;

    const title = document.createElement("h2");
    title.textContent = fighterName(fighter);

    const diagnosis = document.createElement("p");
    diagnosis.className = "diagnosis";
    diagnosis.textContent = fighter.approved_battle_type || "Battle Type";

    const tagline = document.createElement("p");
    tagline.className = "tagline";
    tagline.textContent = fighter.approved_tagline || "Roaring Back";

    card.append(image, title, diagnosis, tagline);
    fightersGrid.append(card);
  }
};

const loadFighters = async () => {
  if (!window.DinoBoySupabase?.isConfigured() || !supabaseClient) {
    setStatus("Fighter gallery is almost ready. Supabase needs to be configured first.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("public_fighters")
    .select("*")
    .order("approved_at", { ascending: false });

  if (error) {
    console.error("Could not load public fighters", error);
    setStatus("Could not load fighters yet. Check the public_fighters view and RLS settings.");
    return;
  }

  fighters = data || [];
  renderBattleOptions();
  renderFighters();
};

fighterSearch?.addEventListener("input", renderFighters);
battleFilter?.addEventListener("change", renderFighters);
loadFighters();
