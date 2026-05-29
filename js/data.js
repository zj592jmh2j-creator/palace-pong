// ─── DATA FETCH / PARSE LAYER ────────────────────────────────────────────────
// Reads all live data from a public Google Sheet via the gviz CSV endpoint.
// No API key required — Sheet must be shared "Anyone with link → Viewer".

const TABS = { POOL: "PoolMatches", KNOCKOUT: "Knockout", ONFIRE: "OnFire" };

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
  return parseCSV(text);
}

function parseCSV(text) {
  // Use PapaParse if available (loaded via CDN), otherwise fall back to simple parser
  if (typeof Papa !== "undefined") {
    const result = Papa.parse(text.trim(), {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false
    });
    return result.data.map(row => {
      const clean = {};
      for (const k of Object.keys(row)) {
        clean[k.trim()] = typeof row[k] === "string" ? row[k].trim() : row[k];
      }
      return clean;
    });
  }
  // Fallback: simple RFC-4180 parser
  return simpleParseCsv(text);
}

function simpleParseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || "").trim(); });
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

async function fetchAllData() {
  const [poolMatches, knockout, onfire] = await Promise.all([
    fetchTab(TABS.POOL),
    fetchTab(TABS.KNOCKOUT),
    fetchTab(TABS.ONFIRE)
  ]);
  return { poolMatches, knockout, onfire, fetchedAt: Date.now() };
}
