# Viking vs Cleo – förbättringsplan

Senast uppdaterad: **2026-10-27**.

Arbetslista från kodgranskningen och efterföljande nätverksarbete. Dokumentet
samlar identifierade problem, föreslagna förbättringar och verifieringskrav.
Prioriteringen är ett förslag; öppna punkter är inte automatiskt godkända för implementation.

**Överenskommen avgränsning:** profilhanteringen tas som ett separat arbete senare.
Träffkontrollens tidsmodell och validering av inkommande nätverksmeddelanden är
implementerade. Lokal rörelseförutsägelse är fortfarande öppen.

## Status och prioritet

- **Öppen:** identifierat fel eller konkret förbättring som återstår.
- **Utred:** möjlig flaskhals eller designförändring som behöver mätning eller beslut.
- **Implementerad:** ändringen finns i koden och har automatiska tester. Detta innebär inte att spelkänslan är verifierad på alla datorer och nätverk.
- **P1:** stabilitet, korrekt spelutfall eller risk för gemensamma serverhack.
- **P2:** spelkänsla, statistik och tydliga optimeringsmöjligheter.
- **P3:** underhåll och förbättringar som kan vänta på mätresultat.

| ID | Prioritet | Förbättring | Status |
| --- | --- | --- | --- |
| IMP-01 | P1 | Flytta profilskrivning från spellopen | Planerad i [PROFILE_AUTH_WORKPLAN.md](PROFILE_AUTH_WORKPLAN.md) |
| IMP-02 | P1 | Träffkontroll mot faktiskt ritad bild | Implementerad |
| IMP-03 | P1 | Validera nätverksmeddelanden och begränsa paketstorlek | Implementerad |
| IMP-04 | P2 | Registrera resultat och kart­röster för varje rond | Implementerad |
| IMP-05 | P2 | Ta bort dubbelräkning av kills | Implementerad |
| IMP-06 | P2 | Hindra profil-ID 0 från att bli profil 1 | Implementerad |
| IMP-07 | P2 | Uppdatera delad HUD utan att bygga om hela innehållet | Öppen |
| IMP-08 | P2 | Lokal rörelseförutsägelse och serverkorrigering | Öppen |
| IMP-09 | P2 | Kontrollera köbildning hos långsamma nätverksklienter | Öppen |
| IMP-10 | P2 | Anpassa interpolationsbufferten efter mätningar | Utred |
| IMP-11 | P3 | Minska överdimensionerade spelbilder | Utred |
| IMP-12 | P3 | Minska kostnaden för grafikeffekter och erbjuda kvalitetsval | Utred |
| IMP-13 | P2 | Gör MVP-valet prestationsbaserat | Öppen |
| IMP-14 | P3 | Separera statistik och lagring från nätverk och matchlivscykel | Öppen – separat profilarbete |
| IMP-15 | P2 | Samla testsviterna och isolera testernas profildata | Implementerad |

## IMP-01 – Profilskrivning utanför spellopen

**Planerad:** punkten ingår som ett eget delarbete i
[arbetsdokumentet för konton, profilmigrering och SQLite](PROFILE_AUTH_WORKPLAN.md).
Verifieringskraven nedan är överförda dit och ska följas upp tillsammans med
datamigreringen.

**Fynd:** träffar, förmågor och kills kan utlösa serialisering och synkron
omskrivning av hela profilfilen på samma tråd som matcherna. Achievement-kontrollen
går samtidigt igenom samtliga profiler. En isolerad kontroll av kodvägen gav
30 filomskrivningar för 30 omgångar träffhändelser. Faktisk diskfördröjning och
dess effekt på ticktider är inte uppmätt.

**Förslag:** behåll matchtillståndet i minnet, samla ändringar och använd en
skrivkö utanför speltråden. SQLite är föreslaget som framtida lagring, med
transaktioner och WAL. Databasbyte ensamt löser inte blockering på speltråden.
Utvärdera achievements för berörda profiler och undvik upprepade fulla genomgångar.

**Berört:** [server/index.js](server/index.js): `processStatEvents`,
`processKillStats`, `unlockPendingAchievements`, `saveProfiles`.

**Klart när:**

- [ ] Strid orsakar inga synkrona diskoperationer på speltråden.
- [ ] Kö, felhantering och avstängning bevarar ordningen utan dubbelregistrering.
- [ ] Tillåten förlust av ännu osparad statistik vid hård krasch är bestämd och testad.
- [ ] Befintliga profiler kan migreras med verifierade totalsummor och återställningsmöjlighet om SQLite väljs.
- [ ] Ticktidens p95/p99 och längsta paus har jämförts före/efter under strid och sparning.

