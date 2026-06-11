// ─── COMPUTATION LAYER ───────────────────────────────────────────────────────
// All logic derived from raw Sheet data + static config. No side-effects.

// ── Result rule (single source of truth) ──────────────────────────────────────
// Each cup number = a team's cups remaining at the final whistle.
//   • A team on 0 has been cleared → it loses; the other team wins.
//   • Neither on 0 → draw (time ran out, nobody cleared).
// Returns "home" | "away" | "draw" | null (missing/invalid data).
// Differential is handled separately as (cupsHome − cupsAway).
function cupResult(ch, ca) {
  if (ch == null || ca == null || Number.isNaN(ch) || Number.isNaN(ca)) return null;
  if (ch === 0 && ca === 0) return "draw";   // degenerate, shouldn't occur
  if (ca === 0) return "home";               // away cleared → home wins
  if (ch === 0) return "away";               // home cleared → away wins
  return "draw";                             // both still have cups → draw
}

// ── Pool Standings ────────────────────────────────────────────────────────────

// Head-to-head winner between two teams in a pool (round-robin → at most one
// meeting). Returns the winning team id, or null if drawn / not yet played.
function headToHead(poolMatches, idA, idB) {
  for (const m of poolMatches) {
    if (m.status !== "final") continue;
    const matched = (m.home === idA && m.away === idB) || (m.home === idB && m.away === idA);
    if (!matched) continue;
    const ch = parseInt(m.cupsHome, 10), ca = parseInt(m.cupsAway, 10);
    const res = cupResult(ch, ca);
    if (res === "home") return m.home;
    if (res === "away") return m.away;
    return null; // drawn
  }
  return null;
}

function computePoolStandings(poolMatches, pool) {
  const ids = poolTeams(pool).map(t => t.id);
  const stats = {};
  for (const id of ids) {
    stats[id] = { id, played: 0, wins: 0, draws: 0, losses: 0,
                  cupsFor: 0, cupsAgainst: 0, points: 0 };
  }

  for (const m of poolMatches) {
    if (m.pool !== pool || m.status !== "final") continue;
    const ch = parseInt(m.cupsHome, 10), ca = parseInt(m.cupsAway, 10);
    if (isNaN(ch) || isNaN(ca)) continue;
    const h = m.home, a = m.away;
    if (!stats[h] || !stats[a]) continue;

    stats[h].played++; stats[a].played++;
    stats[h].cupsFor   += ch; stats[h].cupsAgainst += ca;
    stats[a].cupsFor   += ca; stats[a].cupsAgainst += ch;

    const res = cupResult(ch, ca);
    if (res === "home")      { stats[h].wins++;  stats[h].points += 3; stats[a].losses++; }
    else if (res === "away") { stats[a].wins++;  stats[a].points += 3; stats[h].losses++; }
    else                     { stats[h].draws++; stats[h].points += 1;
                               stats[a].draws++; stats[a].points += 1; }
  }

  const rows = Object.values(stats).map(s => ({
    ...s,
    diff: s.cupsFor - s.cupsAgainst
  }));

  // Sort: points → head-to-head → cup diff → cupsFor → alphabetical.
  // Head-to-head only applies between teams level on points: if they met and one
  // beat the other, that team ranks higher (before falling back to differential).
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const h2h = headToHead(poolMatches, a.id, b.id);
    if (h2h === a.id) return -1;
    if (h2h === b.id) return 1;
    return (b.diff - a.diff) || (b.cupsFor - a.cupsFor) || a.id.localeCompare(b.id);
  });

  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

function computeAllStandings(poolMatches) {
  return {
    A: computePoolStandings(poolMatches, "A"),
    B: computePoolStandings(poolMatches, "B")
  };
}

// ── Bracket ───────────────────────────────────────────────────────────────────

function resolvePoolSlot(slot, standings) {
  const m = slot.match(/^([AB])(\d)$/);
  if (!m) return null;
  const pool = m[1], rank = parseInt(m[2], 10);
  return standings[pool]?.find(r => r.rank === rank)?.id ?? null;
}

