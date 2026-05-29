# The Palace — 2nd Edition · Scoreboard Site

Static scoreboard for the beer pong tournament. All live data lives in a Google Sheet; the site reads it automatically every 30 seconds. No server, no build step, no credentials.

---

## Quick-start checklist

- [ ] Create the Google Sheet (spec below)
- [ ] Share it "Anyone with the link → Viewer"
- [ ] Paste the Sheet ID into `js/config.js`
- [ ] Push to GitHub, enable GitHub Pages
- [ ] Share the URL with players

---

## 1. Create the Google Sheet

### Tab 1 — `PoolMatches`

Headers (row 1): `id | pool | order | home | away | status | cupsHome | cupsAway`

Seed all 20 rows exactly as below. Leave `status`, `cupsHome`, `cupsAway` blank — fill them during the event.

| id   | pool | order | home             | away             | status | cupsHome | cupsAway |
|------|------|-------|------------------|------------------|--------|----------|----------|
| PA1  | A    | 1     | omar-toni        | luca-kenny       |        |          |          |
| PA2  | A    | 2     | omar-toni        | kevin-guillermo  |        |          |          |
| PA3  | A    | 3     | omar-toni        | xavier-rita      |        |          |          |
| PA4  | A    | 4     | omar-toni        | martin-bianca    |        |          |          |
| PA5  | A    | 5     | luca-kenny       | kevin-guillermo  |        |          |          |
| PA6  | A    | 6     | luca-kenny       | xavier-rita      |        |          |          |
| PA7  | A    | 7     | luca-kenny       | martin-bianca    |        |          |          |
| PA8  | A    | 8     | kevin-guillermo  | xavier-rita      |        |          |          |
| PA9  | A    | 9     | kevin-guillermo  | martin-bianca    |        |          |          |
| PA10 | A    | 10    | xavier-rita      | martin-bianca    |        |          |          |
| PB1  | B    | 1     | alwin-leonie     | lalaina-daniel   |        |          |          |
| PB2  | B    | 2     | alwin-leonie     | zackary-tamu     |        |          |          |
| PB3  | B    | 3     | alwin-leonie     | nata-ashley      |        |          |          |
| PB4  | B    | 4     | alwin-leonie     | paolo-malik      |        |          |          |
| PB5  | B    | 5     | lalaina-daniel   | zackary-tamu     |        |          |          |
| PB6  | B    | 6     | lalaina-daniel   | nata-ashley      |        |          |          |
| PB7  | B    | 7     | lalaina-daniel   | paolo-malik      |        |          |          |
| PB8  | B    | 8     | zackary-tamu     | nata-ashley      |        |          |          |
| PB9  | B    | 9     | zackary-tamu     | paolo-malik      |        |          |          |
| PB10 | B    | 10    | nata-ashley      | paolo-malik      |        |          |          |

**`status` values:** `upcoming` · `live` · `final`
**`cupsHome` / `cupsAway`:** cups that team *eliminated* from the opponent (0–6). Higher = better. Never inverted.

---

### Tab 2 — `Knockout`

Headers: `id | round | slotHome | slotAway | status | cupsHome | cupsAway | suddenDeathWinner`

Seed these 5 rows. The `slotHome`/`slotAway` columns are for your reference only — the site resolves them from standings in code. Only fill `status`, `cups*`, and `suddenDeathWinner` during the event.

| id  | round | slotHome | slotAway     | status | cupsHome | cupsAway | suddenDeathWinner |
|-----|-------|----------|--------------|--------|----------|----------|-------------------|
| QF1 | QF    | A2       | B3           |        |          |          |                   |
| QF2 | QF    | B2       | A3           |        |          |          |                   |
| SF1 | SF    | A1       | (winner QF1) |        |          |          |                   |
| SF2 | SF    | B1       | (winner QF2) |        |          |          |                   |
| F   | Final | (winner SF1) | (winner SF2) |    |          |          |                   |

**`suddenDeathWinner`:** fill with the winning team's ID (e.g. `zackary-tamu`) only if the match ended in a draw decided by sudden death. Leave blank otherwise.

---

### Tab 3 — `OnFire`

Headers: `player | count`

Seed all 20 players with `count = 0`. Increment a player's count by 1 each time they go On Fire during the event.

| player    | count |   | player   | count |
|-----------|-------|---|----------|-------|
| Omar      | 0     |   | Alwin    | 0     |
| Toni      | 0     |   | Leonie   | 0     |
| Luca      | 0     |   | Lalaina  | 0     |
| Kenny     | 0     |   | Daniel   | 0     |
| Kevin     | 0     |   | Zackary  | 0     |
| Guillermo | 0     |   | Tamu     | 0     |
| Xavier    | 0     |   | Nata     | 0     |
| Rita      | 0     |   | Ashley   | 0     |
| Martin    | 0     |   | Paolo    | 0     |
| Bianca    | 0     |   | Malik    | 0     |

