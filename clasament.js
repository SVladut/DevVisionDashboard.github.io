const API = "https://sitedbsportdatamicro.onrender.com/api/clasament/cluburi";

/* ================== PARAMS ================== */
const params = new URLSearchParams(window.location.search);
const clubParam = params.get("club");
const viewParam = params.get("view");

/* ================== ELEMENTE ================== */
const podiumEl = document.getElementById("podium");
const clubListEl = document.getElementById("clubList");
const athletesEl = document.getElementById("athletes");

const searchSection = document.getElementById("searchSection");
const searchInput = document.getElementById("searchInput");

const viewSwitch = document.getElementById("viewSwitch");
const btnClubs = document.getElementById("btnClubs");
const btnAthletes = document.getElementById("btnAthletes");

/* ================== STATE ================== */
let cachedData = [];
let athletesCache = [];

/* ================== INIT ================== */
init();

async function init() {
  try {
    const res = await fetch(API);
    cachedData = await res.json();
    route();
    updateLastRefresh();
  } catch (e) {
    console.error("Eroare API:", e);
    setHeader("Eroare", "Nu s-au putut încărca datele");
  }
}

/* ================== AUTO REFRESH ================== */
const AUTO_REFRESH_INTERVAL = 3 * 60 * 1000; // 5 minute

setInterval(reloadDataSilently, AUTO_REFRESH_INTERVAL);

async function reloadDataSilently() {
  try {
    const res = await fetch(API);
    cachedData = await res.json();
    route();
    updateLastRefresh();
    console.log("🔄 Clasament actualizat automat");
  } catch (e) {
    console.warn("⚠️ Auto-refresh eșuat", e);
  }
}


/* ================== ROUTER ================== */
function route() {
  resetUI();

  if (clubParam) {
    renderClubPage();
    return;
  }

  if (viewSwitch) viewSwitch.classList.remove("hidden");

  if (viewParam === "sportivi") {
    setActive(btnAthletes);
    renderGlobalAthletes();
  } else {
    setActive(btnClubs);
    renderClasamentCluburi();
  }
}

/* ================== SWITCH ================== */
btnClubs?.addEventListener("click", () => {
  location.href = "clasament.html";
});

btnAthletes?.addEventListener("click", () => {
  location.href = "clasament.html?view=sportivi";
});

function setActive(btn) {
  [btnClubs, btnAthletes].forEach(b => b?.classList.remove("active"));
  btn?.classList.add("active");
}

/* ================== RESET UI ================== */
function resetUI() {
  podiumEl?.classList.add("hidden");
  clubListEl?.classList.add("hidden");
  athletesEl?.classList.add("hidden");
  searchSection?.classList.add("hidden");
  if (searchInput) searchInput.value = "";
}

/* ================== CLASAMENT CLUBURI ================== */
function renderClasamentCluburi() {
  setHeader("CLASAMENT CLUBURI", "Victory Cup · Live");

  podiumEl.classList.remove("hidden");
  clubListEl.classList.remove("hidden");

  const ranked = cachedData
    .map(c => ({
      club: c.club,
      points: calculeazaPuncteClub(c.rezultate)
    }))
    .sort((a, b) => b.points - a.points);

  const podium = podiumScores(ranked, "points");

  podiumEl.innerHTML = ranked.slice(0, 3).map(c =>
    clubCard(c, podium)
  ).join("");

  clubListEl.innerHTML = ranked.slice(3).map((c, i) =>
    clubRow(c, i + 4, podium)
  ).join("");
}

/* ================== PAGINA CLUB ================== */
function renderClubPage() {
  const club = cachedData.find(c => c.club === clubParam);
  if (!club) return;

  const total = calculeazaPuncteClub(club.rezultate);

  setHeader(
    `REZULTATE ${club.club.toUpperCase()}`,
    `Total puncte club: ${total}`
  );

  searchSection.classList.remove("hidden");

  athletesCache = aggregateAthletes(club.rezultate);
  renderAthletes(athletesCache);

  hookSearch();
hookGenderFilter();
applyFilters();

}

/* ================== SPORTIVI GLOBAL ================== */
function renderGlobalAthletes() {
  setHeader(
    "CLASAMENT SPORTIVI",
    "Toate cluburile · punctaj cumulat"
  );

  searchSection.classList.remove("hidden");

  athletesCache = aggregateAllAthletes(cachedData);
  renderAthletes(athletesCache);

  hookSearch();
hookGenderFilter();
applyFilters();

}

/* ================== SEARCH ================== */
function hookSearch() {
  if (!searchInput) return;

  searchInput.oninput = () => {
    const q = searchInput.value.toLowerCase();
    renderAthletes(
      athletesCache.filter(a =>
        a.nume.toLowerCase().includes(q) ||
        a.club?.toLowerCase().includes(q) ||
        a.rezultate.some(r =>
          r.categorie.toLowerCase().includes(q)
        )
      )
    );
  };
}

/* ================== AGREGARE ================== */
function aggregateAthletes(rez) {
  const map = {};

  rez.forEach(r => {
    if (!map[r.sportiv]) {
      map[r.sportiv] = { nume: r.sportiv, rezultate: [], puncte: 0 };
    }
    map[r.sportiv].rezultate.push(r);
    map[r.sportiv].puncte += puncteLoc(r.loc);
  });

  return Object.values(map).sort((a, b) => b.puncte - a.puncte);
}

