# HANDOFF — The Palace (palace-pong)

Quick-start context for a fresh session. Read this instead of re-reading every file.

## What this is
A **static** (vanilla HTML/CSS/JS, no build/framework/npm) mobile-first site for a beer-pong
tournament. Live data comes from a public **Google Sheet** via the gviz CSV endpoint. Deployed on
**GitHub Pages**. Dark/gold "luxury rooftop" theme. Currently set up for the **3rd Edition**
(Fri 12 June 2026), in **registration** phase.

## Hard rules (do not regress)
- No framework / build step / bundler / npm. Static files only.
- Keep the gviz fetch pattern, 30s refresh, error-banner/empty-state fallback, and the
  registration↔live↔complete phase toggle.
- All live data comes from a Sheet tab read through `data.js`. Never hardcode event-day data.
- Copy must be sunlight-readable: high contrast, 44px+ tap targets, no tiny gold-on-black body text.
- **Ask before changing** `SHEET_ID`, `WHATSAPP_NUMBER`, or the bracket/schedule structure.
- Preserve existing standings/bracket/result rules — add to them, don't rewrite.

## Files
```
*.html  → index, schedule, standings, onfire, rules, teams, halloffame, odds, recap
css/style.css
js/config.js   SHEET_ID, WHATSAPP_NUMBER, POLL_URL, TOURNAMENT, TEAMS, BRACKET_STRUCTURE,
               SCHEDULE, MARKETS, TAKEOUT, BETS_LOCK_ISO, COUNTDOWN_DEFAULT_ISO, helpers
js/data.js     gviz fetch (Promise.allSettled), parseCSV, TABS, metaToObject, column guards
js/compute.js  computeAll(data) — pure; standings, bracket, onfire, odds, recap, phase merge
js/app.js      initPage/refresh cycle, nav INJECTION + More menu, countdown, NOW/NEXT bar, CTAs, helpers
manifest.json  PWA (Add to Home Screen, no service worker)
og-image.png   1200×630 social card · palace-logo.png crest/favicon/icon
sayor.jpg, champ-1st.jpg, champ-2nd.jpg  Hall of Fame photos
teams/<team-id>.jpg  optional per-team photo shown above the roster on teams.html
                     (live phase only). Missing → gold monogram fallback. See teams/README.txt.
```
Script load order on every page: `config.js → data.js → compute.js → app.js`. Each data page
calls `initPage(renderFn)`. Static-ish pages (rules, halloffame) call `initPage(()=>{...})` just
so the global NOW/NEXT bar works.

**Nav is injected, not hardcoded.** `app.js` builds the bottom nav + "More" sheet from the
`NAV_PRIMARY` / `NAV_SECONDARY` arrays and `injectNav()` prepends it to `<body>` at load (guarded
so it no-ops if `#main-nav` already exists). Edit nav links in those arrays — NOT in the HTML.
The HTML files no longer contain any nav markup. (app.js loads at end of body, so `document.body`
exists; `markNav`/`setupMoreMenu` run after the inject and wire active-state + the More sheet.)

## Config constants (js/config.js)
- `SHEET_ID = "1r2geaaPt8pU1Jo5BFY38ZOz-d3WU0d7_Rt7FP6tkNmU"`
- `WHATSAPP_NUMBER = "15149843611"` → `whatsappUrl(msg)` builds wa.me links
- `TOURNAMENT.phase = "registration"` (code fallback; **Meta.phase overrides it at runtime**)
- `TOURNAMENT.spotsTotal = 20` (competitors)
- `TEAMS` (now a `let`) = **2nd-Edition fallback roster**, used only until the Sheet's **Teams** tab
  is populated — `computeAll` replaces it at runtime from that tab. Prefer the Teams tab over editing this.
- `MARKETS` = winner (`source:"teams"`) + onfire (`source:"players"`). `slugifyName`/`teamCode` derive
  team codes; `teamLabel` prettifies an unknown slug id (so past-edition winner labels still resolve).
- `TAKEOUT = 0` (pure pari-mutuel split). `BETS_LOCK_ISO`/`COUNTDOWN_DEFAULT_ISO = 2026-06-12T12:00:00`.

## Google Sheet tabs
Essential (always present): **PoolMatches**, **Knockout**, **OnFire**.
Optional (degrade to empty if missing): **Meta**, **Signups**, **Bets**, **Teams**.

