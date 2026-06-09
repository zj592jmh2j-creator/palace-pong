// ─── DATA FETCH / PARSE LAYER ────────────────────────────────────────────────
// Reads all live data from a public Google Sheet via the gviz CSV endpoint.
// No API key required — Sheet must be shared "Anyone with link → Viewer".

const TABS = {
  POOL:     "PoolMatches",
  KNOCKOUT: "Knockout",
  ONFIRE:   "OnFire",
  META:     "Meta",      // key/value event config (optional)
  SIGNUPS:  "Signups",   // player (one row per competitor) (optional)
  BETS:     "Bets",      // timestamp | bettor | market | selection | stake (optional)
  TEAMS:    "Teams"      // player1 | player2 | pool? | code? | photo? (optional)
};

function gvizUrl(tabName) {
  return (
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}` +
    `/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}&headers=1&_=${Date.now()}`
  );
}

async function fetchTab(tabName) {
  const resp = await fetch(gvizUrl(tabName), { cache: "no-store" });
  if (!resp.ok) throw new Error(`Sheet fetch failed (${resp.status}) for tab "${tabName}"`);
  const text = await resp.text();
  // gviz sometimes answers a missing tab with a 200 + HTML error page; guard it.
  if (/^\s*<!doctype html|^\s*<html/i.test(text)) {
    throw new Error(`Tab "${tabName}" not found (gviz returned HTML)`);
  }
  return parseCSV(text);
}

function parseCSV(text) {
  // Parse rows as plain arrays — using PapaParse for robust quoted-field handling
  // when available, our own splitter otherwise. We do the header→object mapping
  // ourselves so that extra/blank trailing columns in the Sheet can't corrupt it.
  // (PapaParse's header:true mode mis-handles duplicate empty column names and
  //  swallows the first data row, which dropped match PA1.)
  let rows;
  if (typeof Papa !== "undefined") {
    rows = Papa.parse(text.trim(), { header: false, skipEmptyLines: true }).data;
  } else {
    rows = text.trim().split(/\r?\n/).map(splitCsvLine);
  }
  if (!rows || rows.length < 2) return [];

  const headers = rows[0].map(h => String(h == null ? "" : h).trim());
  return rows.slice(1).map(cells => {
    const obj = {};
    headers.forEach((h, i) => {
      if (!h) return;                                  // ignore blank header columns
      const v = cells[i];
      obj[h] = (v == null ? "" : String(v)).trim();
    });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== ""));
}

function splitCsvLine(line) {
  const result = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// gviz quirk: requesting a NON-existent tab returns the spreadsheet's first
// sheet instead of erroring. So an optional tab that doesn't exist comes back
// full of the wrong rows. Guard every optional tab by its expected columns —
// if the headers don't match, treat it as empty.
function hasColumns(rows, cols) {
  if (!rows || !rows.length) return false;
  const keys = Object.keys(rows[0]).map(k => k.toLowerCase());
  return cols.every(c => keys.includes(c.toLowerCase()));
}
function onlyIfColumns(rows, cols) {
  return hasColumns(rows, cols) ? rows : [];
}

// Convert the Meta tab's key/value rows into an object with LOWERCASED keys, so
// "Key"/"Value" headers and any key casing (pollURL vs pollUrl) all work.
function metaToObject(rows) {
  const o = {};
  for (const row of rows || []) {
    const cols = Object.keys(row);
    const kCol = cols.find(c => c.toLowerCase() === "key");
    const vCol = cols.find(c => c.toLowerCase() === "value");
    if (!kCol) continue;
    const k = (row[kCol] || "").trim();
    if (k) o[k.toLowerCase()] = (vCol ? row[vCol] : "").trim();
  }
  return o;
}

// Fetch every tab independently — one failed/renamed/missing tab returns [] for
// that dataset and never blanks the rest. New tabs (Meta/Signups/Bets) are all
// optional and degrade to empty.
async function fetchAllData() {
  const plan = [
    ["poolMatches", TABS.POOL],
    ["knockout",    TABS.KNOCKOUT],
    ["onfire",      TABS.ONFIRE],
    ["meta",        TABS.META],
    ["signups",     TABS.SIGNUPS],
    ["bets",        TABS.BETS],
    ["teams",       TABS.TEAMS]
  ];
  const results = await Promise.allSettled(plan.map(([, name]) => fetchTab(name)));

  const out = { fetchedAt: Date.now(), failedTabs: [] };
  results.forEach((r, i) => {
    const [key, name] = plan[i];
    if (r.status === "fulfilled") {
      out[key] = r.value;
    } else {
      out[key] = [];
      out.failedTabs.push(name);
      console.warn(`[data] tab "${name}" unavailable:`, r.reason?.message || r.reason);
    }
  });

  // Validate optional tabs by their expected schema (defends against the gviz
  // first-sheet fallback above). Essential tabs are trusted as-is.
  out.meta    = metaToObject(onlyIfColumns(out.meta, ["key", "value"]));
  // Signups column may be "player" or "player1".
  out.signups = (hasColumns(out.signups, ["player"]) || hasColumns(out.signups, ["player1"]))
                  ? out.signups : [];
  out.bets    = onlyIfColumns(out.bets, ["market", "selection", "stake"]);
  // Teams tab needs at least the two player columns; otherwise the gviz
  // first-sheet fallback would masquerade as teams.
  out.teams   = onlyIfColumns(out.teams, ["player1", "player2"]);
  return out;
}