function aggregateAllAthletes(data) {
  const map = {};

  data.forEach(c => {
    c.rezultate.forEach(r => {
      if (!map[r.sportiv]) {
        map[r.sportiv] = {
          nume: r.sportiv,
          club: c.club,
          rezultate: [],
          puncte: 0
        };
      }
      map[r.sportiv].rezultate.push(r);
      map[r.sportiv].puncte += puncteLoc(r.loc);
    });
  });

  return Object.values(map).sort((a, b) => b.puncte - a.puncte);
}

/* ================== RENDER SPORTIVI ================== */
function renderAthletes(list) {
  athletesEl.classList.remove("hidden");

  const podium = podiumScores(list, "puncte");

  athletesEl.innerHTML = list.map(a => `
    <div class="athlete-card ${podiumClass(a.puncte, podium)}">
      <div class="athlete-header">
        <div>
          <div class="athlete-name">${a.nume}</div>
          ${a.club ? `<div class="athlete-club">${a.club}</div>` : ""}
        </div>
        <span class="total">${a.puncte}p</span>
      </div>

      ${a.rezultate.map(r => `
        <div class="result-line">
          <span>${r.categorie}</span>
          <span>${medal(r.loc)}</span>
        </div>
      `).join("")}
    </div>
  `).join("");
}

/* ================== UI HELPERS ================== */
function setHeader(title, subtitle) {
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("pageSubtitle").textContent = subtitle;
}

function clubCard(c, podium) {
  return `
    <div class="podium-card ${podiumClass(c.points, podium)}"
         onclick="go('${c.club}')">
      <h2>${c.club}</h2>
      <div class="score">${c.points}</div>
    </div>
  `;
}

function clubRow(c, pos, podium) {
  return `
    <div class="club-row ${podiumClass(c.points, podium)}"
         onclick="go('${c.club}')">
      <span>${pos}. ${c.club}</span>
      <strong>${c.points}p</strong>
    </div>
  `;
}

/* ================== UTILS ================== */
function go(club) {
  location.href = `clasament.html?club=${encodeURIComponent(club)}`;
}

function puncteLoc(loc) {
  return loc === 1 ? 3 : loc === 2 ? 2 : loc === 3 ? 1 : 0;
}

function calculeazaPuncteClub(rez) {
  return rez.reduce((s, r) => s + puncteLoc(r.loc), 0);
}

function medal(l) {
  return l === 1 ? "🥇" : l === 2 ? "🥈" : "🥉";
}

function podiumScores(list, key) {
  const vals = [...new Set(list.map(i => i[key]))]
    .sort((a, b) => b - a)
    .slice(0, 3);

  return { gold: vals[0], silver: vals[1], bronze: vals[2] };
}

function podiumClass(val, p) {
  if (val === p.gold) return "gold-card";
  if (val === p.silver) return "silver-card";
  if (val === p.bronze) return "bronze-card";
  return "default";
}

function updateLastRefresh() {
  const el = document.getElementById("lastUpdate");
  if (!el) return;

  const now = new Date();
  el.textContent =
    "Ultima actualizare: " +
    now.toLocaleTimeString("ro-RO", {
      hour: "2-digit",
      minute: "2-digit"
    });
}

let currentGender = "all";
function detectGender(athlete) {
  const text = athlete.rezultate
    .map(r => r.categorie.toLowerCase())
    .join(" ");

  if (text.includes("masculin")) return "masculin";
  if (text.includes("feminin")) return "feminin";
  return "necunoscut";
}
function aggregateAthletes(rez) {
  const map = {};

  rez.forEach(r => {
    if (!map[r.sportiv]) {
      map[r.sportiv] = {
        nume: r.sportiv,
        rezultate: [],
        puncte: 0
      };
    }
    map[r.sportiv].rezultate.push(r);
    map[r.sportiv].puncte += puncteLoc(r.loc);
  });

  return Object.values(map)
    .map(a => ({ ...a, gen: detectGender(a) }))
    .sort((a, b) => b.puncte - a.puncte);
}
function aggregateAllAthletes(data) {
  const map = {};

  data.forEach(c => {
    c.rezultate.forEach(r => {
      if (!map[r.sportiv]) {
        map[r.sportiv] = {
          nume: r.sportiv,
          club: c.club,
          rezultate: [],
          puncte: 0
        };
      }
      map[r.sportiv].rezultate.push(r);
      map[r.sportiv].puncte += puncteLoc(r.loc);
    });
  });

  return Object.values(map)
    .map(a => ({ ...a, gen: detectGender(a) }))
    .sort((a, b) => b.puncte - a.puncte);
}
function hookGenderFilter() {
  if (!genderFilter) return;

  genderFilter.classList.remove("hidden");

  genderFilter.querySelectorAll("button").forEach(btn => {
    btn.onclick = () => {
      genderFilter.querySelectorAll("button")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");
      currentGender = btn.dataset.gender;
      applyFilters();
    };
  });
}
function applyFilters() {
  const q = searchInput?.value.toLowerCase() || "";

  const filtered = athletesCache.filter(a => {
    const matchText =
      a.nume.toLowerCase().includes(q) ||
      a.club?.toLowerCase().includes(q) ||
      a.rezultate.some(r =>
        r.categorie.toLowerCase().includes(q)
      );

    const matchGender =
      currentGender === "all" || a.gen === currentGender;

    return matchText && matchGender;
  });

  renderAthletes(filtered);
}