- **Meta** = `Key | Value` (case-insensitive). Keys (any casing): phase, venue, dateText,
  startTimeText, countdownTargetISO, spotsTotal, pollUrl, betsLockISO, bettingOpen (yes/no), oddsNote.
  Current live values: phase=registration, spotsTotal=20, bettingOpen=yes, pollURL=wa.me/15149843611.
- **Signups** = column `player` **or** `player1`, one row per competitor. Drives
  "X of 20 Competitors in" + the **On Fire** odds selections (individual competitors).
- **Bets** = `timestamp | bettor | market | selection | stake`. House types bets here; site computes
  odds. `market` = Winner/On Fire (normalized). `selection` = a **team** (label "Xavier & Omar" OR
  code "xavier-omar"; matched case/space/punct-insensitively) for **Winner**, a **competitor's name**
  for **On Fire**.
- **Teams** (NEW) = `player1 | player2 | pool? | code? | photo?`, one row per team. When present it
  REPLACES the config `TEAMS` registry at runtime (`parseSheetTeams` in compute.js). `code` defaults
  to the slug `player1-player2` (also the `teams/<code>.jpg` image filename). `pool` may be blank
  (A/B filled later with the schedule). Use the same code in PoolMatches/Knockout home/away columns.

## Result & odds rules (already implemented, verified)
- **Cup result:** each cup number = cups *remaining*. `0` = that team lost; neither `0` = draw.
  Differential = cupsHome − cupsAway. Pool sort: points → **head-to-head** → diff → cupsFor → alpha.
- **Knockout tie at time** → Shootout (rules §3). Organiser records winner in `suddenDeathWinner`.
- **Odds = pari-mutuel pool.** TWO markets, different units:
  - **Winner** = bet on a **TEAM** (selections = team labels from the Teams tab / config fallback).
    Settles to the single champion team (`teamLabel(bracket.F.winner)`); its backers split the pot.
  - **On Fire** = bet on an **individual competitor** (selections from Signups, fallback roster).
    Settles to the single top player.
  - Per-market selections are set in `computeAll` via `selectionsFor(key)`; `marketSelections(key)`
    in config.js is the no-data fallback. Settlement matches by the canonical selection string.
- Betting `open` = before `betsLockISO` and `bettingOpen != "no"`. A market only shows "settled"
  once betting is closed (guards against stale bracket data settling early).

## computeAll(data) returns
`{ standings, bracket, onfire, poolA, poolB, orderOfPlay, live, next, poolAFinal, poolBFinal,
   tournament, phase, registration, complete, signups, bets, odds, betting, results, recap, fetchedAt }`
Pages read `c.registration` / `c.phase` / `c.tournament.*` (NOT the static `REGISTRATION_MODE`,
which is only a pre-data fallback).

## Known gotchas / decisions
- **gviz returns the FIRST sheet for a missing tab** (not an error). `data.js` validates optional
  tabs by expected columns (`onlyIfColumns`/`hasColumns`) so a missing tab degrades to `[]`.
- Meta keys are **lowercased** in `metaToObject`; `resolveTournament` reads case-insensitively.
- Dates may be `YYYY-MM-DD HH:MM:SS` (space) — use `parseEventDate()` (replaces space→T, Safari-safe).
- pollUrl without scheme (`wa.me/…`) gets `https://` prepended.
- Sign-up CTA: if a pollUrl is set, primary = "Vote in Party Chat Poll" → poll, secondary = WhatsApp;
  if not, primary = WhatsApp signup. All `.poll-cta` are wired by `wirePollCtas()`.
- `app.js` defends against config.js not being loaded (typeof guards) — keep that.

