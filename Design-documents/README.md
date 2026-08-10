# Handoff: Achievements System (Cleo vs Viking)

## Overview
Two connected pieces of an achievements/rewards system for the "Cleo vs Viking" arena fighting game:

1. **Achievements page** — a full library where a player browses every achievement, tracks completion, and sees rarity + global unlock statistics.
2. **In-match feedback** — a small, non-intrusive toast that pops in the top-right corner when an achievement unlocks mid-match, plus a post-match summary listing everything earned that match.

Together they cover: discovery (browse), live reward feedback (toast), and end-of-match payoff (summary).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes that show the intended look, layout, and behavior. They are **not** production code to copy directly. They are authored as "Design Components" (a `.dc.html` prototype format) and depend on a local prototyping runtime (`support.js`), so they will not run as-is in a product codebase.

The task is to **recreate these designs in the target codebase's existing environment** (React, Vue, SwiftUI, a game-engine UI layer, etc.) using its established patterns, components, and asset pipeline. If no UI environment exists yet, pick the most appropriate one for the project and implement there.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, angular card shapes, and interaction timings are all specified below and should be recreated faithfully. Re-map to the codebase's own components where equivalents exist, but keep the visual result matching.

---

## Design Tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| Background (base) | `#05070f` | Page/stage background |
| Background (panel) | `#080d18` / `#080c17` | Summary card, dial center |
| Surface | `rgba(255,255,255,0.03)` | Stat cards, achievement cards |
| Surface border | `rgba(255,255,255,0.08–0.12)` | Card borders/dividers |
| Text primary | `#f2f5ff` | Body / headings |
| Text muted | `rgba(242,245,255,0.4–0.62)` | Labels, descriptions |
| Cleo / pink | `#ff4d9d` | Cleo side, Combat category |
| Viking / blue | `#4dc3ff` | Viking side, Progression category |
| Gold | `#ffd166` | Points/glory, highlights, Collection category |
| Green | `#7cf5b0` | Unlocked/ready states, Social category |
| Legendary violet | `#c58bff` | Legendary rarity |
| Common gray | `#9fb0d0` | Common rarity |
| Danger red | `#ff6b6b` | (from base game) loss states |

### Rarity tiers (derived from global unlock %)
| Rarity | Condition | Tone |
|---|---|---|
| Legendary | `pct < 2` | `#c58bff` |
| Epic | `pct < 10` | `#ff4d9d` |
| Rare | `pct < 35` | `#4dc3ff` |
| Common | otherwise | `#9fb0d0` |

### Category → accent color
Combat `#ff4d9d` · Progression `#4dc3ff` · Collection `#ffd166` · Social `#7cf5b0`

### Typography
- **Display / headings:** `Anton` (Google Fonts), uppercase, `letter-spacing: 0.02–0.06em`. Used for page titles, big numbers, points.
- **Labels / body / UI:** `Oswald` (Google Fonts), weights 300/600/700, uppercase labels use `letter-spacing: 0.08–0.22em`.
- **Fallback body:** `'Segoe UI', system-ui, -apple-system, sans-serif`.
- Scale used: page title 52px; card/summary heading 32–46px; big stat numbers 30–38px; achievement title 15–17px; description 12.5px; micro-labels 9.5–11px.

### Shape language
- **Angular clip-path cards** (chamfered corner), the signature look. Common variants:
  - Card: `polygon(0 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%)`
  - Button/chip: `polygon(7-8px 0,100% 0,100% calc(100% - 7-8px),calc(100% - 7-8px) 100%,0 100%,0 7-8px)`
  - Ribbon/tag: `polygon(10px 0,100% 0,100% 100%,0 100%)` / small pill `polygon(5-6px 0,100% 0,calc(100% - 5-6px) 100%,0 100%)`
  - Icon frame: `polygon(8-10px 0,100% 0,100% calc(100% - 8-10px),calc(100% - 8-10px) 100%,0 100%,0 8-10px)`
- **Left accent bar:** 3px `border-left` in the category/rarity tone.
- No rounded corners except the stage container (`border-radius:16px`) and the completion dial (circle).
- Pixel-art images always use `image-rendering: pixelated`.

