// ================== CONFIG ==================
const API = "https://sitedbsportdatamicro.onrender.com/api/clasament/cluburi";

// ================== PARAMS ==================
const params = new URLSearchParams(window.location.search);
const clubParam = params.get("club");
const viewParam = params.get("view");

// ================== ELEMENTE ==================
const podiumEl = document.getElementById("podium");
const clubListEl = document.getElementById("clubList");
const athletesEl = document.getElementById("athletes");
const searchSection = document.getElementById("searchSection");
const searchInput = document.getElementById("searchInput");
const viewSwitch = document.getElementById("viewSwitch");
const btnClubs = document.getElementById("btnClubs");
const btnAthletes = document.getElementById("btnAthletes");
const exportBtn = document.getElementById("exportExcelBtn");
const exportAthletesBtn = document.getElementById("exportAthletesBtn");


// ================== STATE ==================
let cachedData = [];
let athletesCache = [];
let currentGender = "all";

// ================== INIT ==================
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

// ================== AUTO REFRESH ==================
const AUTO_REFRESH_INTERVAL = 3 * 60 * 1000;
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

// ================== ROUTER ==================
function route() {
  resetUI();

  // Ascunde ambele butoane la început
  if (exportBtn) exportBtn.classList.add("hidden");
  if (exportAthletesBtn) exportAthletesBtn.classList.add("hidden");

  // Dacă avem parametru club → afișăm pagina clubului
  if (clubParam) {
    renderClubPage();
    if (exportAthletesBtn) exportAthletesBtn.classList.remove("hidden"); // ✅ apare doar la club
    return;
  }

  // Dacă NU avem clubParam → suntem pe clasamentul general
  if (exportBtn) exportBtn.classList.remove("hidden"); // ✅ apare doar la general

  if (viewSwitch) viewSwitch.classList.remove("hidden");

  if (viewParam === "sportivi") {
    setActive(btnAthletes);
    renderGlobalAthletes();
  } else {
    setActive(btnClubs);
    renderClasamentCluburi();
  }
}

// ================== SWITCH ==================
btnClubs?.addEventListener("click", () => (location.href = "clasament.html"));
btnAthletes?.addEventListener("click", () => (location.href = "clasament.html?view=sportivi"));

function setActive(btn) {
  [btnClubs, btnAthletes].forEach(b => b?.classList.remove("active"));
  btn?.classList.add("active");
}

// ================== RESET UI ==================
function resetUI() {
  podiumEl?.classList.add("hidden");
  clubListEl?.classList.add("hidden");
  athletesEl?.classList.add("hidden");
  searchSection?.classList.add("hidden");
  if (searchInput) searchInput.value = "";
}

// ================== CLASAMENT CLUBURI ==================
function renderClasamentCluburi() {
  setHeader("CLASAMENT CLUBURI", "Victory Cup · Live");

  podiumEl.classList.remove("hidden");
  clubListEl.classList.remove("hidden");

  const ranked = cachedData
    .map(c => ({
      club: c.club,
      points: calculeazaPuncteClub(c.rezultate),
    }))
    .sort((a, b) => b.points - a.points);

  const podium = podiumScores(ranked, "points");

  podiumEl.innerHTML = ranked.slice(0, 3).map(c => clubCard(c, podium)).join("");
  clubListEl.innerHTML = ranked.slice(3).map((c, i) => clubRow(c, i + 4, podium)).join("");
}

// ================== PAGINA CLUB ==================
function renderClubPage() {
  if (exportAthletesBtn) exportAthletesBtn.classList.remove("hidden");
  const club = cachedData.find(c => c.club === clubParam);
  if (!club) return;

  const total = calculeazaPuncteClub(club.rezultate);

  setHeader(`REZULTATE ${club.club.toUpperCase()}`, `Total puncte club: ${total}`);
  searchSection.classList.remove("hidden");

  athletesCache = aggregateAthletes(club.rezultate);
  renderAthletes(athletesCache);

  hookSearch();
  hookGenderFilter();
  applyFilters();
}

// ================== SPORTIVI GLOBAL ==================
function renderGlobalAthletes() {
  setHeader("CLASAMENT SPORTIVI", "Toate cluburile · punctaj cumulat");
  searchSection.classList.remove("hidden");

  athletesCache = aggregateAllAthletes(cachedData);
  renderAthletes(athletesCache);

  hookSearch();
  hookGenderFilter();
  applyFilters();
}

// ================== SEARCH ==================
function hookSearch() {
  if (!searchInput) return;
  searchInput.oninput = () => applyFilters();
}