## IMP-02 – Träffkontroll mot faktiskt ritad bild

**Ursprungligt fel:** klienten interpolerade efter paketens ankomsttider medan
servern spolade tillbaka med en annan tidsberäkning. Vid 100 ms RTT reproducerades
en motståndare ritad på x=270 men prövad på x=285: 15 pixlars skillnad.

**Implementerat:** snapshots innehåller simulationstid, sekvensnummer och
spelomgångens identitet. Närstridsinput refererar till senast ritade snapshots,
interpolationsandel och lokal extrapolering. Servern återskapar positionerna ur
sin egen historik med samma beräkningar som klienten. Positioner från klienten
accepteras inte. Tidsbudget, framtida positioner, fel spelomgång och tidigare liv
kontrolleras. Delad skärm använder rätt sampling för lokala motståndare.

**Berört:** [server/game.js](server/game.js), [public/js/net.js](public/js/net.js),
[shared/netcode.js](shared/netcode.js), [test/netcode.mjs](test/netcode.mjs).

**Verifierat:** automatiska tester för 0, 30, 60, 100 och 150 ms RTT med och utan
jitter; synliga träffar och missar; ny snapshot mellan ritning och input;
respawn; delad skärm; gamla och manipulerade referenser; begränsad historik.

**Begränsning:** gäller närstrid och innebär inte lokal rörelseförutsägelse.
Tillbakaspolning är begränsad till högst 250 ms. Äldre klienter utan bildreferenser
använder en begränsad uppskattning och får inte samma exakta bildmatchning.

- [x] Implementerat och automatiskt testat.
- [ ] Speltesta på verkligt LAN/wifi och bedöm träffkänsla vid ojämn fördröjning.

## IMP-03 – Validering av nätverksmeddelanden

**Ursprungligt fel:** giltig JSON som `null` passerade parsningen och orsakade ett
ohanterat undantag när servern läste `msg.t`.

**Implementerat:** typ- och fältvalidering före spellogiken, kontroll av tillåtna
meddelanden och värden, avvisning av binära meddelanden och en inkommande
paketgräns på 4 KiB. WebSocket-fel från felaktiga/för stora paket hanteras utan
att fälla servern.

**Berört:** [server/protocol.js](server/protocol.js),
[server/index.js](server/index.js), [test/server-protocol.mjs](test/server-protocol.mjs).

- [x] Felaktig JSON, primitiva värden och felaktiga fält avvisas.
- [x] För stora paket stänger den berörda anslutningen; servern svarar fortsatt.
- [x] Giltig input och närstrid med bildreferenser fungerar över riktiga WebSocket-anslutningar.

## IMP-04 – Resultat per rond

**Bekräftat fel:** skyddet mot dubbelregistrering använder match/lobby-ID som
behålls när nästa rond startar. Två ronder i samma lobby gav fortfarande en
registrerad match. Även kart­röstningsstatistik påverkas.

**Förslag:** ge varje rond en egen identitet och använd den för resultat och
röstningsstatistik. Behåll skydd mot att samma rond registreras flera gånger.
Rensa också förbrukade registreringsmarkeringar när de inte längre behövs.
Nätverkets nya spelomgångsidentitet i IMP-02 löser inte automatiskt denna statistikbugg.

**Berört:** [server/index.js](server/index.js): `recordMapVoteStats`,
`recordMatchResult`; [server/matches.js](server/matches.js): `resetToLobby`.

**Klart när:**

- [x] Tre ronder i samma lobby ger tre resultat och tre ronders röstningsstatistik.
- [x] Upprepad registrering av samma resultat räknas exakt en gång.
- [x] Träning och delad skärm fortsätter följa sina statistikregler.

## IMP-05 – Kills räknas dubbelt före sparcheckpunkt

**Bekräftat fel:** `buildProfileView` summerar motståndarstatistik och lägger till
pågående sessionskills som redan kan vara registrerade där. En kill visades som
två och sjönk till en efter `commitPending`.

**Förslag:** välj en entydig källa för killantal. Separera sparat och ännu osparat
utan att lägga samma händelse till flera gånger i den visade totalsumman.

**Berört:** [server/index.js](server/index.js): `buildProfileView`,
`processKillStats`, `commitPending`.

**Klart när:**

