# Handoff: Settings System (Cleo vs Viking)

## Overview
The settings surface for the "Cleo vs Viking" arena fighting game. Two connected pieces:

1. **Settings shell** — a compact menu selector (left rail) that switches between settings categories in place. Currently ships **Audio** and **Controls**; **Video** and **Gameplay** are placeholders wired for future work. Header holds a save/dirty indicator + Save button; the rail holds a global **Restore defaults**.
2. **Audio page** — the first fully-designed category: master volume + a live meter, and per-channel sliders (Music, Effects, Announcer, Ambience, Interface) each with a value readout, test-sound button, and mute toggle.

The **Controls** category embeds the existing keybinds designs (a chrome-free variant of the standalone `Controls - Keybinds` screen) directly inside the shell so it lives under the same menu.

Together they cover: category navigation (rail), audio mixing (sliders + master), and key rebinding (embedded panel).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes that show the intended look, layout, and behavior. They are **not** production code to copy directly. They are authored as "Design Components" (a `.dc.html` prototype format) and depend on a local prototyping runtime (`support.js`), so they will not run as-is in a product codebase.

The task is to **recreate these designs in the target codebase's existing environment** (React, Vue, SwiftUI, a game-engine UI layer, etc.) using its established patterns, components, and asset pipeline.

## Fidelity
**High-fidelity.** Colors, typography, spacing, angular shapes, slider mechanics, and interaction timings are specified below and should be recreated faithfully. Re-map to the codebase's own components where equivalents exist, but keep the visual result matching. This system deliberately reuses the exact visual language of the Achievements handoff (same tokens, same chamfered shapes) — treat that as the shared source of truth.

---

## Design Tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| Background (base) | `#05070f` | Page background |
| Background (stage) | `#070b16` / `#05070f` | Stage interior |
| Rail surface | `rgba(5,7,15,0.4)` | Left menu rail |
| Surface | `rgba(255,255,255,0.03–0.06)` | Tracks, chips, buttons |
| Surface border | `rgba(255,255,255,0.08–0.14)` | Borders/dividers |
| Text primary | `#f2f5ff` | Body / headings |
| Text muted | `rgba(242,245,255,0.4–0.62)` | Labels, descriptions |
| Cleo / pink | `#ff4d9d` | Cleo side, Announcer channel, Gameplay nav, mute-on state |
| Viking / blue | `#4dc3ff` | Viking side, Ambience channel, Controls nav |
| Gold | `#ffd166` | Master, Effects channel, dirty/save highlights, Audio nav |
| Green | `#7cf5b0` | Interface channel, saved state |
| Violet | `#c58bff` | Music channel, Video nav |

### Channel → accent color (Audio)
Master `#ffd166` · Music `#c58bff` · Effects `#ffd166` · Announcer `#ff4d9d` · Ambience `#4dc3ff` · Interface `#7cf5b0`

### Nav item → accent color (rail)
Audio `#ffd166` · Controls `#4dc3ff` · Video `#c58bff` (soon) · Gameplay `#ff4d9d` (soon)

### Typography
- **Display / headings:** `Anton` (Google Fonts), uppercase, `letter-spacing: 0.02–0.06em`. Section title (38px), big master % (44px).
- **Labels / body / UI:** `Oswald` (Google Fonts), weights 300/600/700; uppercase micro-labels use `letter-spacing: 0.08–0.2em`.
- **Fallback body:** `'Segoe UI', system-ui, -apple-system, sans-serif`.
- Scale: section title 38px; master number 44px; nav label 13.5px; channel label 15px; channel value 14px; micro-labels 10–11px.

### Shape language
- **Angular clip-path** (chamfered corners) throughout — the signature look:
  - Card/row: `polygon(0 0,100% 0,100% calc(100% - 8–10px),calc(100% - 8–10px) 100%,0 100%)`
  - Button/chip/nav: `polygon(6–8px 0,100% 0,100% calc(100% - 6–8px),calc(100% - 6–8px) 100%,0 100%,0 6–8px)`
  - Slider track & fill: `polygon(4px 0,100% 0,calc(100% - 4px) 100%,0 100%)` (parallelogram)
  - Icon frame: `polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)`
- **Left accent bar:** 3px `border-left` in the nav/channel tone (also on the active rail item).
- Only the stage container is rounded (`border-radius:16px`).

### Shadows / glow
- Stage: `0 30px 90px rgba(0,0,0,0.75)`.
- Slider fill glow: `0 0 14px <tone>66` (removed when muted).
- Icon frame inner glow: `inset 0 0 16px <tone>22`.
- Toast: `0 12px 30px rgba(0,0,0,0.6)` + gold border.

---

## Screens / Views

### 1. Settings shell (`Settings.dc.html`)
**Purpose:** One home for all settings, with a compact way to switch between categories.

**Layout:** Centered column, max width **1280px**, on a radial page background.
1. **Control bar** (space-between): left = game wordmark ("Cleo vs Viking" + "Settings" kicker); right = **dirty indicator** ("Unsaved changes" gold dot / "All saved") + **Save settings** button (green tint when dirty, muted when clean).
2. **Stage** — 16:9, `border-radius:16px`, `grid-template-columns: 246px 1fr`.
   - **Left rail (the menu selector — key deliverable):** a "Menu" micro-label, then one button per category. Each button = 30×30 angular icon chip (tone-tinted when active) + label + optional `SOON` tag. Active item: brighter bg, tone border, 3px tone left-bar, white text. Inactive: muted; "soon" items are further dimmed. Below a spacer sits **Restore defaults** (pink ghost).
   - **Main panel** switches on the selected category (see below), with a section kicker + Anton title header.
