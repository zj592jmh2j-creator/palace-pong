// ─── SINGLE CONFIG LINE TO CHANGE BEFORE THE EVENT ──────────────────────────
const SHEET_ID = "1r2geaaPt8pU1Jo5BFY38ZOz-d3WU0d7_Rt7FP6tkNmU";
// ─────────────────────────────────────────────────────────────────────────────

// ─── WhatsApp contact (for "Sign up" & "Place bets" links) ──────────────────
// Enter the organiser's number in international format, digits only —
// country code + number, NO "+", spaces or dashes. e.g. "447911123456".
const WHATSAPP_NUMBER = "15149843611";   // Sayor's WhatsApp (intl format, digits only)
function whatsappUrl(message) {
  if (!WHATSAPP_NUMBER) return "#";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message || "")}`;
}
// ─────────────────────────────────────────────────────────────────────────────

const TOURNAMENT = {
  name: "The Palace",
  edition: "3rd Edition",
  venue: "Outdoors — venue to be announced",
  date: "Friday 12 June 2026",
  startTime: "12:00",
  // "registration" = pre-tournament (teams TBD, schedule/standings stay-tuned).
  // Switch to "live" once the Sheet is populated for this edition.
  phase: "registration",
  cupsPerTeam: 6,
  formation: "3-2-1"
};

// Convenience flag used across pages to switch into pre-tournament UI.
const REGISTRATION_MODE = TOURNAMENT.phase === "registration";

// NOTE: TEAMS below is the 2nd-Edition roster, retained only for the Hall of
// Fame / reigning-champion lookups. The 3rd-Edition rosters are TBD — the Teams
// page shows placeholders while REGISTRATION_MODE is on. Replace these once the
// new sign-ups are confirmed, then set TOURNAMENT.phase = "live".
const TEAMS = [
  { id: "omar-toni",       pool: "A", players: ["Omar", "Toni"] },
  { id: "luca-kenny",      pool: "A", players: ["Luca", "Kenny"] },
  { id: "kevin-guillermo", pool: "A", players: ["Kevin", "Guillermo"] },
  { id: "xavier-rita",     pool: "A", players: ["Xavier", "Rita"] },
  { id: "martin-bianca",   pool: "A", players: ["Martin", "Bianca"] },
  { id: "alwin-leonie",    pool: "B", players: ["Alwin", "Leonie"] },
  { id: "lalaina-daniel",  pool: "B", players: ["Lalaina", "Daniel"] },
  { id: "zackary-tamu",    pool: "B", players: ["Zackary", "Tamu"] },
  { id: "nata-ashley",     pool: "B", players: ["Nata", "Ashley"] },
  { id: "paolo-malik",     pool: "B", players: ["Paolo", "Malik"] }
];

// Hardcoded bracket topology — organiser never edits this
const BRACKET_STRUCTURE = [
  { id: "QF1", round: "QF",    label: "Quarter-Final 1", homeSlot: "A2", awaySlot: "B3" },
  { id: "QF2", round: "QF",    label: "Quarter-Final 2", homeSlot: "B2", awaySlot: "A3" },
  { id: "SF1", round: "SF",    label: "Semi-Final 1",    homeSlot: "A1", awaySlot: "winnerQF1" },
  { id: "SF2", round: "SF",    label: "Semi-Final 2",    homeSlot: "B1", awaySlot: "winnerQF2" },
  { id: "F",   round: "Final", label: "The Final",       homeSlot: "winnerSF1", awaySlot: "winnerSF2" }
];

// Fixed order of play + scheduled times — known in advance, never edited live.
// `id` matches the match id in the Sheet (Final = bracket id "F").
const SCHEDULE = [
  { slot: 1,  id: "PA7",   start: "12:30 PM", end: "12:42 PM" },
  { slot: 2,  id: "PB7",   start: "12:42 PM", end: "12:54 PM" },
  { slot: 3,  id: "PA8",   start: "12:54 PM", end: "1:06 PM"  },
  { slot: 4,  id: "PB8",   start: "1:06 PM",  end: "1:18 PM"  },
  { slot: 5,  id: "PA4",   start: "1:18 PM",  end: "1:30 PM"  },
  { slot: 6,  id: "PB4",   start: "1:30 PM",  end: "1:42 PM"  },
  { slot: 7,  id: "PA5",   start: "1:42 PM",  end: "1:54 PM"  },
  { slot: 8,  id: "PB5",   start: "1:54 PM",  end: "2:06 PM"  },
  { slot: 9,  id: "PA3",   start: "2:06 PM",  end: "2:18 PM"  },
  { slot: 10, id: "PB3",   start: "2:18 PM",  end: "2:30 PM"  },
  { slot: 11, id: "PA9",   start: "2:30 PM",  end: "2:42 PM"  },
  { slot: 12, id: "PB9",   start: "2:42 PM",  end: "2:54 PM"  },
  { slot: 13, id: "PA2",   start: "2:54 PM",  end: "3:06 PM"  },
  { slot: 14, id: "PB2",   start: "3:06 PM",  end: "3:18 PM"  },
  { slot: 15, id: "PA6",   start: "3:18 PM",  end: "3:30 PM"  },
  { slot: 16, id: "PB6",   start: "3:30 PM",  end: "3:42 PM"  },
  { slot: 17, id: "PA1",   start: "3:42 PM",  end: "3:54 PM"  },
  { slot: 18, id: "PB1",   start: "3:54 PM",  end: "4:06 PM"  },
  { slot: 19, id: "PA10",  start: "4:06 PM",  end: "4:18 PM"  },
  { slot: 20, id: "PB10",  start: "4:18 PM",  end: "4:30 PM"  },
  { slot: 21, id: "QF1",   start: "4:30 PM",  end: "4:42 PM"  },
  { slot: 22, id: "QF2",   start: "4:42 PM",  end: "4:54 PM"  },
  { slot: 23, id: "SF1",   start: "4:54 PM",  end: "5:06 PM"  },
  { slot: 24, id: "SF2",   start: "5:06 PM",  end: "5:18 PM"  },
  { slot: 25, id: "F",     start: "5:18 PM",  end: "5:30 PM"  }
];

function scheduleById(id) {
  return SCHEDULE.find(s => s.id === id) || null;
}

function teamById(id) {
  return TEAMS.find(t => t.id === id) || null;
}

function teamLabel(id) {
  const t = teamById(id);
  return t ? t.players.join(" & ") : (id || "TBD");
}

function poolTeams(pool) {
  return TEAMS.filter(t => t.pool === pool);
}

// Human label for an unresolved bracket slot, e.g. "Pool A #2", "Winner QF1".
function slotDisplayLabel(slot) {
  if (!slot) return "TBD";
  const pool = slot.match(/^([AB])(\d)$/);
  if (pool) return `Pool ${pool[1]} #${pool[2]}`;
  const win = slot.match(/^winner(QF\d|SF\d)$/);
  if (win) return `Winner ${win[1]}`;
  return slot;
}