- [x] En kill visas som en före och efter checkpoint, disconnect och serveromstart.
- [x] Leaderboard och achievements använder samma korrekta antal.

## IMP-06 – Profil-ID 0 får inte mappas till profil 1

**Bekräftat fel:** `Math.max(1, Number(ref?.profileId) || 0)` i `statProfile`
omvandlar avsaknad av profil till ID 1. Liknande omvandling finns i
`processKillStats`. Händelser utan riktig profil kan därför påverka första
användaren i kodvägar där statistik är aktiverad.

**Implementerat:** saknade och ogiltiga profil-ID:n behandlas som frånvaro i
både stridshändelser och killstatistik. Giltiga positiva heltals-ID:n behåller
det befintliga beteendet och lagringsformatet är oförändrat.

**Berört:** [server/index.js](server/index.js): `statProfile`, `processKillStats`;
[server/profile-ids.js](server/profile-ids.js);
[test/profile-attribution.mjs](test/profile-attribution.mjs).

**Klart när:**

- [x] Händelser med ID 0 eller saknat ID lämnar alla sparade profiler oförändrade.
- [x] Gäster och registrerade spelare fungerar tillsammans utan felaktig attribution.

## IMP-07 – Delad HUD utan full ombyggnad

**Fynd:** `updateShared()` ersätter hela HUD-innehållet med `innerHTML` varje
bildruta. Webbläsaren river och skapar elementen även när få värden förändrats.
Mönstret är bekräftat; faktisk FPS-vinst är inte uppmätt.

**Förslag:** skapa element per plats/förmåga när uppsättningen ändras. Uppdatera
bara ändrade texter, klasser och indikatorer under spelet.

**Berört:** [public/js/hud.js](public/js/hud.js): `updateShared`;
[public/js/main.js](public/js/main.js): renderloopen.

**Klart när:**

- [ ] Oförändrad HUD återanvänder samma DOM-element mellan bildrutor.
- [ ] Cooldowns, combos, död och byte av deltagare visas korrekt för 2–4 spelare.
- [ ] Script-, layout- och renderingstid har jämförts under motsvarande belastning.

## IMP-08 – Lokal rörelseförutsägelse

**Fynd:** klienten extrapolerar senaste hastighet men väntar på servern för att
visa effekten av nya rörelseinputs. Hög FPS tar därför inte bort inputfördröjningen.

**Förslag:** dela rörelseregler mellan klient och server. Numrera inputs, låt
servern bekräfta behandlade inputs och låt klienten spela om återstående inputs
från det auktoritativa tillståndet. Mjuka ut små visuella korrigeringar. Servern
fortsätter bestämma skada, död och övrigt avgörande spelutfall.

**Beroenden:** bygg vidare på IMP-02. När egen rörelserendering ändras måste
träffkontrollens återskapande av angriparens visade position uppdateras samtidigt.

**Berört:** [public/js/input.js](public/js/input.js),
[public/js/net.js](public/js/net.js), [server/game.js](server/game.js),
[shared/netcode.js](shared/netcode.js).

**Klart när:**

- [ ] Gång, stopp, riktningsbyte, hopp och plattformsdropp reagerar lokalt utan nätverksväntan.
- [ ] Serverkorrigering fungerar vid kollision, stun, laddning, dash, teleport och respawn.
- [ ] Delad skärm hanterar varje spelares inputs separat.
- [ ] Input-till-bild-tid samt korrigeringarnas storlek/frekvens mäts vid 0–150 ms RTT och jitter.
- [ ] Träffkontrollens regressionstester passerar med den nya lokala rörelsen.

## IMP-09 – Begränsa köbildning för långsamma klienter

**Fynd:** snapshot-utskicken kontrollerar inte `bufferedAmount`. Vid en långsam
anslutning kan gamla snapshots samlas i kön och öka både fördröjning och minnesbehov.
Problemet är en identifierad risk; det har inte belastningsmätts på riktigt nätverk.

**Förslag:** definiera en kögräns och en policy för långsamma klienter. Prioritera
aktuellt spel­tillstånd, men skilj det från engångshändelser så att killfeed och
andra viktiga händelser inte tappas när snapshots hoppas över.

**Viktigt beroende:** IMP-02 kontrollerar i dag att interpolerade snapshots är
intilliggande i serverns sekvens. Om servern börjar hoppa över utskick per klient
måste denna kontroll och testningen anpassas till vilka snapshots klienten fick.

**Berört:** [server/index.js](server/index.js): `send`, `broadcastTo`,
`sendGameSnapshot`; [server/game.js](server/game.js): `attackView`.

