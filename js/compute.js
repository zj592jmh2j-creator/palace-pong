// ─── COMPUTATION LAYER ───────────────────────────────────────────────────────
// All logic derived from raw Sheet data + static config. No side-effects.

// ── Pool Standings ────────────────────────────────────────────────────────────

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

    if (ch > ca)      { stats[h].wins++;  stats[h].points += 3; stats[a].losses++; }
    else if (ca > ch) { stats[a].wins++;  stats[a].points += 3; stats[h].losses++; }
    else              { stats[h].draws++; stats[h].points += 1;
                        stats[a].draws++; stats[a].points += 1; }
  }

  const rows = Object.values(stats).map(s => ({
    ...s,
    diff: s.cupsFor - s.cupsAgainst
  }));

  // Sort: points → diff → cupsFor → alphabetical (deterministic)
  rows.sort((a, b) =>
    b.points   - a.points   ||
    b.diff     - a.diff     ||
    b.cupsFor  - a.cupsFor  ||
    a.id.localeCompare(b.id)
  );

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

function computeBracket(koRows, standings, poolComplete = { A: true, B: true }) {
  // Map KO sheet rows by id
  const koMap = {};
  for (const row of koRows) { koMap[row.id] = row; }

  const resolved = {}; // id → { ...bslot, homeId, awayId, winner, sheetRow }
  const winners  = {}; // id → winning team id

  for (const bslot of BRACKET_STRUCTURE) {
    const sheetRow = koMap[bslot.id] || {};

    const homeId = resolveSlot(bslot.homeSlot, standings, winners, poolComplete);
    const awayId = resolveSlot(bslot.awaySlot, standings, winners, poolComplete);

    const status = sheetRow.status || "upcoming";
    const ch = parseInt(sheetRow.cupsHome, 10);
    const ca = parseInt(sheetRow.cupsAway, 10);
    const sdw = sheetRow.suddenDeathWinner?.trim() || null;

    let winner = null;
    if (status === "final" && homeId && awayId) {
      if (sdw) {
        winner = sdw;
      } else if (!isNaN(ch) && !isNaN(ca)) {
        if (ch > ca) winner = homeId;
        else if (ca > ch) winner = awayId;
        // tied without sdw in KO = unresolved (shouldn't happen)
      }
    }

    if (winner) winners[bslot.id] = winner;

    resolved[bslot.id] = {
      ...bslot,
      homeId, awayId,
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

// The chronological run-of-show: the fixed SCHEDULE merged with live status,
// scores, and resolved bracket teams. One uniform shape for every match.
function computeOrderOfPlay(poolMatches, bracket) {
  const poolById = {};
  for (const m of poolMatches) poolById[m.id] = m;

  return SCHEDULE.map(s => {
    const b = bracket[s.id]; // present only for knockout ids
    const base = { slot: s.slot, id: s.id, start: s.start, end: s.end };

    if (b) {
      const bs = BRACKET_STRUCTURE.find(x => x.id === s.id);
      return {
        ...base, isKO: true,
        phase: b.round, phaseLabel: PHASE_LABEL[b.round] || b.round,
        homeId: b.homeId, awayId: b.awayId,
        homeLabel: b.homeId ? teamLabel(b.homeId) : slotDisplayLabel(bs.homeSlot),
        awayLabel: b.awayId ? teamLabel(b.awayId) : slotDisplayLabel(bs.awaySlot),
        status: b.status,
        cupsHome: b.cupsHome, cupsAway: b.cupsAway,
        winner: b.winner, suddenDeathWinner: b.suddenDeathWinner
      };
    }

    const m = poolById[s.id];
    const pool = s.id.startsWith("PA") ? "A" : "B";
    const ch = m && m.cupsHome !== "" && !isNaN(parseInt(m.cupsHome, 10)) ? parseInt(m.cupsHome, 10) : null;
    const ca = m && m.cupsAway !== "" && !isNaN(parseInt(m.cupsAway, 10)) ? parseInt(m.cupsAway, 10) : null;
    return {
      ...base, isKO: false,
      phase: pool, phaseLabel: PHASE_LABEL[pool],
      homeId: m?.home ?? null, awayId: m?.away ?? null,
      homeLabel: m ? teamLabel(m.home) : "TBD",
      awayLabel: m ? teamLabel(m.away) : "TBD",
      status: m?.status || "upcoming",
      cupsHome: ch, cupsAway: ca,
      winner: null, suddenDeathWinner: null
    };
  });
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
  const standings = computeAllStandings(data.poolMatches);

  // Pool completion flags — a pool's slots only seed once all 10 are final.
  const poolAFinal = data.poolMatches.filter(m => m.pool === "A" && m.status === "final").length === 10;
  const poolBFinal = data.poolMatches.filter(m => m.pool === "B" && m.status === "final").length === 10;

  const bracket     = computeBracket(data.knockout, standings, { A: poolAFinal, B: poolBFinal });
  const onfire      = computeOnFire(data.onfire);
  const poolA       = poolMatchesForDisplay(data.poolMatches, "A");
  const poolB       = poolMatchesForDisplay(data.poolMatches, "B");
  const orderOfPlay = computeOrderOfPlay(data.poolMatches, bracket);
  const live        = orderOfPlay.filter(m => m.status === "live");
  const next        = orderOfPlay.filter(m => m.status === "upcoming").slice(0, 3);

  return { standings, bracket, onfire, poolA, poolB, orderOfPlay, live, next,
           poolAFinal, poolBFinal, fetchedAt: data.fetchedAt };
}