## Local preview (the painful part)
The Claude Preview MCP server is **sandboxed and cannot read the project files** (its spawned
process can't `getcwd`/read). Workaround that works:
1. Run your own static server UNsandboxed via Bash with `dangerouslyDisableSandbox: true`:
   `cd palace-pong && nohup python3 -m http.server 8761 ... &` (send `Cache-Control: no-store`).
   It dies between turns sometimes — just restart it; check with `curl -s -o /dev/null -w "%{http_code}" http://localhost:8761/index.html`.
2. `preview_start` (name "palace" from `.claude/launch.json`) only to get a **browser**; then
   `preview_eval` → `location.href='http://localhost:8761/<page>.html'` to navigate to YOUR server.
3. Always append `?v=${Date.now()}` when navigating to dodge cached JS/CSS.
4. The preview MCP server/browser drops often → re-`preview_start` (it reuses by port).
Verify logic with `preview_eval` calling `fetchAllData()`/`computeAll()` directly; check
`preview_console_logs` (level error). Note: rules.html has no `#error-banner` — don't reference it in evals.

## Current state (verified in browser against live Sheet, 10 June)
Registration mode · field FULL (20/20) · **Teams tab populated with the real 10 teams** · betting
OPEN with live team bets (Winner: zackary-tamu $5 + ian-lalaina $3; On Fire: Leonie $3, Marcin $1).
9 of 10 team photos uploaded (`ale-marcin.jpg` still missing → AM monogram). Old 2nd-Edition
PoolMatches/Knockout rows are still in the Sheet but harmlessly no-op (old team ids don't resolve);
clear them before going live. No console errors on any page.

## To go live (organiser steps, no code)
1. Draw teams; fill the Sheet's **Teams** tab (`player1 | player2 | pool? | code? | photo?`). This
   drives the Teams page, the **Winner** odds market, standings & bracket. Drop matching photos at
   `teams/<code>.jpg` (see teams/README.txt). The Teams page shows the roster in any phase once filled.
2. Set `Meta.phase = live`. Fill PoolMatches/Knockout/OnFire during the day (home/away = team codes).
   → scoreboard, NOW/NEXT bar.
3. `Meta.phase = complete` after the Final → champion share card + recap page appear.

## Deploy notes
- GitHub Pages from repo root. Upload ALL files incl. images + manifest.json + og-image.png.
- **og:url / og:image use a `YOURNAME` placeholder** in every HTML `<head>` — find-and-replace
  `YOURNAME` with the real Pages URL for rich WhatsApp/Twitter unfurl.
- Data updates need no redeploy (Sheet-driven). Code/asset changes do; hard-refresh after.

## Recent UI work
- **Home betting card** (`index.html` `#home-odds` + `.odds-*` CSS): redesigned from a plain
  name/odds list into an "odds board" — status pill (Betting open/closed/Settled), ranked rows
  with a gold rank chip, the favourite highlighted (★ + Favourite tag + brighter bar), a
  pool-share bar per selection (scaled to the favourite), big multiplier, and a $pot / #bets
  stat footer. Empty state when no bets yet.
- **Team photos** (`teams.html` `teamPhoto()` + `.team-photo` CSS): each live team card now has a
  full-bleed photo banner above the roster, `teams/<team-id>.jpg`, with a monogram fallback.
- **Full Odds page** (`odds.html`): rebuilt to match the home odds-board — status pill, ranked
  rows, pool-share bars, highlighted favourite. Kept the payout preview ("$5 returns ~$X · N%
  chance"); unbacked selections are recessed with a ghost-outline "Back this" button.
- **Nav dedupe**: nav markup removed from all 9 HTML files; now injected by `app.js` from
  `NAV_PRIMARY`/`NAV_SECONDARY` (see the nav note above). Edit links once, there.
- **Team betting model**: Winner market is now bet on **teams** (was individuals); On Fire stays
  individual. Teams are sourced from the Sheet's **Teams** tab (`parseSheetTeams`), which replaces
  the `TEAMS` registry at runtime. The Teams page renders the drawn teams (with photos) grouped by
  pool, or one grid when pools are still TBD. Copy on the home card + Odds disclaimer updated.

## 10 June audit pass (all verified)
- **Bug fixed**: `[hidden]` now wins over author `display` rules (global `[hidden]{display:none
  !important}`) — the Hall of Fame's "View recap" CTA was leaking through during registration.
- **Winner-bet shorthand**: a Winner bet typed as a single player's name maps to their team in
  `computeAll` (unambiguous — each player is on one team). Team label or slug code still match.
- **Field-full / teams-drawn states**: home signup card flips to "Field Locked In" (+ "See the
  teams" CTA) via `c.teamsDrawn` / signups>=spotsTotal; schedule + standings placeholders hide the
  poll CTA and acknowledge the draw. Index empty-odds copy says "back a team"; odds.html is
  market-aware ("team" vs "competitor").
- **Reigning-champs banner is now static lore**: `REIGNING` const in config.js (Luca & Kenny,
  On Fire Leonie ×5) — the old bracket-derived banner died when TEAMS was swapped to the 3rd
  edition. Live/complete phases still use the live bracket result.
- **Odds page**: unbacked selections are compact one-liners (name + ghost button).
- **Performance**: site 9.1MB → ~2.3MB. All images resampled/compressed via sips (team photos
  720w q72 ≈140KB each; logo 925px/872KB → 400px/220KB; champ-1st 1.3MB → 172KB; og-image.png →
  **og-image.jpg** 140KB — every HTML head updated). **Originals in ../palace-pong-originals/**
  (outside the repo, NOT deployed). Font preconnect hints added to every head. `.nojekyll` added.
- **A11y**: `:focus-visible` gold outline + `prefers-reduced-motion` kill-switch in style.css.
- teams.html now has the standard loading-bar / error-banner / status-bar.
- Renamed `teams/nathanial-toni.jpg` → `nathaniel-toni.jpg` (code derives from Sheet names).
- **Preview cache tip**: browser caches `js/*.js`/`style.css` per origin — serving on a NEW port
  (e.g. 8765 vs 8761) gives a clean-cache origin instantly.
- **Teams grid responsive rework**: `.team-grid` is now 1 column on mobile (big-photo stack) and
  `repeat(5,1fr)` on desktop (`body.teams-page`, ≥768px) — two clean rows of five fills the 10-team
  roster with no leftover cells. teams.html `<body class="teams-page">` widens `main` + `.page-header`
  to 1120px centred so the grid no longer floats in dead space. `.team-grid` only appears on
  teams.html, so the global mobile rule is safe.
- **Honours emojis** (`playerIcon` in teams.html): 👑 Luca & Kenny (2nd-Ed champions), 🔥 Leonie
  (On Fire champion) — was still pointing at old 2nd-Ed names (Lalaina/Zackary/Paolo).

## 11 June — pre-live pass (Sheet PoolMatches/Knockout populated)
The organiser filled the 3rd-Edition fixtures. Big changes to make it live-ready (all verified
in-browser at registration + simulated live):
- **Times & run order are now Sheet-driven.** `computeOrderOfPlay(poolMatches, bracket, koRows)`
  reads PoolMatches `order` (1–20) + `matchStart`, then the knockouts QF1→F with their `matchStart`.
  `config.SCHEDULE`/`scheduleById` are now DEAD (deprecated comment left); don't edit them.
  Slot numbers shown are sequential #1–#25 from the run order.
- **Case-insensitive team matching.** PoolMatches home/away were TitleCase ("Nathaniel-Toni") vs
  lowercase ids ("nathaniel-toni") → standings came out EMPTY. `computeAll` now normalises
  home/away via `matchTeamToken` before standings/bracket.
- **Pools derived from fixtures.** Teams tab had blank `pool`, so `poolTeams()` was empty. `computeAll`
  now fills each team's pool from which pool it actually plays in (Teams-tab `pool` still wins if set).
- **Dynamic SF seeding (the Palace rule)** — `sfOpponent()` in compute.js, used by `computeBracket`:
  A1 (SF1) plays QFW2 if both QF winners share a pool, else the Pool-B QF winner; B1 (SF2) plays
  QFW1 if same pool, else the Pool-A QF winner. Verified all four pool combinations + end-to-end.
- **Bracket ignores the Sheet's slot columns.** The Knockout tab's slot codes are shifted one column
  (a 21–25 slot-number got typed into `slotHome`, pushing A2/B3 into slotAway/status). Matchups now
  come from `BRACKET_STRUCTURE` + the seeding rule, so the shift is harmless. Result-entry columns
  (status/cupsHome/cupsAway/suddenDeathWinner/matchStart) are correctly placed, so game-day entry works.
  Status is normalised (only "live"/"final" count; placeholders → upcoming).
- **Venue link.** `resolveTournament` now sets `venueUrl` (if Meta.venue is a URL) + `venueName`
  (Meta key `venueName`, else plain venue text). Home hero renders a `.venue-link`; champion card
  uses `venueName`. **Organiser must add Meta `venueName = Plage de Saint-Blaise`** (else link reads
  "View location on map"). Meta `venue` currently holds the Google Maps URL.
- Note: `betsLockISO = 12:00` but first match / countdown = 14:00 — betting locks 2h before kickoff
  (confirm if intended; set betsLockISO to 14:00 to lock at the first throw instead).

## Open/optional ideas (not started)
- Optional player avatars on the registration "field" cards / odds rows, same fallback pattern.
