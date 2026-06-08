// ─── APP SHELL — refresh cycle, state, shared UI ─────────────────────────────

const REFRESH_MS = 30_000;

// The scoreboard tabs. If ALL of these are unreachable we treat it as an outage
// (keep last-good data + banner). Optional tabs (Meta/Signups/Bets) failing is silent.
const ESSENTIAL_TABS = [TABS.POOL, TABS.KNOCKOUT, TABS.ONFIRE];

const appState = {
  raw: null,
  computed: null,
  loading: false,
  error: null
};

// Called by each page: pass a render function, get auto-refresh for free
function initPage(renderFn) {
  appState.renderFn = renderFn;

  // First load
  doRefresh(renderFn);

  // Interval refresh — skip the tick while the tab is hidden (battery-friendly);
  // the visibilitychange handler refreshes the moment the user returns.
  setInterval(() => { if (!document.hidden) doRefresh(renderFn); }, REFRESH_MS);

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
    const essentialFailed = (raw.failedTabs || []).filter(t => ESSENTIAL_TABS.includes(t));
    const fullOutage = essentialFailed.length === ESSENTIAL_TABS.length;

    if (fullOutage && appState.computed) {
      // Total outage but we already have good data → keep showing it.
      renderFn(appState.computed);
      setErrorState("Could not reach the scoreboard — showing last known data.");
    } else {
      appState.raw = raw;
      appState.computed = computeAll(raw);
      appState.error = null;
      renderFn(appState.computed);
      setLastUpdated(raw.fetchedAt);
      setErrorState(fullOutage ? "Could not reach the scoreboard." : null);
    }
  } catch (err) {
    // fetchAllData no longer throws, but stay defensive against unexpected errors.
    appState.error = err;
    console.warn("Refresh failed:", err);
    renderFn(appState.computed || emptyComputed());
    setErrorState(err.message);
  } finally {
    appState.loading = false;
    setLoadingState(false);
    updateNowNextBar(appState.computed);
  }
}

// ─── Sticky NOW / NEXT bar (live phase, every page) ────────────────────────────
function ensureNowNextBar() {
  let bar = document.getElementById("nownext-bar");
  if (bar) return bar;
  bar = document.createElement("a");
  bar.id = "nownext-bar";
  bar.className = "nownext-bar";
  bar.href = "schedule.html";
  bar.hidden = true;
  bar.innerHTML = `<span class="nn-body"></span>
    <button type="button" class="nn-dismiss" aria-label="Dismiss">✕</button>`;
  bar.querySelector(".nn-dismiss").addEventListener("click", e => {
    e.preventDefault(); e.stopPropagation();
    sessionStorage.setItem("nn-dismissed", "1");
    bar.hidden = true; document.body.classList.remove("has-nownext");
  });
  document.body.appendChild(bar);
  return bar;
}
function updateNowNextBar(c) {
  const bar = ensureNowNextBar();
  const dismissed = sessionStorage.getItem("nn-dismissed") === "1";
  const live = c && c.phase === "live" ? (c.live[0] || null) : null;
  const next = c && c.phase === "live" ? (c.next[0] || null) : null;
  if (dismissed || (!live && !next)) {
    bar.hidden = true; document.body.classList.remove("has-nownext"); return;
  }
  const scoreOf = m => (m.cupsHome != null && m.cupsAway != null) ? ` ${m.cupsHome}–${m.cupsAway}` : "";
  let html = "";
  if (live) html += `<span class="nn-now"><span class="nn-dot"></span>NOW <b>${live.homeLabel} v ${live.awayLabel}</b>${scoreOf(live)}</span>`;
  if (next) html += `<span class="nn-next">NEXT <b>${next.homeLabel} v ${next.awayLabel}</b> · ${next.start}</span>`;
  bar.querySelector(".nn-body").innerHTML = html;
  bar.hidden = false;
  document.body.classList.add("has-nownext");
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
    <div class="match-row ${m.status}" data-home="${m.homeId || ""}" data-away="${m.awayId || ""}" data-slot="${m.slot}">
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

// Active nav link (covers the bottom nav and the "More" sheet)
(function markNav() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  const secondary = ["rules.html", "teams.html", "halloffame.html", "odds.html"];
  document.querySelectorAll("nav a, .more-sheet a").forEach(a => {
    const href = a.getAttribute("href")?.split("/").pop() || "index.html";
    if (href === path) a.classList.add("active");
  });
  // If we're on a secondary page, light up the "More" button instead.
  if (secondary.includes(path)) {
    document.getElementById("nav-more-btn")?.classList.add("active");
  }
})();

