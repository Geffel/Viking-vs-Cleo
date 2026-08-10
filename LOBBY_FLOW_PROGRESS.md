# Lobby Flow Progress

Den har filen sammanfattar lobby- och matchflodet som precis byggts som ramverk.
Fokus har varit funktion och struktur, inte slutlig design.

## Klart

1. Intro
   - Nar man oppnar spelet visas forst en enkel namnsida.
   - Spelaren skriver in namn och trycker Enter.
   - Efter identifiering hamnar spelaren i global lobby.

2. Global lobby
   - Visar tillgangliga matcher.
   - Spelare kan skapa en egen match.
   - Spelare kan joina matcher som fortfarande ar i matchlobby-fasen.

3. Match lobby
   - Visar alla spelare i matchen.
   - Visar vem som ar host.
   - Spelare kan valja ready/not ready.
   - Hosten kan starta matchen aven om alla inte ar ready.
   - Alla maste dock ha valt karaktar innan hosten kan starta.

4. Karaktarval
   - Spelaren har ingen karaktar vald automatiskt.
   - Spelaren maste sjalv valja Cleo eller Viking.
   - Byte av karaktar satter spelaren till not ready igen.

5. Kartrostning
   - Nar hosten startar matchen gar matchen till kartrostning.
   - Alla kartor i `MAPS` visas som knappar.
   - Spelarnas roster visas live pa vald kartknapp.
   - Om flera kartor far lika manga roster avgor hostens rost.
   - Rostningen har en timer pa 30 sekunder.

6. Countdown och fight-start
   - Efter kartrostningen spawnas spelarna in.
   - En stor countdown visas i 5 sekunder.
   - Nar countdown ar klar visas "FIGHT".
   - Input ar last fram till `playing`-fasen.

7. Separata matcher
   - Servern har nu en egen `Game`-instans per aktiv match.
   - Det gor att flera matcher kan ga igenom countdown/playing utan att dela arena-state.
   - Den gamla direkta join-vagen finns kvar som legacy fallback.

8. Resultat och ny runda
   - Hosten kan avsluta en pagaende runda.
   - Matchen gar da till resultatfas.
   - Resultatet visar aktuell score.
   - Hosten kan trycka "Ny runda" for att aterga till matchlobby.
   - Vid ny runda nollas ready och karaktarval, sa spelare valjer om.

## Viktiga filer

- `shared/constants.js`
  - Innehaller matchfaser, timers och listan `MAPS`.

- `server/matches.js`
  - Haller matchlobby-state, ready, karaktarval, kartroster, resultat och fasbyten.

- `server/index.js`
  - Kopplar WebSocket-meddelanden till matchregistret.
  - Skapar separata `Game`-instanser for aktiva matcher.
  - Skickar lobby-, match- och game-state till ratt spelare.

- `server/game.js`
  - Har `reset()` sa en arena kan rensas mellan rundor.

- `public/js/net.js`
  - Klientens WebSocket-lager.
  - Har metoder for identify, create/join/leave match, ready, character, start, vote, finish och reset.

- `public/js/main.js`
  - Styr vyer och UI-state for intro, global lobby, match lobby, kartrostning, game och resultat.

- `public/index.html`
  - Innehaller wireframe-element for intro, lobby, matchrum, kartrostning, resultat och fight-overlay.

- `public/css/style.css`
  - Minimal styling och tydliga krokar for kommande design.

## Design-hookar

Designappen kan rikta in sig pa dessa huvudytor:

- `#intro`
- `#global-lobby`
- `#match-room`
- `#character-select`
- `#map-vote`
- `.map-option`
- `.vote-pill`
- `#round-results`
- `#fight-overlay`
- `#finish-match`
- `#reset-match`

## Kvar att bygga

1. Fler kartor och riktig koppling mellan vald karta och spelkarta.
2. Automatisk matchslut, till exempel score limit eller matchtimer.
3. Mer detaljerad resultatsida med kills, deaths, vinnare och MVP.
4. Reconnect/refresh-stod sa en spelare kan komma tillbaka till samma match.
5. Fler lobbyregler, till exempel max antal spelare, lockad match eller tydligare host migration.
6. Slutlig design fran designappen.

## Verifiering hittills

- Syntaxkontroller har korts med `node --check` pa andrade server- och klientfiler.
- Ingen testsvit har korts under utvecklingsfasen, enligt beslutet att ta tester senare.
- Senaste dev-servern startades pa `http://127.0.0.1:3004`.
