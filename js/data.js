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

async function fetchAllData() {
  const [poolMatches, knockout, onfire] = await Promise.all([
    fetchTab(TABS.POOL),
    fetchTab(TABS.KNOCKOUT),
    fetchTab(TABS.ONFIRE)
  ]);
  return { poolMatches, knockout, onfire, fetchedAt: Date.now() };
}