**Klart när:**

- [ ] En långsam klient kan inte bygga en obegränsad sändkö.
- [ ] Övriga spelare fortsätter utan påverkan från den långsamma anslutningen.
- [ ] Viktiga engångshändelser och träffkontroll fungerar med vald köpolicy.

## IMP-10 – Mät och trimma interpolationsbufferten

**Designavvägning:** bufferten ger mjukare rörelse men gör motståndarnas bild äldre.
Nuvarande 50 ms och 60 Hz simulering/30 Hz snapshots är en utgångspunkt, inte
ett verifierat optimum för alla nätverk. IMP-02 gör tidsmodellen konsekvent men
tar inte bort avvägningen.

**Förslag:** mät först under LAN och wifi. Utvärdera sedan en lägre eller försiktigt
anpassningsbar buffert, med stabila gränser så att fördröjningen inte pendlar.

**Klart när:**

- [ ] Bildålder, buffertbrist/frysningar och jitter är uppmätta.
- [ ] Vald buffert förbättrar respons utan oacceptabel ryckighet.
- [ ] Serverns tidsbudget och träffkontroll fungerar för hela det tillåtna intervallet.

## IMP-11 – Anpassa spelbildernas upplösning

**Uppmätt:** flera bilder för små objekt är 1024 × 1024 pixlar, motsvarande cirka
4 MiB RGBA-data per bild före eventuella extra kopior. Harpunen visas 76
världspixlar lång. Filstorlek, avkodad storlek och faktisk grafikminnesanvändning
är olika mått; bara de två första har kontrollerats här.

**Förslag:** skapa spelanpassade storlekar och beskär onödig transparent yta där
det fungerar. Behåll original som källmaterial och kontrollera kvalitet vid
maximal visningsstorlek. Justera källrektanglar/ankarpunkter vid beskärning.

**Berört:** `public/assets/cleo_shield_icon.png`,
`public/assets/viking_harpoon_projectile.png`, Sun fire-bilderna i `public/assets/cleo/`,
[public/js/render.js](public/js/render.js).

**Klart när:**

- [ ] Nedladdningsstorlek och avkodad bildstorlek är jämförda före/efter.
- [ ] Ikoner, projektiler och effekter ser korrekta ut vid stödda upplösningar.
- [ ] Sprite-utsnitt, placering och animationer är visuellt kontrollerade.

## IMP-12 – Grafikeffekter och kvalitetsval

**Fynd:** skogskartan ritar 75 eldflugor i två pass och skapar gradienter under
ritningen. Flera miljö- och stridseffekter använder glöd, gradienter och stora
transparenta lager. Dessa är kandidater för profilering, inte bevisade huvudflaskhalsar.

**Förslag:** profilera tom arena och intensiv strid separat. Prova återanvända
glödbilder i stället för nykonstruerade gradienter där utseendet tillåter det.
Erbjud effekt-/kvalitetsnivåer via Video-inställningarna när nyttan är bekräftad.

**Berört:** [public/js/render.js](public/js/render.js): bland annat
`drawFireflies`, dimma, glöd och stridseffekter;
[public/js/settings.js](public/js/settings.js): Video är i dag en platshållare.

**Klart när:**

- [ ] De dyraste ritpassen är identifierade med profileringsdata.
- [ ] Bildrutetidens p95/p99 förbättras i jämförbara scenarier.
- [ ] Viktiga signaler för träffar och förmågor är tydliga även på låg kvalitetsnivå.

## IMP-13 – MVP efter prestation

**Bekräftat designproblem:** resultatvyn väljer första spelaren i vinnande laget,
inte spelaren med bäst prestation. Vid oavgjort kan värden användas som reservval.

**Förslag:** bestäm en enkel och synlig MVP-regel, inklusive oavgjort och lika
prestation. Beräkna från serverns rondresultat. Alternativt ta bort MVP-etiketten
tills en riktig regel finns.

**Berört:** [public/js/main.js](public/js/main.js): `renderRoundResults`.

**Klart när:**

- [ ] MVP följer den beslutade regeln oavsett anslutningsordning.
- [ ] Oavgjort, lika poäng, sena anslutningar och avhopp hanteras uttryckligen.
- [ ] Resultatvyn har tillgång till rätt rondstatistik även efter att spelinstansen städats bort.

## IMP-14 – Separera statistik och lagring

