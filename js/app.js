// ─── APP SHELL — refresh cycle, state, shared UI ─────────────────────────────

const REFRESH_MS = 30_000;

const appState = {
  raw: null,
  computed: null,
  loading: false,
  error: null
};

// Called by each page: pass a render function, get auto-refresh for free
function initPage(renderFn) {
  // First load
  doRefresh(renderFn);

  // Interval refresh
  setInterval(() => doRefresh(renderFn), REFRESH_MS);

  // Refresh on tab focus
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") doRefresh(renderFn);
  });

  // Manual refresh button
  const btn = document.getElementById("refresh-btn");
  if (btn) btn.addEventListener("click", () => doRefresh(renderFn));
}

async function doRefresh(renderFn) {
  if (appState.loading) return;
  appState.loading = true;
  setLoadingState(true);

  try {
    const raw = await fetchAllData();
    appState.raw = raw;
    appState.computed = computeAll(raw);
    appState.error = null;
    renderFn(appState.computed);
    setLastUpdated(raw.fetchedAt);
    setErrorState(null);
  } catch (err) {
    appState.error = err;
    console.warn("Refresh failed:", err);
    // Keep last good data visible; if we have none yet, render empty states
    // so the page shows elegant placeholders instead of perpetual "Loading…".
    renderFn(appState.computed || emptyComputed());
    setErrorState(err.message);
  } finally {
    appState.loading = false;
    setLoadingState(false);
  }
}

function setLoadingState(loading) {
  const el = document.getElementById("loading-bar");
  if (el) el.classList.toggle("active", loading);
  const btn = document.getElementById("refresh-btn");
  if (btn) btn.classList.toggle("spinning", loading);
}

function setLastUpdated(ts) {
  const el = document.getElementById("last-updated");
  if (!el) return;
  const d = new Date(ts);
  el.textContent = `Updated ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function setErrorState(msg) {
  const el = document.getElementById("error-banner");
  if (!el) return;
  if (msg) {
    el.textContent = `⚠ Could not reach the scoreboard — showing last known data. (${msg})`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

// ─── Shared render helpers ────────────────────────────────────────────────────

function statusBadge(status) {
  if (status === "live")     return `<span class="badge badge-live">● LIVE</span>`;
  if (status === "final")    return `<span class="badge badge-final">Final</span>`;
  return `<span class="badge badge-upcoming">Upcoming</span>`;
}

function scoreLine(cupsHome, cupsAway, status) {
  if (status === "final" && cupsHome !== null && cupsAway !== null) {
    return `<span class="score">${cupsHome} – ${cupsAway}</span>`;
  }
  if (status === "live" && cupsHome !== null && cupsAway !== null) {
    return `<span class="score score-live">${cupsHome} – ${cupsAway}</span>`;
  }
  return `<span class="score score-none">vs</span>`;
}

function matchRow(homeId, awayId, cupsHome, cupsAway, status, label) {
  const hLabel = teamLabel(homeId);
  const aLabel = teamLabel(awayId || null);
  const score  = scoreLine(cupsHome, cupsAway, status);
  const badge  = statusBadge(status);
  return `
    <div class="match-row ${status}">
      ${label ? `<div class="match-label">${label}</div>` : ""}
      <div class="match-teams">
        <span class="team-name ${winnerClass(homeId, cupsHome, cupsAway, status)}">${hLabel}</span>
        ${score}
        <span class="team-name ${winnerClass(awayId, cupsAway, cupsHome, status)}">${aLabel}</span>
      </div>
      ${badge}
    </div>`;
}

function winnerClass(teamId, myCups, theirCups, status) {
  if (status !== "final") return "";
  const res = cupResult(myCups, theirCups); // "home" = my side won
  if (res === "home") return "winner";
  if (res === "away") return "loser";
  return ""; // draw or no data
}

function diffDisplay(diff) {
  if (diff > 0) return `<span class="diff pos">+${diff}</span>`;
  if (diff < 0) return `<span class="diff neg">${diff}</span>`;
  return `<span class="diff zero">0</span>`;
}

// Which side won, for an order-of-play match (handles KO sudden death + pool draws)
function oopWinnerId(m) {
  if (m.status !== "final") return null;
  if (m.winner) return m.winner;                       // KO winner (incl. sudden death)
  const res = cupResult(m.cupsHome, m.cupsAway);
  if (res === "home") return m.homeId;
  if (res === "away") return m.awayId;
  return null;                                          // draw (neither cleared)
}

// Renders one match row from a computed order-of-play object (with slot + time).
function oopMatchRow(m) {
  const score = scoreLine(m.cupsHome, m.cupsAway, m.status);
  const winId = oopWinnerId(m);
  const hCls  = m.status === "final" ? (winId === m.homeId ? "winner" : (winId ? "loser" : "")) : "";
  const aCls  = m.status === "final" ? (winId === m.awayId ? "winner" : (winId ? "loser" : "")) : "";
  const sdw   = m.suddenDeathWinner
    ? `<div class="sd-note">⚡ Sudden death: ${teamLabel(m.suddenDeathWinner)}</div>` : "";
  return `
    <div class="match-row ${m.status}">
      <div class="match-label">
        <span>#${m.slot} · ${m.phaseLabel}</span>
        <span class="match-time">${m.start}</span>
      </div>
      <div class="match-teams">
        <span class="team-name ${hCls}">${m.homeLabel}</span>
        ${score}
        <span class="team-name ${aCls}">${m.awayLabel}</span>
      </div>
      ${statusBadge(m.status)}
      ${sdw}
    </div>`;
}

// Active nav link
(function markNav() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("nav a").forEach(a => {
    const href = a.getAttribute("href")?.split("/").pop() || "index.html";
    if (href === path) a.classList.add("active");
  });
})();