### Shadows / glow
- Stage: `0 30px 90px rgba(0,0,0,0.75)`.
- Unlocked card glow: `0 0 26px <tone>18` + border `<tone>55`.
- Icon frame inner glow: `inset 0 0 16–20px <tone>22`.
- Toast: `0 12px 34px rgba(0,0,0,0.55), 0 0 22px <tone>2a`, `backdrop-filter: blur(4px)`.

---

## Screens / Views

### 1. Achievements Page (`Achievements.dc.html`)
**Purpose:** Player browses all achievements, tracks overall completion, and reads rarity/global stats.

**Layout:** Centered column, max width **1280px**. Top-to-bottom:
1. **Header row** (space-between): left = game wordmark ("Cleo vs Viking"), page title `Achievements` (Anton 52px), subline. Right = **completion dial** + label.
2. **Stat strip** — 4-column grid (`gap:14px`), each an angular card with a colored left bar.
3. **Filter bar** (space-between): left = category chips; right = status chips.
4. **Achievement grid** — `grid-template-columns: repeat(3, 1fr)`, `gap:14px`.
5. Empty state (dashed border) when a filter matches nothing.

**Completion dial:** 74×74 circle. Ring drawn with `conic-gradient(#ffd166 <pct*3.6>deg, rgba(255,255,255,0.08) 0)`; inner disc `inset:7px; background:#080c17` to make it a ring; centered `%` in Anton gold, glow `0 0 22px rgba(255,209,102,0.25)`.

**Header stat cards (4):**
- Unlocked `9/16` (green) — "achievements earned"
- Glory points `340` (gold) — "of 720 available"
- Rarest unlock `0.8%` (violet) — name of rarest earned
- In progress `N` (blue) — "partially complete"

**Achievement card components:**
- **Rarity ribbon** top-right: uppercase rarity label; filled with rarity tone (text `#05070f`), except Common which is `rgba(255,255,255,0.08)` with light text.
- **Icon frame** 58×58 angular, pixel-art icon inside; locked → `filter: grayscale(1) brightness(0.5)` + a `🔒` overlay on `rgba(5,7,15,0.55)`.
- **Title** (Oswald 600, 17px) + **points** badge right (Anton gold `+N` with tiny "PTS").
- **Description** (12.5px, `text-wrap: pretty`).
- **Progress block** (locked + has progress only): "Progress" label + `cur / max` in tone; 7px bar filled `linear-gradient(90deg,<tone>,#ffd166)`, width = `cur/max`.
- **Footer:** "**X%** of fighters unlocked this" with a 4px mini-bar (width scaled `max(3, sqrt(pct/100)*100)%` so rare feats stay visible) + a stamp: unlocked → green `✓ <date>`; locked → gray "Locked".
- Locked cards: `opacity:0.82`, muted borders, no glow.

**Filters:**
- Category chips: `All / Combat / Progression / Collection / Social`, each with a count. Active = brighter bg + border.
- Status chips: `All / Unlocked / Locked` (gold active tone).
- Filtering is `(cat matches) AND (status matches)`.

### 2. In-Match Feedback + Post-Match Summary (`Match Achievements.dc.html`)
**Purpose:** Give live reward feedback during a match and a payoff summary after.

**Layout:** Same centered 1280px column. A control bar (demo triggers) sits above a **16:9 stage** (`aspect-ratio:16/9`, `border-radius:16px`) mocking the in-game view: arena bg image (`brightness(0.6)`), two bobbing fighters, a centered HUD score chip.

**Toast (top-right, the key deliverable):**
- Container: `position:absolute; top:16px; right:16px; width:308px; display:flex; flex-direction:column; gap:10px; z-index:30`. Stacks multiple toasts vertically.
- Each toast (~308px wide, compact): angular card, 3px left accent bar in rarity tone, `backdrop-filter: blur(4px)`, subtle glow in rarity tone.
- Contents in one row: **icon frame** 40×40 (icon animates in) · text block (`"<RARITY> UNLOCKED"` micro-label in rarity tone + title Oswald 600 15px, single-line ellipsis) · **`+N` GLORY** in Anton gold.
- Bottom **timer bar** 3px that depletes over the toast lifetime (rarity tone).
- **Deliberately small and non-distracting** — top-right, does not cover gameplay.