// Dynamic semi-final seeding (the Palace rule) — keep each pool winner away
// from their own pool's QF winner where possible. QFW1 = winner of QF1, etc.
//   • A1 (SF1): QF winners from the SAME pool → A1 plays QFW2;
//               SPLIT pools → A1 plays whichever QF winner is from Pool B.
//   • B1 (SF2): SAME pool → B1 plays QFW1;
//               SPLIT pools → B1 plays whichever QF winner is from Pool A.
function sfOpponent(seat, winners) {
  const q1 = winners.QF1 || null, q2 = winners.QF2 || null;
  if (!q1 || !q2) return null;                  // both QFs must be decided first
  const p1 = teamById(q1)?.pool || null;
  const p2 = teamById(q2)?.pool || null;
  const split = p1 && p2 && p1 !== p2;
  if (seat === "A1") return split ? (p1 === "B" ? q1 : q2) : q2;
  return split ? (p1 === "A" ? q1 : q2) : q1;    // seat "B1"
}

function computeBracket(koRows, standings, poolComplete = { A: true, B: true }) {
  // Map KO sheet rows by id
  const koMap = {};
  for (const row of koRows) { koMap[row.id] = row; }

  const resolved = {}; // id → { ...bslot, homeId, awayId, winner }
  const winners  = {}; // id → winning team id

  const seedTeam = code => {
    const id = code ? resolveSlot(code, standings, winners, poolComplete) : null;
    return { id, label: id ? teamLabel(id) : slotDisplayLabel(code) };
  };

  for (const bslot of BRACKET_STRUCTURE) {
    const sheetRow = koMap[bslot.id] || {};

    // Matchups are code-driven — the organiser never hand-seeds the bracket, so
    // the Sheet's slot columns are ignored (and stay robust if they're shifted).
    // QFs come from the fixed structure; SFs from the dynamic seeding rule once
    // the QF winners are known (QF1/QF2 are processed first, so winners exist).
    let home, away;
    if (bslot.id === "SF1" || bslot.id === "SF2") {
      home = seedTeam(bslot.homeSlot);                       // A1 / B1
      const oppId = sfOpponent(bslot.id === "SF1" ? "A1" : "B1", winners);
      away = oppId ? { id: oppId, label: teamLabel(oppId) }
                   : { id: null, label: "QF Winner" };
    } else {
      home = seedTeam(bslot.homeSlot);
      away = seedTeam(bslot.awaySlot);
    }
    const homeId = home.id, awayId = away.id;

    // Result fields read by header (correctly placed even if slot cols aren't).
    const rawStatus = (sheetRow.status || "").trim().toLowerCase();
    const status = (rawStatus === "live" || rawStatus === "final") ? rawStatus : "upcoming";
    const ch = parseInt(sheetRow.cupsHome, 10);
    const ca = parseInt(sheetRow.cupsAway, 10);
    const sdw = matchTeamToken((sheetRow.suddenDeathWinner || "").trim());

    let winner = null;
    if (status === "final" && homeId && awayId) {
      if (sdw) {
        winner = sdw;
      } else {
        const res = cupResult(ch, ca);
        if (res === "home") winner = homeId;
        else if (res === "away") winner = awayId;
        // "draw" (neither cleared) → unresolved; needs suddenDeathWinner
      }
    }

    if (winner) winners[bslot.id] = winner;

    resolved[bslot.id] = {
      ...bslot,
      homeId, awayId,
      homeLabel: home.label, awayLabel: away.label,
      status,
      cupsHome: isNaN(ch) ? null : ch,
      cupsAway: isNaN(ca) ? null : ca,
      suddenDeathWinner: sdw,
      winner
    };
  }

  return resolved;
}

function resolveSlot(slot, standings, winners, poolComplete) {
  if (!slot) return null;
  const poolMatch = slot.match(/^([AB])(\d)$/);
  if (poolMatch) {
    // Only seed a pool slot once that pool's round-robin is complete —
    // otherwise the ranking is provisional and the matchup is meaningless.
    if (poolComplete && poolComplete[poolMatch[1]] === false) return null;
    return resolvePoolSlot(slot, standings);
  }
  const winnerMatch = slot.match(/^winner(QF\d|SF\d)$/);
  if (winnerMatch) return winners[winnerMatch[1]] ?? null;
  return null;
}