**Fynd:** `server/index.js` ansvarar samtidigt för anslutningar, matchflöde,
profiler, statistik, achievements och lagring. Den kopplingen gör exempelvis
rond- och profilfel svårare att isolera och testa.

**Förslag:** samla statistikuppdatering i en egen modul och lagring bakom ett
tydligt gränssnitt. Indexera profiler efter profil-ID i stället för att söka
linjärt vid varje uppslagning. Återanvänd gemensamma leaderboard-/lobbyberäkningar
inom samma broadcast i stället för att bygga dem på nytt för varje mottagare.
Storleken på dessa prestandavinster är inte mätt.

**Beroenden:** lämpligt tillsammans med IMP-01 och regressionstester för IMP-04–06.

**Berört:** [server/index.js](server/index.js): profil- och statistikfunktioner,
`getProfileById`, `lobbySnapshotFor`, `broadcastLobby`.

**Klart när:**

- [ ] Statistik kan testas utan HTTP-server, WebSocket-anslutning eller verklig disk.
- [ ] Lagringsfel kan testas utan att påverka matchsimuleringen.
- [ ] Profiler, resultat och achievements behåller definierat beteende genom flytten.

## IMP-15 – Samlade och isolerade tester

**Ursprungliga problem:** `npm test` och `test/run-all.mjs` körde olika sviter.
Testservern använde samma profilfil som den vanliga servern.

**Implementerat:** `npm test` använder den gemensamma köraren med samtliga
12 sviter, inklusive nätverkstesterna. Integrations- och smoke-tester använder
egna processer, automatiskt tilldelade portar och tillfälliga profilkataloger.
`npm run test:net` kör de två nya nätverkssviterna separat.

**Berört:** [package.json](package.json), [test/run-all.mjs](test/run-all.mjs),
[test/test-server.mjs](test/test-server.mjs).

- [x] Samtliga 12 sviter passerade efter nätverksändringarna.
- [x] Kontroll av profilfilens hash visade att testkörningen inte ändrade den.
- [x] Ogiltiga nätverkspaket testas mot en egen testserver.

## Föreslagen arbetsordning

1. Speltesta IMP-02 på riktigt LAN/wifi och samla en baslinje för spelkänslan.
2. Ta IMP-08 för direktare rörelserespons, med gemensam verifiering av träffkontrollen.
3. Ta IMP-07 som en avgränsad klientoptimering, särskilt för fyra lokala spelare.
4. Mät och hantera nätverksköer och buffert i IMP-09–10.
5. När profilarbetet tas upp: samla IMP-01, IMP-04–06 och IMP-14 i ett eget arbete.
6. Avgör MVP-regeln och prioritera bild-/effektoptimering efter mätning.

Prioritet och arbetsordning skiljer sig här eftersom profilarbetet uttryckligen
är uppskjutet. Profilbuggarna bör inte betraktas som lösta av nätverksfixarna.

## Mätunderlag och begränsningar

Vid den ursprungliga granskningen kördes en lätt syntetisk simulering med
2, 4, 8, 16 och 32 spelare. Simulering inklusive snapshot-serialisering låg då
under 0,1 ms vid 95:e percentilen per tick på den aktuella datorn. Testet omfattade
inte profilskrivning, verklig nätverkstrafik eller grafik och gjordes före den nya
snapshot-historiken. Det är ingen garanti för nuvarande total serverprestanda.

Webbläsarens faktiska FPS och grafikens CPU/GPU-kostnad har inte profilerats.
Det finns därför inget belägg ännu för att byta renderingsmotor eller optimera
kollisionsalgoritmer för det avsedda spelarantalet.

Bra befintliga beslut att bevara: servern avgör spelutfall, balansdata delas,
canvasupplösningen begränsas och arenan ritas inte bakom menyerna.

## Så använder vi dokumentet

Använd ID:t i uppgifter, exempelvis: **”Ta IMP-07”**. Vid arbete med en punkt:

1. Markera den som pågående och notera eventuella beroenden.
2. Lägg till regressionstest eller mätbar baslinje där det behövs.
3. Bocka av verifieringskraven och anteckna resultat och begränsningar.
4. Uppdatera status och datum. Håll genomförd kod och verkligt speltest åtskilda.

## Ändringslogg

- **2026-10-27:** IMP-06 implementerad och regressionstestad utan ändring av
  profilernas lagringsformat.
- **2026-10-27:** Arbetsdokument skapat. Tidigare implementerade IMP-02, IMP-03
  och IMP-15 markerade. Resterande fynd och föreslagna förbättringar samlade.