**Post-match summary overlay:**
- Full-stage overlay, `z-index:50`, dim backdrop `rgba(5,7,15,0.9)` + gold radial glow, entrance slide-up.
- Card 560px, angular. Header (space-between): left = "Match complete" micro-label + **big win headline** `Team <Cleo> wins` (Anton **46px**, side name in pink with glow) + a small gold row "`N` new achievements earned"; right = total **`+N` glory points** (Anton 38px gold). *Win result is the visual focus; achievements are the secondary reward.*
- Body: scrollable list (`max-height:340px`) of earned achievements. Each row: icon frame 46×46, title + rarity tag, description, a 4px global-% mini-bar with "**X%** of fighters", and `+N` points right. Rows stagger in.
- Footer: two buttons — "Close" (ghost) and "View all achievements ▸" (gold gradient, links to the Achievements page).

---

## Interactions & Behavior

### Achievements page
- Category and status chips filter the grid instantly (client-side).
- Cards fade/slide in (`ach-in`, 0.4s ease). Unlocked cards have a slow looping diagonal **shine** sweep (`ach-shine`, 5s, randomized delay).
- Progress and global bars animate width from 0 (`ach-bar`, 0.7s ease).

### Toast lifecycle
- On unlock, push a toast. **Lifetime ≈ 4600ms.**
- Enter: `ma-toastin` 0.5s `cubic-bezier(0.16,1,0.3,1)` (slide from right + fade). Icon: `ma-icon` 0.6s pop/rotate settle. One-shot shine sweep `ma-shine` ~1.3s.
- Timer bar: `ma-timer` linear over full lifetime.
- Exit: at `lifetime - 420ms` mark leaving → `ma-toastout` 0.42s (slide right + fade), then remove at lifetime end.
- Multiple toasts stack (newest at bottom of the column); each self-manages its own timers.

### Demo triggers (prototype only — replace with real game events)
- **Unlock one** → one random toast.
- **Play match** → fires the 4 achievements as a staggered sequence (1300ms apart), then auto-opens the summary ~1400ms after the last.
- **Match summary** → opens the overlay directly.

### Post-match summary
- Slide-up entrance (`ma-up` 0.45s). Rows stagger in (`ma-row`, 0.09s step). Global bars animate (`ma-bar`).
- Both footer buttons close the overlay in the prototype; in-product "View all achievements" should navigate to the Achievements page.

---

## State Management

### Achievements page
- `cat`: current category filter (`'all' | 'Combat' | 'Progression' | 'Collection' | 'Social'`).
- `status`: `'all' | 'unlocked' | 'locked'`.
- Derived (no stored state): completion %, earned points, rarest unlock, filtered list, per-achievement rarity.
- **Data model per achievement:** `{ id, title, desc, cat, icon, pts, pct (global unlock %), unlocked (bool), date? , prog?: { cur, max } }`.

### Match feedback
- `toasts`: array of active toasts `{ ...achievement, _id, leaving, dur }`.
- `summaryOpen`: bool.
- Timers tracked so they can be cleared on unmount.
- **Real integration:** the game should emit an "achievement unlocked" event → push toast + add to the match's earned set. Global unlock `pct` comes from backend/analytics.

---

## Assets
Pixel-art PNGs from the existing game (`assets/` in the project). Icons currently mapped to achievements:
- `assets/kebab.png`, `assets/pizza.png`, `assets/mushroom.png` — collectible/combat items
- `assets/cleo_shield_icon.png`, `assets/viking_shield_icon.png` — shields
- `assets/cleo/sun_fire_ball.png`, `assets/viking/axe_throw.png`, `assets/viking_harpoon_projectile.png` — attacks
- `assets/cleo/idle.png`, `assets/viking/idle.png` — fighters
- `assets/arena_01.png` — arena background (also used as a map/achievement thumbnail)

Fonts: **Anton** and **Oswald** via Google Fonts. Use existing licensed equivalents in the target app if available.

All icon → achievement mappings are placeholders; swap for final art as needed. Achievement copy, points, and global-% values in the files are **placeholder data** — wire to real backend values.

## Files (in this bundle)
- `Achievements.dc.html` — the full achievements library page.
- `Match Achievements.dc.html` — in-match toast + post-match summary.
- (Both reference the shared prototyping runtime `support.js` and the `assets/` folder from the project; they are design references, not runnable product code.)