3. **Note toast** (top-right of the main panel): appears on save / reset / preset / test actions, ~2.4s, gold-bordered.

**Compactness rationale:** the rail is a single vertical list of same-height rows; adding a category is one array entry. "Soon" items are shown (not hidden) so the roadmap is visible without cluttering the active area.

### 2. Audio panel (inside `Settings.dc.html`, `section === 'Audio'`)
**Purpose:** Adjust all sound levels.

- **Master block** (gold left-bar card): big Anton `%` readout, a **wide slider**, a **live equalizer meter** (7 bars, `st-eq` animation, delay-staggered; freezes to flat gray when master is muted or at 0), and a **MUTE** button. Dragging master un-mutes it.
- **Channel rows** (one per channel, staggered `st-row` entrance): icon chip · label + one-line description (fixed 150px) · **slider** (flex) · `%` value (or `—` when muted) in the channel tone · **▶ test** button (fires a note toast) · **ON/OFF** mute toggle. Muted rows desaturate the fill to gray, drop the glow, and dim the value.

**Slider mechanics (custom, not native `<input type=range>`):**
- Track: 12px tall, `rgba(255,255,255,0.06)` bg, parallelogram clip.
- Fill: `linear-gradient(90deg,<tone>99,<tone>)`, width = value%, glow `0 0 14px <tone>66`.
- Handle: 16×22 chamfered white block, `left: value%`, `translate(-50%,-50%)`.
- **Drag:** `pointerdown` on the track captures its `getBoundingClientRect()`, converts pointer X → 0–100 (clamped), then a window `pointermove`/`pointerup` pair tracks the drag. Click-to-set works from the same handler. `transition: 0.06s linear` on fill/handle for smoothness.

### 3. Controls panel (embedded — `Keybinds Panel.dc.html`)
**Purpose:** Key rebinding, living under the same Settings menu.

- This is a **chrome-free extraction** of the standalone `Controls - Keybinds` screen: same category rail (Movement / Combat / Items / Interface), same rebindable rows (primary + alternate slots), same click-to-listen → press-key flow, auto-swap on conflict, right-click to clear, per-row + global reset, and the note toast. The outer page background, the Cleo/vs/Viking control bar, and the stage frame are **removed** so it drops cleanly into the shell's main panel (mounted full-bleed, `margin:0 -30px -22px` to reach the panel edges).
- The standalone `Controls - Keybinds.dc.html` remains as-is for full-screen use; this panel duplicates its binding data/logic. **In production, both should share one keybind module** rather than two copies.

### 4. Video / Gameplay (placeholder)
When a "soon" category is selected the main panel shows a centered ghost `SOON` with a one-line message. Wire these up as those features land; the rail item just flips `soon:false`.

---

## Interactions & Behavior

- **Category switching:** instant, client-side (`section` state). Panels fade/slide in (`st-panel` 0.3s).
- **Sliders:** live drag + click-to-set (see mechanics above). Master drag un-mutes.
- **Mute:** per-channel and master; visual-only in the prototype (no audio engine attached).
- **Test button:** fires a transient note toast ("Testing <channel>…"); in-product it should play a representative sample on that bus.
- **Dirty tracking:** header compares a serialized snapshot (`master, masterMuted, channels, device, preset`) against the last saved snapshot; Save stamps a new snapshot; Restore defaults resets everything.
- **Keybinds panel:** identical behavior to the standalone keybinds screen — click a slot → "Press a key…" (pulsing), press any key to bind; `Esc` cancels; right-click clears; conflicts auto-swap and raise a toast.

---

## State Management

### Settings shell / Audio (`Settings.dc.html`)
- `section`: active category (`'Audio' | 'Controls' | 'Video' | 'Gameplay'`). Prop `startSection` seeds it.
- `master` (0–100), `masterMuted` (bool).
- `channels`: map of `{ [id]: { value: 0–100, muted: bool } }` for `music / sfx / voice / ambience / ui`.
- `saved`: serialized snapshot for dirty comparison. `note`: transient toast string.
- Static config: `NAV` (rail items), `CHAN` (channel id/label/desc/icon/color/default). `defaults()` builds the reset/initial state.
- **Real integration:** map each channel to an audio-mixer bus; persist values to the player's profile/local store; `Save` commits, `Restore defaults` reverts to `defaults()`.

### Keybinds panel (`Keybinds Panel.dc.html`)
- `bindings`: `{ [actionId]: { primary, alt } }` of `KeyboardEvent.code` strings.
- `cat`: active category. `listening`: `{ id, slot } | null` while capturing. `note`: toast string.
- Static config: `GROUPS` (category→color), `defs()` (action list with defaults, icons/tags).
- **Real integration:** share one keybind store with the rest of the game; `code` values map to the engine's input layer.

---

## Assets
Pixel-art PNGs from the existing game (`assets/`), used only by the embedded keybinds panel's action icons:
- `assets/cleo/sun_fire_ball.png` — Special
- `assets/cleo_shield_icon.png` — Block
- `assets/pizza.png` — Use Item

The Audio panel uses **no image assets** — channel icons are text glyphs (`♫ ✸ ◈ ≈ ▮`). Swap for final iconography as needed. Fonts: **Anton** and **Oswald** via Google Fonts; use licensed equivalents in the target app if available.

All copy, default levels, and the channel list are **placeholder-quality defaults** — confirm the real channel taxonomy and starting values with audio/design.

## Files (in this bundle)
- `Settings.dc.html` — the settings shell (menu selector) + Audio panel; embeds the keybinds panel for the Controls category.
- `Keybinds Panel.dc.html` — chrome-free keybinds panel mounted inside the Controls category.
- (Both reference the shared prototyping runtime `support.js` and the `assets/` folder; they are design references, not runnable product code.)