---

## 2. Share the Sheet

1. Click **Share** (top-right in Google Sheets)
2. Under "General access", select **Anyone with the link**
3. Set permission to **Viewer**
4. Copy the Sheet URL — it looks like:
   `https://docs.google.com/spreadsheets/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit`
5. The Sheet ID is the long string between `/d/` and `/edit`:
   `1aBcDeFgHiJkLmNoPqRsTuVwXyZ`

---

## 3. Paste the Sheet ID

Open `js/config.js` and replace the placeholder on line 2:

```js
const SHEET_ID = "1aBcDeFgHiJkLmNoPqRsTuVwXyZ";  // ← your ID here
```

That is the **only line you ever need to change.**

---

## 3b. Match times & order of play

The running order and scheduled times live in the **`SCHEDULE`** array in [js/config.js](js/config.js) — *not* in the Sheet, because they're fixed and known in advance. The Schedule page ("Order of Play") and Home "Up Next" both follow this order.

Each entry maps a match `id` to its slot number and times:

```js
{ slot: 1, id: "PA7", start: "12:30 PM", end: "12:42 PM" },
```

- `id` must match the match id in the Sheet (the Final uses bracket id **`F`**).
- To shift the schedule (e.g. a late start), edit the `start`/`end` strings here and re-deploy. The Sheet's `order` column is no longer used for display — order of play comes from `SCHEDULE`.
- Live status (`upcoming`/`live`/`final`) and scores still come from the Sheet, so the timeline shows real-time progress against the planned times.

---

## 4. Deploy to GitHub Pages

```bash
# Create a repo and push
git init
git add .
git commit -m "The Palace 2nd Edition scoreboard"
git remote add origin https://github.com/YOUR_USERNAME/palace-pong.git
git push -u origin main
```

Then in the GitHub repo → **Settings → Pages → Source: Deploy from branch → main / (root)**.

The site will be live at `https://YOUR_USERNAME.github.io/palace-pong/`.

---

## 5. Per-game update routine (during the event)

### When a match starts
1. Find the row in `PoolMatches` (or `Knockout`)
2. Set `status` → `live`
3. Save — the site shows a pulsing **● LIVE** badge within 30 s

### When a match ends
1. Set `cupsHome` and `cupsAway` to the final cups eliminated by each side (0–6)
2. Set `status` → `final`
3. Save — standings update automatically

### Knockout sudden-death tiebreak
If a knockout match ends level (cups equal, time ran out), play sudden death. After the winner is decided:
1. Set `cupsHome` / `cupsAway` as they stood
2. Set `status` → `final`
3. Set `suddenDeathWinner` → the winning team's ID (e.g. `zackary-tamu`)

### On Fire
When a player goes On Fire, increment their `count` in the `OnFire` tab by 1.

---

## 6. File structure

```
palace-pong/
├── index.html          Home — hero, live snapshot, On Fire teaser
├── schedule.html       All matches with scores and status
├── standings.html      Pool tables + knockout bracket
├── onfire.html         On Fire leaderboard (centrepiece)
├── rules.html          Full 2nd-edition rules
├── teams.html          All 10 teams / 20 players
├── halloffame.html     Past champions + The Founding Father
├── css/style.css       All styles (dark luxury theme)
└── js/
    ├── config.js       SHEET_ID + static TOURNAMENT/TEAMS config
    ├── data.js         gviz CSV fetch + PapaParse wrapper
    ├── compute.js      Standings, bracket, On Fire computation
    └── app.js          Refresh cycle, shared render helpers
```

---

## 7. How the live data works

- The site fetches all three Sheet tabs via the **gviz CSV endpoint** — no API key, no credentials.
- Endpoint pattern: `https://docs.google.com/spreadsheets/d/SHEET_ID/gviz/tq?tqx=out:csv&sheet=TAB_NAME&headers=1&_=TIMESTAMP`
- The `_=TIMESTAMP` parameter busts the browser cache on every request.
- Data is fetched every **30 seconds** and on every tab-focus event.
- If the fetch fails, the last good data stays on screen with a warning banner — the scoreboard never goes blank.

---

## 8. Adding a Sayor portrait

In `halloffame.html`, find the element with id `sayor-portrait` and add an `<img>` tag:

```html
<div class="portrait-slot" id="sayor-portrait">
  <img src="sayor.jpg" alt="Sayor">
</div>
```

Drop the photo file into the project root and push.
