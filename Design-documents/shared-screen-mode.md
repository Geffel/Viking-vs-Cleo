# Shared Screen Mode

Plan for a local couch/shared-screen mode in Viking vs Cleo. Mark of each story when done. 

## Core Clarification

Shared screen means one shared full-screen arena where everyone sees the whole match at the same time.

This is not split screen. Each player should not get a separate small viewport.

That fits the current game well because the arena is already rendered as one full 16:9 world. The main work is therefore not camera work, but:

- multiple local players on one browser/websocket
- controller discovery and assignment
- shared character/map selection
- match locking
- disabling stats/achievements completely for this mode

## Goals

- Host can create a normal match using their usual name.
- Host can toggle the match into Shared Screen Mode from the match lobby.
- Once enabled, the lobby marks the match as closed so no remote player can join.
- Match behaves like an unranked solo/local match for persistence: no rating, profile stats, achievements, map vote stats, win/loss stats, combat stats, playtime, or leaderboard changes.
- Players use gamepads in character selection to join as local seats: `P1`, `P2`, `P3`, `P4`.
- Character selection shows which local player has picked which character, similar to how map selection shows voters.
- During the fight all players share one arena view.

## Non-Goals

- No split screen.
- No separate camera per player.
- No online players joining a shared-screen match.
- No persistent profiles for local seats beyond the host identity used to enter the lobby.
- No ranked/shared stats in the first version.
- No host migration in shared-screen matches.

## Recommended UX Flow

1. Player enters the game with their normal name.
2. Player creates a match.
3. In the match lobby, host sees a `Shared Screen` toggle/button.
4. Host enables Shared Screen Mode.
5. Server marks the match as:
   - `mode: "sharedScreen"`
   - `closed: true`
   - `statsEnabled: false`
6. Global lobby shows the match as closed/shared-screen and disables joining.
7. Character selection enters local-seat mode.
8. Connected gamepads can wake local cursors/slots:
   - first host/controller becomes `P1`
   - next active controller becomes `P2`
   - then `P3`, `P4`
9. A local cursor/selector labeled `P2`, `P3`, etc. can pick Cleo or Viking.
10. Character cards show player markers, for example `P1`, `P3` on Cleo and `P2` on Viking.
11. Once enough local players have picked, host starts the match.
12. Map selection either lets every local seat vote or host chooses alone. Recommended first version: every local seat can vote.
13. Fight starts with all local players in one shared arena view.
14. Results screen shows the score but clearly marks the round as unranked/shared screen.

## Stories And Subtasks

### Story 1: Host Can Enable Shared Screen Mode [done]

As a host, I want to switch my match into shared-screen mode so people beside me can play locally on the same screen.

Subtasks:

- Add `mode` or `sharedScreen` field to match state.
- Add `closed` or equivalent join-lock field to match state.
- Add server message/action, for example `setSharedScreenMode`.
- Only allow host to enable/disable it while match is in `matchLobby`.
- Block enabling if remote guests are already in the match, or decide to kick them with explicit UI. Recommended: block until only host is present.
- Reset ready/character/map state when toggling mode.
- Expose the mode in match snapshots.
- Add tests in `test/matches.mjs`.

Acceptance criteria:

- Host can enable shared screen in match lobby.
- Non-host cannot enable it.
- Mode cannot be toggled once map vote/countdown/playing/results has started.
- Snapshot includes enough fields for UI to render the mode.

### Story 2: Shared Screen Match Is Closed To Online Joiners [done]

As a player in global lobby, I should see that shared-screen matches are closed so I do not try to join a couch match.

Subtasks:

- Update server `joinMatch` validation to reject shared-screen/closed matches.
- Update global lobby UI to render `Shared screen` and `Closed` badges.
- Disable or hide join button for closed matches.
- Keep server validation as source of truth even if the UI is bypassed.
- Decide if shared-screen matches should appear in global lobby at all. Recommended: show them as closed for clarity.

Acceptance criteria:

- Shared-screen match cannot be joined from another browser.
- Global lobby clearly marks it as closed.
- Attempting to join via raw websocket/message returns a friendly error.

### Story 3: Local Seats Exist Inside A Shared-Screen Match [done]