// Small DOM helper
function setText(id, text) {
  const el = document.getElementById(id);
  if (el != null && text != null) el.textContent = text;
}

// ─── Countdown (registration hero) ────────────────────────────────────────────
let _cdTarget = null;
let _cdTimer = null;
function updateCountdown(c) {
  const el = document.getElementById("countdown");
  if (!el) return;
  if (!c.registration) { el.hidden = true; _cdTarget = null; return; }
  el.hidden = false;
  _cdTarget = c.tournament.countdownTargetISO;
  renderCountdownOnce();
  if (!_cdTimer) _cdTimer = setInterval(renderCountdownOnce, 1000);
}
function renderCountdownOnce() {
  const el = document.getElementById("countdown");
  if (!el || el.hidden || !_cdTarget) return;
  const target = parseEventDate(_cdTarget).getTime();
  if (isNaN(target)) { el.hidden = true; return; }
  const diff = target - Date.now();
  if (diff <= 0) { el.innerHTML = `<div class="cd-done">🍻 It's tournament day.</div>`; return; }
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000) % 24;
  const m = Math.floor(diff / 60000) % 60;
  const s = Math.floor(diff / 1000) % 60;
  const cell = (n, l) => `<div class="cd-cell"><div class="cd-num">${String(n).padStart(2, "0")}</div><div class="cd-unit">${l}</div></div>`;
  el.innerHTML = `<div class="cd-label">Kicks off in</div>
    <div class="cd-grid">${cell(d, "days")}${cell(h, "hrs")}${cell(m, "min")}${cell(s, "sec")}</div>`;
}

// ─── Signup / poll CTA wiring ─────────────────────────────────────────────────
const SIGNUP_MSG = "Hi Sayor, I'd like to sign up for The Palace 3rd Edition (Fri 12 June). My team: ____";

// Where the signup CTA points: the party-chat poll if configured (Meta.pollUrl or
// POLL_URL), otherwise a prefilled WhatsApp message to the organiser.
function signupHref() {
  const fallbackPoll = (typeof POLL_URL !== "undefined") ? POLL_URL : "";
  const poll = appState.computed?.tournament?.pollUrl || fallbackPoll || "";
  if (poll) return poll;
  return (typeof whatsappUrl === "function") ? whatsappUrl(SIGNUP_MSG) : "#";
}

// Point every .poll-cta link (across pages) at the right destination. Safe to call
// repeatedly (e.g. after Meta loads and may set a poll URL).
// - If a party-chat poll URL is configured, the poll is the primary CTA and a
//   WhatsApp signup is offered as a secondary link.
// - Otherwise the CTA is the WhatsApp signup itself (always reachable).
function wirePollCtas() {
  if (typeof whatsappUrl !== "function") return;   // config.js not present on this page
  const fallbackPoll = (typeof POLL_URL !== "undefined") ? POLL_URL : "";
  const poll = appState.computed?.tournament?.pollUrl || fallbackPoll || "";
  const wa = whatsappUrl(SIGNUP_MSG);
  document.querySelectorAll("a.poll-cta").forEach(a => {
    if (poll) { a.href = poll; a.innerHTML = `<span class="poll-icon">💬</span>Vote in Party Chat Poll`; }
    else      { a.href = wa;   a.innerHTML = `<span class="poll-icon">📝</span>Sign up — message Sayor`; }
  });
  document.querySelectorAll(".signup-secondary").forEach(el => {
    if (poll) {
      el.hidden = false;
      el.innerHTML = `<a class="secondary-link" href="${wa}" target="_blank" rel="noopener">Or message Sayor to sign up →</a>`;
    } else { el.hidden = true; el.innerHTML = ""; }
  });
}
wirePollCtas();

// "More" bottom-sheet menu (mobile) — reveals Rules / Teams / Hall of Fame / Odds
(function setupMoreMenu() {
  const btn = document.getElementById("nav-more-btn");
  const sheet = document.getElementById("more-sheet");
  const overlay = document.getElementById("more-overlay");
  if (!btn || !sheet) return;

  const close = () => {
    sheet.hidden = true;
    if (overlay) overlay.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("more-open");
  };
  const open = () => {
    sheet.hidden = false;
    if (overlay) overlay.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    document.body.classList.add("more-open");
  };
  btn.addEventListener("click", () => (sheet.hidden ? open() : close()));
  overlay?.addEventListener("click", close);
  sheet.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
})();