// ================== AGREGARE ==================
function aggregateAthletes(rez) {
  const map = {};
  rez.forEach(r => {
    if (!map[r.sportiv]) map[r.sportiv] = { nume: r.sportiv, rezultate: [], puncte: 0 };
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
      if (!map[r.sportiv]) map[r.sportiv] = { nume: r.sportiv, club: c.club, rezultate: [], puncte: 0 };
      map[r.sportiv].rezultate.push(r);
      map[r.sportiv].puncte += puncteLoc(r.loc);
    });
  });

  return Object.values(map)
    .map(a => ({ ...a, gen: detectGender(a) }))
    .sort((a, b) => b.puncte - a.puncte);
}

// ================== RENDER SPORTIVI ==================
function renderAthletes(list) {
  athletesEl.classList.remove("hidden");
  const podium = podiumScores(list, "puncte");
  athletesEl.innerHTML = list
    .map(
      a => `
    <div class="athlete-card ${podiumClass(a.puncte, podium)}">
      <div class="athlete-header">
        <div>
          <div class="athlete-name">${a.nume}</div>
          ${a.club ? `<div class="athlete-club">${a.club}</div>` : ""}
        </div>
        <span class="total">${a.puncte}p</span>
      </div>
      ${a.rezultate
        .map(
          r => `
        <div class="result-line">
          <span>${r.categorie}</span>
          <span>${medal(r.loc)}</span>
        </div>`
        )
        .join("")}
    </div>`
    )
    .join("");
}

// ================== UI HELPERS ==================
function setHeader(title, subtitle) {
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("pageSubtitle").textContent = subtitle;
}

function clubCard(c, podium) {
  return `
    <div class="podium-card ${podiumClass(c.points, podium)}" onclick="go('${c.club}')">
      <h2>${c.club}</h2>
      <div class="score">${c.points}</div>
    </div>`;
}

function clubRow(c, pos, podium) {
  return `
    <div class="club-row ${podiumClass(c.points, podium)}" onclick="go('${c.club}')">
      <span>${pos}. ${c.club}</span>
      <strong>${c.points}p</strong>
    </div>`;
}

// ================== UTILS ==================
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
  const vals = [...new Set(list.map(i => i[key]))].sort((a, b) => b - a).slice(0, 3);
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
    now.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
}

function detectGender(athlete) {
  const text = athlete.rezultate.map(r => r.categorie.toLowerCase()).join(" ");
  if (text.includes("masculin")) return "masculin";
  if (text.includes("feminin")) return "feminin";
  return "necunoscut";
}