As a host, I want multiple local players to exist in one match without each player needing their own browser tab.

Subtasks:

- Add local seat model to match state, for example:

```js
{
  id: "P2",
  ownerSessionId: 1,
  inputDevice: { type: "gamepad", index: 1 },
  name: "P2",
  character: "viking",
  ready: false,
  mapVote: null,
  playerId: 0
}
```

- Decide if the host row is also `P1` or if seats are a separate collection. Recommended: in shared mode, convert host to seat `P1`.
- Keep local seats separate from online match players in code where possible.
- Add helper methods in match registry:
  - add/update/remove seat
  - set seat character
  - set seat ready
  - set seat map vote
  - map seat to game player
- Limit max seats, recommended `4`.

Acceptance criteria:

- A shared-screen match can contain multiple local seats owned by the host connection.
- Match snapshot exposes all seats for UI.
- Existing normal online match flow still works.

### Story 4: Gamepads Wake Local Player Cursors In Character Selection [done]

As a local player, I want to press a button or move a stick on my controller and get my own `P2` selector.

Subtasks:

- Add a pre-game gamepad scanner that runs in shared-screen character selection.
- Detect meaningful input:
  - stick movement beyond deadzone
  - d-pad press
  - confirm button press
- Assign unclaimed gamepads to next seat.
- Show a virtual selector/cursor labeled `P1`, `P2`, etc.
- Use edge-triggered button handling so holding A does not select repeatedly.
- Add deadzones to avoid stick drift waking players accidentally.
- Handle gamepad disconnect/reconnect gracefully.
- Decide keyboard behavior. Recommended:
  - keyboard/mouse remains host/P1
  - gamepads become P2+
  - optionally let first gamepad be P1 if keyboard is not used

Acceptance criteria:

- Pressing a controller in character select creates or wakes a local seat.
- Each active controller controls only its own selector.
- Selectors are visibly labeled by player.
- Accidental tiny stick drift does not create players.

### Story 5: Character Selection Supports Multiple Local Players [done]

As local players, we want to choose characters independently and see who picked what.

Subtasks:

- Update character select UI to render seat markers on character options.
- Allow multiple seats to choose the same character/team unless game design decides otherwise.
- Make confirm/select action update that seat's character.
- Allow back/cancel to unselect or leave seat.
- Update ready/start rules for shared mode:
  - host can start when at least 2 seats have selected a character
  - or require all active seats to select a character
  - recommended: all active seats must select, minimum 2 active seats
- Make `allCharactersChosen` account for seats in shared mode.

Acceptance criteria:

- `P1`, `P2`, etc. can choose independently.
- UI shows all seat choices.
- Start button is enabled only when shared-screen rules are satisfied.

### Story 6: Map Selection Works With Local Seats [done]

As local players, we want to choose or vote for a map before the fight.

Recommended approach: reuse the current map voting concept, but let each local seat vote.

Subtasks:

- Extend map vote state to support seat ids, not only session ids.
- Render vote pills using `P1`, `P2`, etc.
- Let each local controller move/select in map vote.
- Keep existing online map vote behavior unchanged.
- Resolve ties the same way as today, but define host/seat tie-break. Recommended: `P1` vote breaks ties.

Alternative:

- Host alone chooses the map in shared-screen mode. This is simpler but less social.

Acceptance criteria:

- Local seats can vote/select maps.
- UI shows who voted for each map.
- Countdown starts when all active seats have voted or when timer expires.

### Story 7: Fight Input Supports Multiple Local Players [done]

As local players, we need our controllers to control our own fighters during the match.

Subtasks:

- Refactor `public/js/input.js` so it can track multiple input sources independently.
- In shared mode, send input messages with `seatId`, for example:

```js
{ t: "move", seatId: "P2", l: true, r: false }
{ t: "act", seatId: "P2", a: "jump" }
{ t: "actup", seatId: "P2", a: "jump" }
```

- Server maps `seatId` to the correct `playerId`.
- Keep existing input messages working for normal online mode.
- Make sure held buttons release on blur/disconnect.
- Prevent one controller from controlling multiple seats.

Acceptance criteria:

