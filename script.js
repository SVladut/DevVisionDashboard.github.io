// ================== CONFIG PROGRAM ==================
const START_TIME = "09:30"; // ora reală de start a competiției
const LUNCH_BREAK = {
    start: "12:30",
    end: "13:00"
};

const endTimes = {
    1: "17:20",
    2: "16:55",
    3: "16:05"
};

const API_URL = "https://sitedbsportdatamicro.onrender.com/api/progres/tatami-jdbc";

// ================== STATE ENUM ==================
const CompetitionState = {
    NOT_STARTED: "NOT_STARTED",
    RUNNING: "RUNNING",
    LUNCH_BREAK: "LUNCH_BREAK",
    FINISHED: "FINISHED"
};

// ================== TIME UTILS ==================
function timeToMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

function minutesToTimeString(mins) {
    mins = (mins + 1440) % 1440;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function nowMinutes() {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
}

function formatClock(date = new Date()) {
    return date.toLocaleTimeString("ro-RO", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function updateClock() {
    const el = document.getElementById("currentTime");
    if (el) el.textContent = formatClock();
}

// ================== LUNCH & DURATION LOGIC ==================

function getCompetitionState(nowMin, startMin, finalEndMin) {
    const lunchStart = timeToMinutes(LUNCH_BREAK.start);
    const lunchEnd = timeToMinutes(LUNCH_BREAK.end);

    if (nowMin < startMin) return CompetitionState.NOT_STARTED;
    if (nowMin >= finalEndMin) return CompetitionState.FINISHED;
    if (nowMin >= lunchStart && nowMin < lunchEnd) return CompetitionState.LUNCH_BREAK;
    return CompetitionState.RUNNING;
}

/**
 * Durata planificată (în minute de lucru) de la start până la end,
 * excludând pauza dacă este în interval.
 */
function calculatePlannedDuration(startMin, endMin) {
    const lunchStart = timeToMinutes(LUNCH_BREAK.start);
    const lunchEnd = timeToMinutes(LUNCH_BREAK.end);

    if (endMin <= startMin) return 0;

    let duration = endMin - startMin;

    // Dacă pauza este în interiorul intervalului, o scădem
    if (endMin > lunchStart && startMin < lunchEnd) {
        duration -= (lunchEnd - lunchStart);
    }

    return Math.max(0, duration);
}

/**
 * Minute de lucru efective trecute de la start până la momentul "nowMin",
 * excluzând pauza. Dacă suntem înainte de start, returnează 0.
 */
function calculateWorkedMinutes(startMin, nowMin) {
    const lunchStart = timeToMinutes(LUNCH_BREAK.start);
    const lunchEnd = timeToMinutes(LUNCH_BREAK.end);

    if (nowMin <= startMin) {
        return 0;
    }

    // înainte de pauză
    if (nowMin <= lunchStart) {
        return nowMin - startMin;
    }

    // în pauză
    if (nowMin <= lunchEnd) {
        return lunchStart - startMin;
    }

    // după pauză
    return (lunchStart - startMin) + (nowMin - lunchEnd);
}

/**
 * Transformă "minute de lucru de la start" în timp de pe ceas (minute absolute),
 * ținând cont că între LUNCH_BREAK.start și .end nu se lucrează.
 */
function workingMinutesFromStartToWallClock(startMin, workMinutes) {
    const lunchStart = timeToMinutes(LUNCH_BREAK.start);
    const lunchEnd = timeToMinutes(LUNCH_BREAK.end);

    if (workMinutes <= 0) {
        return startMin;
    }

    const preLunchCapacity = Math.max(0, lunchStart - startMin);

    // tot lucrul se termină înainte de pauză
    if (workMinutes <= preLunchCapacity) {
        return startMin + workMinutes;
    }

    // consumăm tot ce e înainte de pauză, restul după pauză
    const remainingAfterLunch = workMinutes - preLunchCapacity;
    return lunchEnd + remainingAfterLunch;
}

// ================== HUMAN-FRIENDLY DURATIONS & STATUS ==================

function formatDurationHuman(minutes) {
    const abs = Math.abs(Math.round(minutes));
    const h = Math.floor(abs / 60);
    const m = abs % 60;

    if (h > 0 && m > 0) {
        return `${h} ore și ${m} minute`;
    }
    if (h > 0) {
        return `${h} ore`;
    }
    return `${m} minute`;
}

function getScheduleStatus(diffMinutes) {
    if (diffMinutes > 0) {
        return {
            color: "green",
            text: `Înaintea programului cu ${formatDurationHuman(diffMinutes)}`
        };
    }
    if (diffMinutes < 0) {
        return {
            color: "red",
            text: `În întârziere față de program cu ${formatDurationHuman(diffMinutes)}`
        };
    }
    return {
        color: "yellow",
        text: "Exact la timp față de program"
    };
}

// ================== GLOBAL STATE ==================

let autoRefresh = true;
let refreshIntervalId = null;

// ================== FETCH + RENDER ==================

async function fetchDataAndRender() {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();

        const tatamiContainer = document.getElementById("tatamiContainer");
        tatamiContainer.innerHTML = "";

        const startMin = timeToMinutes(START_TIME);
        const nowMin = nowMinutes();
        const finalEndMin = Math.max(
            ...Object.values(endTimes).map(t => timeToMinutes(t))
        );

        const compState = getCompetitionState(nowMin, startMin, finalEndMin);

        // Setăm ultima actualizare din start, indiferent de stare
        const lastUpdateEl = document.getElementById("lastUpdate");
        if (lastUpdateEl) {
            lastUpdateEl.textContent = formatClock();
        }

        // ================= TOTAL COMPETIȚIE =================
        
        let totalCategorii = 0;
        let totalPrintate = 0;

        Object.values(data).forEach(list => {
            totalCategorii += list.length;
            totalPrintate += list.filter(x => x.printat === 1).length;
        });

        const progresRealTotal = totalCategorii > 0
            ? (totalPrintate / totalCategorii) * 100
            : 0;

        const plannedTotalDuration = calculatePlannedDuration(startMin, finalEndMin);
        let workedTotalMinutes = calculateWorkedMinutes(startMin, nowMin);

        workedTotalMinutes = Math.max(0, Math.min(workedTotalMinutes, plannedTotalDuration));

        // Progres teoretic total raportat la TIMP (nu la categorii)
        let progresTeoreticTotal = 0;
        if (plannedTotalDuration > 0) {
            progresTeoreticTotal = (workedTotalMinutes / plannedTotalDuration) * 100;
            progresTeoreticTotal = Math.max(0, Math.min(100, progresTeoreticTotal));
        }

        // Dacă competiția nu a început, progresul teoretic trebuie să fie 0
        if (compState === CompetitionState.NOT_STARTED) {
            workedTotalMinutes = 0;
            progresTeoreticTotal = 0;
        }

        // Dacă competiția s-a terminat, progresul teoretic trebuie să fie 100
        if (compState === CompetitionState.FINISHED) {
            workedTotalMinutes = plannedTotalDuration;
            progresTeoreticTotal = 100;
        }

    // ================= ETA TOTAL COMPETIȚIE (nouă logică: regulă de 3 simplă) =================

// Diferența procentuală între progres real (bazat pe categorii) și cel teoretic (bazat pe timp)
const diffPercentTotal = progresRealTotal - progresTeoreticTotal;

// Durata planificată totală (în minute) de la start până la finalul ultimului tatami
const plannedDurationTotal = calculatePlannedDuration(startMin, finalEndMin);

// Diferența în minute față de program
const totalEtaDiffMinutes = (diffPercentTotal / 100) * plannedDurationTotal;

// Obținem textul de status (avans / întârziere / la timp)
const totalEtaStatus = getScheduleStatus(totalEtaDiffMinutes);

// Estimăm o oră finală teoretică „ajustată” pentru afișare (opțional)
const overallEtaMin = finalEndMin - totalEtaDiffMinutes;

// ================= UI: TOTAL COMPETIȚIE =================
const totalPercentEl = document.getElementById("totalPercent");
const totalBarEl = document.getElementById("totalBar");
const totalPrintedEl = document.getElementById("totalPrinted");
const totalAllEl = document.getElementById("totalAll");
const totalTheoEl = document.getElementById("totalTheoretical");
const totalScheduleTextEl = document.getElementById("totalScheduleText");
const overallEtaEl = document.getElementById("overallEta");
const overallEtaDiffEl = document.getElementById("overallEtaDiff");
const globalChip = document.getElementById("globalStatusChip");

if (totalPercentEl) {
    totalPercentEl.textContent = `${progresRealTotal.toFixed(1)}%`;
}
if (totalBarEl) {
    totalBarEl.style.width = `${Math.max(0, Math.min(100, progresRealTotal))}%`;
}
if (totalPrintedEl) {
    totalPrintedEl.textContent = totalPrintate;
}
if (totalAllEl) {
    totalAllEl.textContent = totalCategorii;
}
if (totalTheoEl) {
    totalTheoEl.textContent = `${progresTeoreticTotal.toFixed(1)}%`;
}
if (overallEtaEl) {
    overallEtaEl.textContent = `${minutesToTimeString(Math.round(overallEtaMin))} (plan: ${minutesToTimeString(finalEndMin)})`;
}
if (overallEtaDiffEl) {
    overallEtaDiffEl.textContent = totalEtaStatus.text;
}
// ================= STATUS GLOBAL TEXT ȘI CHIP =================
let globalText = "";

if (compState === CompetitionState.NOT_STARTED) {
    globalText = "Competiția nu a început încă";
} else if (compState === CompetitionState.LUNCH_BREAK) {
    globalText = "Pauză de masă (progresul este temporar oprit)";
} else if (compState === CompetitionState.FINISHED) {
    globalText = "Competiția s-a încheiat";
} else {
    // RUNNING
    if (totalPrintate === 0) {
        globalText = "Competiția este în desfășurare, dar nu există suficiente date pentru estimare";
    } else {
        globalText = totalEtaStatus.text;
    }
}

if (totalScheduleTextEl) {
    totalScheduleTextEl.textContent = globalText;
}

if (globalChip) {
    const dot = globalChip.querySelector(".status-dot");
    const label = document.getElementById("globalStatusLabel");

    if (dot) {
        dot.className = "status-dot"; // reset culoare
        if (compState === CompetitionState.NOT_STARTED) dot.classList.add("yellow");
        else if (compState === CompetitionState.LUNCH_BREAK) dot.classList.add("yellow");
        else if (compState === CompetitionState.FINISHED) dot.classList.add("green");
        else {
            // RUNNING — după culoarea ETA
            if (totalEtaStatus.color === "green") dot.classList.add("green");
            else if (totalEtaStatus.color === "red") dot.classList.add("red");
            else dot.classList.add("yellow");
        }
    }
    if (label) {
        label.textContent = globalText;
    }
}


        // ================= PER TATAMI =================
       // ================= PER TATAMI (corectate cu regulă de 3 simplă) =================
let worstTatami = null;
let worstDelayMinutes = null;

Object.keys(data).sort((a, b) => a - b).forEach(key => {
    const tatami = Number(key);
    const lista = data[key];

    const total = lista.length;
    const printate = lista.filter(x => x.printat === 1).length;

    const progresReal = total > 0 ? (printate / total) * 100 : 0;

    const endMin = timeToMinutes(endTimes[tatami]);
    const plannedDurationTatami = calculatePlannedDuration(startMin, endMin);
    let workedTatami = calculateWorkedMinutes(startMin, nowMin);
    workedTatami = Math.max(0, Math.min(workedTatami, plannedDurationTatami));

    const progresTeoreticTatami = plannedDurationTatami > 0
        ? (workedTatami / plannedDurationTatami) * 100
        : 0;

    // 🔹 Diferență între progres real și teoretic (regulă de 3 simplă)
    const diffPercentTatami = progresReal - progresTeoreticTatami;
    const diffMinutesTatami = (diffPercentTatami / 100) * plannedDurationTatami;
    const statusTatami = getScheduleStatus(diffMinutesTatami);

    // 🔹 ETA calculat pe baza diferenței de timp (nu pe ritm)
    const etaTatamiMin = endMin - diffMinutesTatami;
    const etaDiffText = statusTatami.text;
    const etaTextDisplay = `${minutesToTimeString(Math.round(etaTatamiMin))} (plan: ${endTimes[tatami]})`;

    // 🔹 Păstrăm cel mai întârziat tatami (doar cu întârziere)
    if (statusTatami.color === "red") {
        if (worstDelayMinutes === null || diffMinutesTatami < worstDelayMinutes) {
            worstDelayMinutes = diffMinutesTatami;
            worstTatami = tatami;
        }
    }

    // 🔹 Construim cardul de tatami
    const card = document.createElement("article");
    card.className = "tatami-card";

    const header = document.createElement("div");
    header.className = "tatami-header-row";

    const title = document.createElement("div");
    title.className = "tatami-title";
    title.innerHTML = `
        <h3>Tatami ${tatami}</h3>
        <small>Final planificat la ${endTimes[tatami]}</small>
    `;

    const statusChip = document.createElement("div");
    statusChip.className = "tatami-status-chip";
    const statusDot = document.createElement("span");
    statusDot.className = "status-dot";
    statusDot.classList.add(statusTatami.color);
    const statusText = document.createElement("span");
    statusText.textContent = statusTatami.text;

    statusChip.appendChild(statusDot);
    statusChip.appendChild(statusText);
    header.appendChild(title);
    header.appendChild(statusChip);

    const body = document.createElement("div");
    body.className = "tatami-body";

    const row = document.createElement("div");
    row.className = "tatami-percent-row";
    row.innerHTML = `
        <div class="tatami-percent">${progresReal.toFixed(1)}%</div>
        <div class="tatami-count">${printate} / ${total} categorii</div>
    `;

    const progressWrap = document.createElement("div");
    progressWrap.className = "progress";
    const progressInner = document.createElement("div");
    progressInner.className = "progress-bar";
    progressInner.style.width = `${Math.max(0, Math.min(100, progresReal))}%`;
    progressWrap.appendChild(progressInner);

    const extra = document.createElement("div");
    extra.className = "tatami-extra";
    extra.innerHTML = `
        <div>
            <span class="label">Progres teoretic:</span><br>
            <span>${progresTeoreticTatami.toFixed(1)}%</span>
        </div>
        <div>
            <span class="label">Final estimat:</span><br>
            <span>${etaTextDisplay}</span><br>
            <span class="label">Raport ETA:</span><br>
            <span>${etaDiffText}</span>
        </div>
    `;

    // DETALII CATEGORII (expand/collapse)
    const toggleRow = document.createElement("div");
    toggleRow.className = "category-toggle-row";
    toggleRow.innerHTML = `
        <span class="muted small">Detalii categorii</span>
        <button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;">
            Arată / ascunde
        </button>
    `;

    const chipList = document.createElement("div");
    chipList.className = "category-list";
    chipList.innerHTML = lista.map(item => {
        const cls = item.printat === 1 ? "chip printed" : "chip pending";
        const icon = item.printat === 1 ? "✔" : "•";
        return `<span class="${cls}" title="printat: ${item.printat}">${icon} ${item.nume}</span>`;
    }).join("");

    const toggleBtn = toggleRow.querySelector("button");
    toggleBtn.addEventListener("click", () => {
        chipList.classList.toggle("visible");
    });

    body.appendChild(row);
    body.appendChild(progressWrap);
    body.appendChild(extra);
    body.appendChild(toggleRow);
    body.appendChild(chipList);

    card.appendChild(header);
    card.appendChild(body);

    tatamiContainer.appendChild(card);
});

        // ================= WORST TATAMI (CEL MAI ÎN URMĂ) =================
        const worstBadge = document.getElementById("worstTatamiBadge");
        const worstLabel = document.getElementById("worstTatamiLabel");

        if (worstTatami !== null && worstDelayMinutes !== null && worstBadge && worstLabel) {
            worstBadge.classList.remove("hidden");
            worstLabel.textContent =
                `Tatami ${worstTatami} (${formatDurationHuman(worstDelayMinutes)} întârziere)`;
        } else if (worstBadge) {
            worstBadge.classList.add("hidden");
        }

    } catch (err) {
        console.error("Eroare la fetch:", err);
        const tatamiContainer = document.getElementById("tatamiContainer");
        if (tatamiContainer) {
            tatamiContainer.innerHTML = `
                <div class="placeholder">
                    Nu s-au putut încărca datele. Verifică dacă serverul de API rulează.
                </div>
            `;
        }
    }
}

// ================== AUTO-REFRESH ==================

function resetAutoRefresh() {
    if (refreshIntervalId) clearInterval(refreshIntervalId);
    const toggle = document.getElementById("autoRefreshToggle");
    if (!toggle || !toggle.checked) return;

    const sel = document.getElementById("refreshInterval");
    const sec = sel ? Number(sel.value) || 60 : 60;
    refreshIntervalId = setInterval(fetchDataAndRender, sec * 1000);
}

// ================== INIT ==================

document.addEventListener("DOMContentLoaded", () => {
    updateClock();
    setInterval(updateClock, 1000);

    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", fetchDataAndRender);
    }

    const autoToggle = document.getElementById("autoRefreshToggle");
    if (autoToggle) {
        autoToggle.addEventListener("change", resetAutoRefresh);
    }

    const intervalSelect = document.getElementById("refreshInterval");
    if (intervalSelect) {
        intervalSelect.addEventListener("change", resetAutoRefresh);
    }

    fetchDataAndRender();
    resetAutoRefresh();
});