function hookGenderFilter() {
  if (!genderFilter) return;
  genderFilter.classList.remove("hidden");
  genderFilter.querySelectorAll("button").forEach(btn => {
    btn.onclick = () => {
      genderFilter.querySelectorAll("button").forEach(b => b.classList.remove("active"));
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
      a.rezultate.some(r => r.categorie.toLowerCase().includes(q));
    const matchGender = currentGender === "all" || a.gen === currentGender;
    return matchText && matchGender;
  });
  renderAthletes(filtered);
}

// ================== EXPORT EXCEL ==================
if (exportBtn) exportBtn.addEventListener("click", exportToExcel);

function exportToExcel() {
  if (!cachedData || !Array.isArray(cachedData)) {
    alert("Datele nu sunt încărcate complet!");
    return;
  }

  const wb = XLSX.utils.book_new();

  // 1️⃣ Sheet per club – grupat pe sportiv
  cachedData.forEach(club => {
    const sheetName = club.club.slice(0, 28);

    // Grupăm rezultatele pe sportiv
    const grouped = {};
    club.rezultate.forEach(r => {
      if (!grouped[r.sportiv]) grouped[r.sportiv] = [];
      grouped[r.sportiv].push(r);
    });

    // Transformăm într-un array plat cu separator între sportivi
    let data = [];
    Object.entries(grouped).forEach(([sportiv, rez]) => {
      rez.forEach(r => {
        data.push({
          Sportiv: sportiv,
          Categorie: r.categorie,
          Loc: r.loc,
          Puncte: puncteLoc(r.loc),
        });
      });
      // Linie goală între sportivi (opțional)
      data.push({});
    });

    // Convertim în foaie
    const ws = XLSX.utils.json_to_sheet(data, { origin: "A1" });

    // Adăugăm antet pentru autofilter
    ws['!autofilter'] = { ref: "A1:D1" };

    // Stilizare alternativă (culoare rânduri)
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 1; R <= range.e.r; ++R) {
      const fillColor = R % 2 === 0 ? "FFEFEFEF" : "FFFFFFFF"; // gri deschis pe rândurile pare
      for (let C = 0; C <= range.e.c; ++C) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellRef]) continue;
        if (!ws[cellRef].s) ws[cellRef].s = {};
        ws[cellRef].s.fill = { patternType: "solid", fgColor: { rgb: fillColor } };
      }
    }

    // Auto-fit coloane
    const colWidths = [];
    const keys = ["Sportiv", "Categorie", "Loc", "Puncte"];
    keys.forEach((k, i) => {
      let maxLen = k.length;
      data.forEach(row => {
        const val = row[k] ? row[k].toString() : "";
        if (val.length > maxLen) maxLen = val.length;
      });
      colWidths.push({ wch: maxLen + 2 });
    });
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // 2️⃣ Sheet general (toate cluburile)
  const all = cachedData.flatMap(club =>
    club.rezultate.map(r => ({
      Club: club.club,
      Sportiv: r.sportiv,
      Categorie: r.categorie,
      Loc: r.loc,
      Puncte: puncteLoc(r.loc),
    }))
  );

  const wsAll = XLSX.utils.json_to_sheet(all, { origin: "A1" });
  wsAll["!autofilter"] = { ref: "A1:E1" };

  // Colorare alternativă + autofit și aici
  const rangeAll = XLSX.utils.decode_range(wsAll["!ref"]);
  for (let R = 1; R <= rangeAll.e.r; ++R) {
    const fillColor = R % 2 === 0 ? "FFEFEFEF" : "FFFFFFFF";
    for (let C = 0; C <= rangeAll.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (!wsAll[cellRef]) continue;
      if (!wsAll[cellRef].s) wsAll[cellRef].s = {};
      wsAll[cellRef].s.fill = { patternType: "solid", fgColor: { rgb: fillColor } };
    }
  }

  // Auto-fit coloane
  const colWidthsAll = [];
  const keysAll = ["Club", "Sportiv", "Categorie", "Loc", "Puncte"];
  keysAll.forEach(k => {
    let maxLen = k.length;
    all.forEach(row => {
      const val = row[k] ? row[k].toString() : "";
      if (val.length > maxLen) maxLen = val.length;
    });
    colWidthsAll.push({ wch: maxLen + 2 });
  });
  wsAll["!cols"] = colWidthsAll;

  XLSX.utils.book_append_sheet(wb, wsAll, "Toate Cluburile");

  // 3️⃣ Scriem fișierul Excel
  XLSX.writeFile(wb, "Rezultate_VictoryCup.xlsx");
}

if (exportAthletesBtn)
  exportAthletesBtn.addEventListener("click", exportClubAthletesToExcel);

function exportClubAthletesToExcel() {
  if (!clubParam) {
    alert("Această opțiune este disponibilă doar pe pagina unui club.");
    return;
  }

  const club = cachedData.find(c => c.club === clubParam);
  if (!club) {
    alert("Clubul nu a fost găsit în date!");
    return;
  }

  // Grupăm rezultatele pe sportiv
  const grouped = {};
  club.rezultate.forEach(r => {
    if (!grouped[r.sportiv]) grouped[r.sportiv] = [];
    grouped[r.sportiv].push(r);
  });

  // Pregătim datele Excel
  let data = [];
  Object.entries(grouped).forEach(([sportiv, rez]) => {
    rez.forEach(r => {
      data.push({
        Sportiv: sportiv,
        Categorie: r.categorie,
        Loc: r.loc,
        Puncte: puncteLoc(r.loc),
      });
    });
    data.push({}); // Linie goală între sportivi
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data, { origin: "A1" });
  ws["!autofilter"] = { ref: "A1:D1" };

  // Alternare culori pe rânduri
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let R = 1; R <= range.e.r; ++R) {
    const fillColor = R % 2 === 0 ? "FFEFEFEF" : "FFFFFFFF";
    for (let C = 0; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellRef]) continue;
      if (!ws[cellRef].s) ws[cellRef].s = {};
      ws[cellRef].s.fill = { patternType: "solid", fgColor: { rgb: fillColor } };
    }
  }

  // Auto-fit coloane
  const colWidths = [];
  const keys = ["Sportiv", "Categorie", "Loc", "Puncte"];
  keys.forEach(k => {
    let maxLen = k.length;
    data.forEach(row => {
      const val = row[k] ? row[k].toString() : "";
      if (val.length > maxLen) maxLen = val.length;
    });
    colWidths.push({ wch: maxLen + 2 });
  });
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, club.club.slice(0, 28));
  XLSX.writeFile(wb, `Rezultate_${club.club.replaceAll(" ", "_")}.xlsx`);
}