- Every local controller moves only its own character.
- Normal online single-player input still works.
- Losing focus releases all held movement/actions.

### Story 8: Server Spawns Local Seats As Real Game Players [done]

As the game engine, shared-screen seats should become normal `Game` players so combat logic stays centralized.

Subtasks:

- Update `prepareGameForMatch` to spawn every active local seat.
- Store `seatId -> playerId`.
- Use seat display name (`P1`, `P2`) or maybe `HostName P1`.
- Set `profileId: 0` and `clientId: null` for local seats to avoid persistence.
- Send `gameReady` with all local player ids, for example `localPlayers: [{ seatId, playerId, team }]`.
- Update client net state from one `selfId` to multiple local ids in shared mode.

Acceptance criteria:

- Shared-screen seats appear as normal fighters in the arena.
- Combat, respawn, scoring, abilities and collisions use existing game logic.
- No local seat has a persistent profile id.

### Story 9: Rendering Stays Shared Full-Screen [done]

As players on the couch, we want one shared arena view.

Subtasks:

- Keep current single-canvas renderer.
- Avoid split screen and per-player cameras.
- Treat all local players as "mine" for local-only visual effects if needed.
- Add optional player labels/markers above fighters so people can find `P1`, `P2`, etc.
- Update renderer API from one `selfId` to maybe `localPlayerIds`.

Acceptance criteria:

- Fight view remains one full arena.
- All players are visible at once.
- Local players are easy to identify.

### Story 10: HUD Supports Shared-Screen Mode [done]

As local players, we need enough HUD information without covering the shared arena.

Subtasks:

- Decide first-version HUD scope.
- Recommended first version:
  - keep team score global
  - show compact per-seat strips for HP/dead/respawn and selected character
  - do not show full ability cooldown grid for every player initially unless needed
- Alternative full HUD:
  - one mini ability bar per local seat
  - more complete but risks clutter
- Update `Hud` to support shared mode.
- Make respawn indicators per player, not just `net.self()`.

Acceptance criteria:

- No UI assumes only one local self player.
- Players can tell when they are dead/respawning.
- HUD remains readable on one shared screen.

### Story 11: Stats And Achievements Are Fully Disabled [done]

As a player, shared-screen mode should not affect my online stats, rankings, achievements, or leaderboard.

This is important because the current server has several stat paths:

- final match result stats
- live kill/combat events from snapshots
- map vote stats
- active profile playtime/kills autosave
- achievement unlocks

Subtasks:

- Add match-level `statsEnabled: false`.
- Skip `recordMapVoteStats(match)` for shared-screen matches.
- Skip `recordMatchResult(match, matchGame)` processing for shared-screen matches, except clearing feeds/events.
- Update `sendGameSnapshot` so it does not call `processKillStats` or `processStatEvents` for stats-disabled match games.
- Do not call `activateProfile` for local seats.
- Ensure local seats use `profileId: 0`.
- Ensure autosave/checkpoint cannot commit local seat playtime/kills.
- Add `unrankedReason: "sharedScreen"`.
- Update results label to something like `Shared screen - no stats recorded`.

Acceptance criteria:

- Shared-screen matches do not change leaderboard.
- No achievements unlock from shared-screen play.
- No combat/map/match/profile stats persist.
- Results screen clearly says stats were disabled.

### Story 12: Results And New Round Work In Shared Mode [done]

As a host, I want to see the result and start another local round quickly.

Subtasks:

- Results screen shows final score.
- Results screen uses shared-screen unranked label.
- `New round` returns to shared-screen character lobby or keeps seats and only clears ready/map/character depending on desired UX.
- Recommended:
  - keep active seats/controllers
  - clear ready/map votes
  - keep character picks if players want rematch speed, or add "change fighter"
- Do not send players back to global lobby unless host leaves match.

Acceptance criteria:

- Shared-screen result flow works.
- Host can start another round without rejoining controllers.
- Stats remain disabled across rounds.

## Important Implementation Notes

### Current Input Limitation

`public/js/input.js` currently merges keyboard and the first connected gamepad into one local player. Shared-screen mode needs independent input state per controller/seat.

### Current Net Limitation