// Is this cell value naming a specific team? Accepts the team id ("luca-kenny")
// or the players label in any casing/spacing ("Luca & Kenny", "luca kenny").
function matchTeamToken(raw) {
  if (!raw) return null;
  if (teamById(raw)) return raw;
  const norm = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (!norm) return null;
  const t = TEAMS.find(tm =>
    tm.id.replace(/-/g, "") === norm || tm.players.join("").toLowerCase() === norm);
  return t ? t.id : null;
}

// Turn a free-typed seed code into the canonical form resolveSlot expects:
//   "A2", "Pool A #2", "a #2" → "A2";  "Winner QF1", "winnerqf1" → "winnerQF1".
function normalizeSlotCode(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[()]/g, "").trim();   // "(winner QF1)" → "winner QF1"
  const pool = cleaned.match(/^(?:pool\s*)?([AB])\s*#?\s*([1-5])$/i);
  if (pool) return pool[1].toUpperCase() + pool[2];
  const win = cleaned.match(/^winner\s*(QF\d|SF\d)$/i);
  if (win) return "winner" + win[1].toUpperCase();
  return null;
}

// Resolve one bracket slot, preferring what the organiser typed in the Sheet's
// slotHome/slotAway cell, then falling back to the hardcoded structure code.
// Returns { id, label }.
function resolveBracketSlot(sheetVal, structSlot, standings, winners, poolComplete) {
  const raw = (sheetVal || "").trim();

  // 1) An explicit team typed into the cell → always honoured immediately.
  const teamId = matchTeamToken(raw);
  if (teamId) return { id: teamId, label: teamLabel(teamId) };

  // 2) A seed code — from the cell if present, else the structure default.
  //    Codes stay gated (pool slots only resolve once that pool is complete).
  const code = normalizeSlotCode(raw) || (raw ? null : structSlot);
  if (code) {
    const id = resolveSlot(code, standings, winners, poolComplete);
    return { id, label: id ? teamLabel(id) : slotDisplayLabel(code) };
  }

  // 3) Non-empty but unrecognised text → display it verbatim.
  return { id: null, label: raw };
}

// ── On Fire ───────────────────────────────────────────────────────────────────

function computeOnFire(onfireRows) {
  return onfireRows
    .map(row => {
      const player = row.player?.trim();
      if (!player) return null;
      const count = parseInt(row.count, 10) || 0;
      const team  = TEAMS.find(t => t.players.includes(player));
      return { player, count, teamId: team?.id ?? null,
               teamLabel: team ? team.players.join(" & ") : "?",
               pool: team?.pool ?? "?" };
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count || a.player.localeCompare(b.player));
}

// ── Schedule helpers ──────────────────────────────────────────────────────────

function poolMatchesForDisplay(poolMatches, pool) {
  return poolMatches
    .filter(m => m.pool === pool)
    .sort((a, b) => parseInt(a.order, 10) - parseInt(b.order, 10))
    .map(m => ({
      id: m.id,
      pool: m.pool,
      order: parseInt(m.order, 10),
      homeId: m.home,
      awayId: m.away,
      status: m.status || "upcoming",
      cupsHome: m.cupsHome !== "" && !isNaN(parseInt(m.cupsHome, 10))
                  ? parseInt(m.cupsHome, 10) : null,
      cupsAway: m.cupsAway !== "" && !isNaN(parseInt(m.cupsAway, 10))
                  ? parseInt(m.cupsAway, 10) : null
    }));
}

const PHASE_LABEL = { A: "Pool A", B: "Pool B", QF: "Quarter-Final",
                      SF: "Semi-Final", Final: "Final" };

// The chronological run-of-show, driven entirely by the Sheet: pool matches in
// their "order" column, then the knockouts (QF1→F), each carrying its own
// matchStart time. Merged with live status, scores, and resolved bracket teams
// into one uniform shape per match. (config.SCHEDULE is no longer used for this.)
function computeOrderOfPlay(poolMatches, bracket, koRows) {
  const koMap = {};
  for (const r of (koRows || [])) koMap[r.id] = r;
  const cups = v => (v !== "" && v != null && !isNaN(parseInt(v, 10))) ? parseInt(v, 10) : null;

  // Pool matches in the Sheet's run order, carrying their own matchStart time.
  const pool = [...poolMatches]
    .sort((a, b) => (parseInt(a.order, 10) || 0) - (parseInt(b.order, 10) || 0))
    .map(m => {
      const p = (m.pool === "A" || m.pool === "B") ? m.pool : (m.id.startsWith("PA") ? "A" : "B");
      const st = (m.status || "").trim().toLowerCase();
      return {
        id: m.id, isKO: false, start: (m.matchStart || "").trim(),
        phase: p, phaseLabel: PHASE_LABEL[p],
        homeId: m.home || null, awayId: m.away || null,
        homeLabel: m.home ? teamLabel(m.home) : "TBD",
        awayLabel: m.away ? teamLabel(m.away) : "TBD",
        status: (st === "live" || st === "final") ? st : "upcoming",
        cupsHome: cups(m.cupsHome), cupsAway: cups(m.cupsAway),
        winner: null, suddenDeathWinner: null
      };
    });

  // Knockouts in their fixed run order; time from the Sheet's matchStart.
  const KO_ORDER = ["QF1", "QF2", "SF1", "SF2", "F"];
  const ko = KO_ORDER.filter(id => bracket[id]).map(id => {
    const b = bracket[id];
    return {
      id, isKO: true, start: (koMap[id]?.matchStart || "").trim(),
      phase: b.round, phaseLabel: PHASE_LABEL[b.round] || b.round,
      homeId: b.homeId, awayId: b.awayId,
      homeLabel: b.homeLabel, awayLabel: b.awayLabel,
      status: b.status, cupsHome: b.cupsHome, cupsAway: b.cupsAway,
      winner: b.winner, suddenDeathWinner: b.suddenDeathWinner
    };
  });

  // Sequential slot numbers (#1..#25) follow the combined run order.
  return [...pool, ...ko].map((m, i) => ({ slot: i + 1, ...m }));
}

// ── Event config (static TOURNAMENT defaults + live Meta overrides) ────────────
// Meta values win when present; everything works off config.js when Meta is empty.
function resolveTournament(meta) {
  meta = meta || {};
  const g = k => meta[k.toLowerCase()];   // meta keys are stored lowercased
  const t = { ...TOURNAMENT };
  const phase = (g("phase") || t.phase || "registration").toLowerCase();
  t.phase = ["registration", "live", "complete"].includes(phase) ? phase : t.phase;
  if (g("venue"))         t.venue     = g("venue");
  // Venue may be a maps URL. Render it as a link titled venueName (Meta key),
  // falling back to a generic label; plain-text venues display as-is.
  const venueRaw = (t.venue || "").trim();
  t.venueUrl  = /^https?:\/\//i.test(venueRaw) ? venueRaw : "";
  t.venueName = g("venueName") || (t.venueUrl ? "" : t.venue);
  if (g("dateText"))      t.date      = g("dateText");
  if (g("startTimeText")) t.startTime = g("startTimeText");
  t.countdownTargetISO = g("countdownTargetISO") || COUNTDOWN_DEFAULT_ISO;
  const spots = parseInt(g("spotsTotal"), 10);
  t.spotsTotal = spots > 0 ? spots : (t.spotsTotal || 20);
  let poll = g("pollUrl") || POLL_URL || "";
  if (poll && !/^https?:\/\//i.test(poll) && poll !== "#") poll = "https://" + poll; // tolerate "wa.me/…"
  t.pollUrl    = poll;
  t.oddsNote   = g("oddsNote") || "";
  t.betsLockISO = g("betsLockISO") || BETS_LOCK_ISO;
  t.bettingOpen = (g("bettingOpen") || "").toLowerCase(); // "yes" | "no" | ""
  return t;
}

// ── Palace Odds (pari-mutuel pool) ─────────────────────────────────────────────
// Pure functions. Pool split: each winning $1 returns (Net / pool_on_winner).

function normalizeMarketKey(s) {
  const k = (s || "").toLowerCase().replace(/[^a-z]/g, "");
  if (k.includes("onfire") || k.includes("fire")) return "onfire";
  if (k.includes("winner") || k.includes("tournament") || k.includes("champion")) return "winner";
  return k;
}

// Match a free-typed selection to a known selection (case/spacing/punct-insensitive).
function matchSelection(raw, selections) {
  if (!raw) return null;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const n = norm(raw);
  return selections.find(s => norm(s) === n) || null;
}

// Compute one market's pool odds from the raw Bets rows.
function computeMarketOdds(bets, marketKey, selections, takeout) {
  takeout = takeout || 0;
  const pool = {}; selections.forEach(s => { pool[s] = 0; });
  const matched = [];
  let total = 0, betCount = 0;

  for (const b of bets) {
    if (normalizeMarketKey(b.market) !== marketKey) continue;
    const stake = parseFloat(b.stake);
    if (isNaN(stake) || stake <= 0) continue;
    const sel = matchSelection(b.selection, selections);
    if (!sel) continue;                       // unknown selection → ignored
    pool[sel] += stake; total += stake; betCount++;
    matched.push({ bettor: (b.bettor || "").trim(), selection: sel, stake });
  }

  const net = total * (1 - takeout);
  const rows = selections.map(sel => {
    const p = pool[sel];
    return {
      selection: sel,
      pool: p,
      backers: matched.filter(m => m.selection === sel).length,
      decimal: p > 0 ? net / p : null,                 // multiplier (stake included)
      impliedPct: total > 0 ? p / total : 0,
      projectedReturnPerUnit: p > 0 ? net / p : null
    };
  });
  // Backed selections first (largest pool = shortest odds), unbacked last.
  rows.sort((a, b) => (b.pool - a.pool) || a.selection.localeCompare(b.selection));

  const backed = rows.filter(r => r.pool > 0);
  return {
    key: marketKey, totalPool: total, betCount, net, rows, matched,
    onlyBacker: backed.length === 1,
    favourite: backed.length ? backed[0].selection : null
  };
}

// Settle a market once the winning selection(s) are known. Winners may be MORE
// than one selection (e.g. both members of the champion team for the Winner
// market) — the pot is split across the combined winning pool so it stays
// balanced. Returns null until winners are known.
function settleMarket(m, winnerNames) {
  if (!winnerNames || !winnerNames.length) return null;
  const winners = winnerNames.filter(Boolean);
  const combinedPool = winners.reduce((s, n) => {
    const row = m.rows.find(r => r.selection === n);
    return s + (row ? row.pool : 0);
  }, 0);
  const payout = combinedPool > 0 ? m.net / combinedPool : null;
  const winningBets = m.matched
    .filter(b => winners.includes(b.selection))
    .map(b => ({ bettor: b.bettor, selection: b.selection, stake: b.stake,
                 return: payout ? b.stake * payout : b.stake }));
  return { winners, combinedPool, payout, refunded: combinedPool === 0, winningBets };
}

// Is betting open? Open before the lock time unless manually closed; a manual
// "yes" can force it open. Selection existence (teams confirmed) is gated by phase
// in the page layer.
function bettingState(tournament) {
  const lockMs = parseEventDate(tournament.betsLockISO).getTime();
  const now = Date.now();
  const manual = tournament.bettingOpen; // "yes" | "no" | ""
  const beforeLock = isNaN(lockMs) ? true : now < lockMs;
  const open = manual === "no" ? false : (manual === "yes" ? true : beforeLock);
  return { open, lockISO: tournament.betsLockISO, lockMs, beforeLock };
}

// ── Recap stats (post-event) ───────────────────────────────────────────────────
// Pure helpers over the existing data. Do not mutate anything.
function computeRecap(poolMatches, knockout, onfireRows) {
  const all = [...(poolMatches || []), ...(knockout || [])];
  let mostCups = null;          // most cups by one team in a single match
  let biggestBlowout = null;    // largest cup differential
  let totalCups = 0;

  for (const m of all) {
    if (m.status !== "final") continue;
    const ch = parseInt(m.cupsHome, 10), ca = parseInt(m.cupsAway, 10);
    if (isNaN(ch) || isNaN(ca)) continue;
    totalCups += ch + ca;
    const hi = Math.max(ch, ca);
    if (!mostCups || hi > mostCups.cups) {
      const homeHi = ch >= ca;
      mostCups = { cups: hi, team: homeHi ? m.home : m.away, opp: homeHi ? m.away : m.home, id: m.id };
    }
    const diff = Math.abs(ch - ca);
    if (!biggestBlowout || diff > biggestBlowout.diff) {
      const winnerHome = ch > ca;
      biggestBlowout = { diff, winner: winnerHome ? m.home : m.away, loser: winnerHome ? m.away : m.home, score: `${hi}–${Math.min(ch, ca)}`, id: m.id };
    }
  }

  const onfire = computeOnFire(onfireRows || []);
  const fireChamp = onfire.find(p => p.count > 0) || null;
  const totalActivations = onfire.reduce((s, p) => s + p.count, 0);

  return { mostCups, biggestBlowout, totalCups, fireChamp, totalActivations };
}

// ── Teams (from the Sheet's "Teams" tab) ───────────────────────────────────────
// Columns (case-insensitive): player1 | player2 | pool? | code? | photo?.
// The id is an explicit `code`/`id` if given, else the derived slug
// (player1-player2). Pool may be blank ("teams drawn, pools later").
function parseSheetTeams(rows) {
  const get = (row, name) => {
    const key = Object.keys(row).find(k => k.toLowerCase() === name);
    return key ? String(row[key] || "").trim() : "";
  };
  return (rows || []).map(r => {
    const players = [get(r, "player1"), get(r, "player2")].filter(Boolean);
    if (!players.length) return null;
    const code  = get(r, "code") || get(r, "id") || teamCode(players);
    const pool  = (get(r, "pool").toUpperCase().match(/[AB]/) || [null])[0];
    const photo = get(r, "photo");
    const team  = { id: code, players, pool };
    if (photo) team.photo = photo;
    return team;
  }).filter(Boolean);
}

// ── Master compute ────────────────────────────────────────────────────────────

// Empty-but-valid computed shape — used before first successful load or when
// the Sheet is unreachable, so pages render placeholders rather than "Loading…".
function emptyComputed() {
  // Seed On Fire from the full roster so the leaderboard shows all 20 at 0.
  const onfire = TEAMS.flatMap(t => t.players).map(player => ({ player, count: "0" }));
  const empty = { poolMatches: [], knockout: [], onfire, fetchedAt: Date.now() };
  return computeAll(empty);
}

function computeAll(data) {
  // Teams come from the Sheet's "Teams" tab when present; otherwise the config
  // fallback roster stays in place. This MUST run before standings/bracket,
  // which read poolTeams()/teamLabel() off the global TEAMS registry.
  const sheetTeams = parseSheetTeams(data.teams);
  if (sheetTeams.length) TEAMS = sheetTeams;

  // Normalise PoolMatches team references to canonical team ids. The Sheet may
  // type "Nathaniel-Toni" while the id is "nathaniel-toni" — without this,
  // standings/head-to-head key on a name that doesn't exist and come out empty.
  const poolMatches = (data.poolMatches || []).map(m => ({
    ...m,
    home: matchTeamToken(m.home) || m.home,
    away: matchTeamToken(m.away) || m.away
  }));

  // Derive each team's pool from the fixtures when the Teams tab leaves it blank
  // (who actually plays in Pool A vs Pool B is the single source of truth).
  const poolByTeam = {};
  for (const m of poolMatches) {
    if (m.pool === "A" || m.pool === "B") {
      if (m.home && !poolByTeam[m.home]) poolByTeam[m.home] = m.pool;
      if (m.away && !poolByTeam[m.away]) poolByTeam[m.away] = m.pool;
    }
  }
  TEAMS.forEach(t => { if (!t.pool && poolByTeam[t.id]) t.pool = poolByTeam[t.id]; });

  const standings = computeAllStandings(poolMatches);

  // Pool completion flags — a pool's slots only seed once all 10 are final.
  const isFinal = m => (m.status || "").trim().toLowerCase() === "final";
  const poolAFinal = poolMatches.filter(m => m.pool === "A" && isFinal(m)).length === 10;
  const poolBFinal = poolMatches.filter(m => m.pool === "B" && isFinal(m)).length === 10;

  const bracket     = computeBracket(data.knockout, standings, { A: poolAFinal, B: poolBFinal });
  const onfire      = computeOnFire(data.onfire);
  const poolA       = poolMatchesForDisplay(poolMatches, "A");
  const poolB       = poolMatchesForDisplay(poolMatches, "B");
  const orderOfPlay = computeOrderOfPlay(poolMatches, bracket, data.knockout);
  const live        = orderOfPlay.filter(m => m.status === "live");
  const next        = orderOfPlay.filter(m => m.status === "upcoming").slice(0, 3);

  // Resolved event config + phase (Meta over TOURNAMENT defaults).
  const tournament   = resolveTournament(data.meta);
  const registration = tournament.phase === "registration";
  const complete     = tournament.phase === "complete";

  // Signups: individual competitors (people sign up as players; teams drawn later).
  const signups = (data.signups || [])
    .map(r => ({ player: (r.player || r.player1 || "").trim() }))
    .filter(s => s.player);

  // ── Palace Odds ──
  const bets = (data.bets || []).map(b => ({
    timestamp: (b.timestamp || "").trim(),
    bettor: (b.bettor || "").trim(),
    market: b.market, selection: b.selection, stake: b.stake
  }));
  // Per-market betting selections:
  //  • Winner  → TEAMS (team labels, e.g. "Xavier & Omar").
  //  • On Fire → individual competitors (Signups tab; roster fallback).
  const competitors = signups.length
    ? [...new Set(signups.map(s => s.player))]
    : marketSelections("onfire");
  const teamSelections = TEAMS.map(t => t.players.join(" & "));
  const selectionsFor = key => (key === "winner" ? teamSelections : competitors);

  // House shorthand: a Winner bet typed as a single PLAYER's name counts as a
  // bet on that player's team ("Zackary" → "Zackary & Tamu"). Each player is on
  // exactly one team, so the mapping is unambiguous. Team labels/codes still
  // match directly via matchSelection; this only catches what it can't.
  const normName = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const playerToTeam = {};
  TEAMS.forEach(t => t.players.forEach(p => { playerToTeam[normName(p)] = t.players.join(" & "); }));
  const betsForOdds = bets.map(b => {
    if (normalizeMarketKey(b.market) !== "winner") return b;
    if (matchSelection(b.selection, teamSelections)) return b;
    const viaPlayer = playerToTeam[normName(b.selection)];
    return viaPlayer ? { ...b, selection: viaPlayer } : b;
  });

  const odds = {};
  for (const m of MARKETS) {
    odds[m.key] = computeMarketOdds(betsForOdds, m.key, selectionsFor(m.key), TAKEOUT);
  }
  const betting = bettingState(tournament);

  // Winning selection per market:
  //  • Winner  → the champion TEAM's label (a single selection).
  //  • On Fire → the single top player.
  const champCode = bracket.F && bracket.F.winner ? bracket.F.winner : null;
  const winnerWinners = champCode ? [teamLabel(champCode)] : [];
  const onfireWinner = (onfire[0] && onfire[0].count > 0) ? [onfire[0].player] : [];
  odds.winner.settlement = settleMarket(odds.winner, winnerWinners);
  odds.onfire.settlement = settleMarket(odds.onfire, onfireWinner);

  const results = {
    winner: champCode ? teamLabel(champCode) : null,   // champion team label (recap/banner)
    winnerTeam: champCode || null,                     // champion team id/code
    onfire: onfireWinner[0] || null
  };

  const recap = computeRecap(poolMatches, data.knockout, data.onfire);

  return { standings, bracket, onfire, poolA, poolB, orderOfPlay, live, next,
           poolAFinal, poolBFinal,
           tournament, phase: tournament.phase, registration, complete,
           signups, bets, odds, betting, results, recap,
           teams: TEAMS.slice(),
           teamsDrawn: sheetTeams.length > 0,   // true once the Sheet's Teams tab is filled
           fetchedAt: data.fetchedAt };
}