`public/js/net.js` currently tracks one `selfId`. Shared-screen mode needs multiple local player ids, for example:

```js
localPlayers: new Map([
  ["P1", { playerId: 12, team: "cleo" }],
  ["P2", { playerId: 13, team: "viking" }]
])
```

### Current Stats Trap

Setting `resultCounts=false` is not enough. The server currently processes snapshot events during live play. Shared-screen needs a broader `statsEnabled=false` guard.

### Current Character Meaning

The current code uses `character` mostly as team/side: `cleo` or `viking`. Multiple players can technically choose the same side unless we explicitly forbid it.

Decision needed:

- Allow any number of local players per side. Recommended.
- Or require balanced sides. This may be better for fairness but worse for casual couch play.

### Current Arena Fit

The game world is already full-screen 16:9 and all of it is visible. No split-screen work is needed for the current maps.

Future risk:

- If future maps are larger than the shared camera, shared-screen mode will need either map restrictions, zoom-out, or a camera that frames all players.

## Risks And Edge Cases

- Gamepad API may not expose controllers until each player presses a button.
- Gamepad indexes can change after disconnect/reconnect.
- Stick drift can accidentally wake seats.
- Browser focus loss can leave actions stuck unless all input sources release.
- Host leaving should end the shared-screen match.
- Remote players already in lobby when shared mode is toggled need a rule. Recommended: block toggle until only host remains.
- Existing lobby currently allows joining ongoing matches. Shared-screen must override this.
- HUD can become cluttered if every player gets full cooldown UI.
- Audio currently follows one listener. Shared-screen should use arena/global audio or first local player as fallback.
- Achievements must not unlock from local/shared play.

## Alternatives Considered

### Alternative A: Full Local Seat Model

Best long-term approach.

Pros:

- Correct architecture.
- Clean distinction between online players and local seats.
- Supports P1-P4 properly.
- Works with map vote, character select, future local features.

Cons:

- Most implementation work.
- Requires touching lobby, server match model, net state, input, HUD.

Recommendation: use this.

### Alternative B: Host-Only Selection, Multi-Controller Fight

Host chooses characters/map for everyone, then controllers only matter during fight.

Pros:

- Faster to build.
- Less UI work in character/map select.

Cons:

- Worse couch UX.
- Does not match the desired `P2` cursor idea.

### Alternative C: Multiple Browser Tabs On Same Machine

Each local player opens their own tab/window.

Pros:

- Minimal server changes.

Cons:

- Not truly shared-screen.
- Browser focus/input becomes painful.
- Gamepads may control wrong tab.
- Poor user experience.

Recommendation: avoid.

### Alternative D: Client-Only Offline Mode

Run the entire match locally in the browser.

Pros:

- No websocket seat routing.
- Could be fully isolated from stats.

Cons:

- Duplicates server game logic or requires moving the engine.
- Higher risk of drift/bugs.
- Large refactor.

Recommendation: avoid for now.

## Suggested Delivery Phases

### Phase 1: Match Mode And Locking

- Add shared-screen mode field.
- Add host toggle.
- Lock join.
- Disable stats at match level.
- Add lobby badges.
- Add tests.

### Phase 2: Local Seats In Lobby

- Add seat model.
- Add gamepad discovery in character select.
- Add P1-P4 markers.
- Start match from local seats.

### Phase 3: Multi-Seat Fight Input

- Refactor input to support per-seat sources.
- Add seat-aware server input handling.
- Spawn local seats as game players.
- Track multiple local player ids client-side.

### Phase 4: Map Vote And Results Polish

- Seat-aware map voting.
- Shared-screen result label.
- New-round flow.
- Better P1-P4 labels.

### Phase 5: HUD And Polish

- Compact shared-screen HUD.
- Disconnect/reconnect handling.
- Audio listener behavior.
- Controller assignment polish.

## First-Version Recommendation

Build a conservative first version:

- Max 4 local seats.
- One shared arena view.
- Gamepads for P2-P4.
- Keyboard/mouse remains P1/host.
- Online join disabled.
- Stats and achievements fully disabled.
- Let multiple players choose the same side.
- Keep HUD compact and improve it after the core mode works.
