# Viking vs Cleo

Lagbaserad 2D-arenafighter i webbläsaren, byggd för lokalt nätverk. Matchen rullar
alltid på servern — man skriver in namn, väljer lag och hoppar rakt in.

## Kom igång

Dubbelklicka på **`start-game.bat`**. Den hämtar beroenden om det behövs, startar
servern och öppnar webbläsaren. Fönstret som blir kvar *är* servern — låt det stå
öppet så länge ni spelar.

Servern skriver ut två adresser. Den andra (`http://192.168.x.x:3000`) är den du
skickar till alla andra på nätverket.

Dubbelklicka på **`turn-off-game.bat`** för att stänga av. Den letar reda på
servern via port 3000 och avslutar den — bra när fönstret har hamnat bakom allt
annat eller körs minimerat. Har något annat program än Node.js tagit porten lämnas
det ifred.

Kör man `start-game.bat` medan spelet redan är igång stängs den gamla servern
först, så det blir aldrig krock om porten.

> **Första gången:** Windows-brandväggen frågar om Node.js får ta emot anslutningar.
> Tillåt på **privata nätverk**, annars kommer ingen annan dator in.

Samma sak från terminalen, om man hellre vill det:

```bash
npm install
```

```bash
npm start
```

> Ska du redigera `.bat`-filerna: spara dem med **CRLF**-radbrytningar. Med enbart
> LF tappar cmd första tecknet på varje rad så fort filen innehåller å, ä eller ö.

## Styrning

| Tangent | Handkontroll | Gör |
| --- | --- | --- |
| `←` / `→` | Vänster spak / d-pad | Gå vänster / höger |
| `Mellanslag` | `A` / Cross | Hoppa |
| `Pil ned` | `D-pad ned` (eller spaken nedåt) | Droppa ned genom plattformen du står på |
| `Q` / `E` | `X` / `Y` | Närstridsattacker |
| `1` | `RB` | Förmåga 1 |
| `2` | `LB` | Förmåga 2 |
| `3` | `LT` | Förmåga 3 |
| `4` | `RT` | Förmåga 4 |

Det här är bara standardläget. **Controls** i lobbyn ger en egen sida där varje
rad kan bindas om: klicka rutan och tryck en tangent, eller klicka
kontrollrutan och tryck en knapp på handkontrollen. Högerklick tömmer en ruta,
`Esc` avbryter, och sitter tangenten redan någon annanstans byter de två raderna
plats med varandra.

Bindningarna sparas i webbläsaren (`localStorage`, nyckeln `vvc.keybinds`) och
slår igenom direkt överallt — HUD-rutorna, combo-spåret och info-fliken läser
samma lista, så de kan aldrig visa en tangent som inte längre gäller. Rörelsen
på handkontrollen sitter på vänster spak och går inte att binda om; den är en
riktning och inte en knapp.

## Lag och förmågor

| Lag | Förmåga 1 | Förmåga 2 | Förmåga 3 |
| --- | --- | --- | --- |
| **Cleo** | Sand blast — kort sandkon som skadar och stunnar (6,5 s) | Blink — teleporterar framåt genom väggar och spelare (7 s) | Power shield — sköldar som blockar 3 träffar (60 s) |
| **Viking** | Axe throw — kastar en roterande yxa (3,5 s) | Shield charge — rusar med skölden, skadar och stunnar (8 s) | Mushrooms — äter flugsvamp och blir berserk i 12 s: +30 % utdelad skada, +30 % mottagen (60 s) |

Rutorna är per lag: saknar ett lag en förmåga döljs rutan i HUD:en och tangenten
gör ingenting.

Siffrorna är placeholders. Allt som rör balans bor i
[`shared/constants.js`](shared/constants.js) — `ABILITIES` (cooldowns, ikoner, namn),
`ABILITY_TUNING` (skada, räckvidd, fart), `MELEE` och `PLAYER`.

## Strid och träffkontroll

Närstrid gör **10 skada** per träff, alltså tio träffar för ett dräp. Träffytan
sträcker sig `MELEE.reach` (48) framåt från kroppens mitt — ungefär så långt som
yxan syns nå — och bakåt till egen bakkant, så att någon som står mitt ovanpå en
alltid räknas. Höjden är hela kroppen: träffar man kroppen så träffar man.

**Det du ser på din skärm är det som gäller.** Andra spelare ritas `INTERP_MS`
(50 ms) bakåt i tiden för att röra sig mjukt även när ett paket kommer sent. Utan
motåtgärd betyder det att servern prövar slaget mot en nyare bild än den du siktade
på — vid full fart blir det 15 px fel, en halv spelarbredd. Därför:

- servern sparar varje spelares position `LAGCOMP.historyMs` bakåt
- när du trycker mellanslag låses siktet **direkt**, mot exakt din bild av spelet:
  dig själv utan fördröjning, motståndarna 50 ms bakåt plus halva din ping
- skadan delas ut först `MELEE.windupMs` senare, när yxan är nere i animationen —
  men mot den redan låsta bilden, så väntetiden kan aldrig göra att ett slag som
  såg ut att träffa missar

Pingen mäts med WebSocket-protokollets egen ping/pong varje sekund. Den kan alltså
inte förfalskas av sidans kod för att köpa sig en större bakåtspolning, och den är
takad till `LAGCOMP.maxRewindMs`.

Ett slag träffar **en** motståndare — den närmaste i träffytan.

För att se det med egna ögon, i webbläsarkonsolen:

```js
vvc.renderer.debug = true
```

Då ritas rutan servern faktiskt prövade träffen mot ut vid varje slag.

Skadesiffran (`-10`) och den vita resten som släpar efter i hälsomätaren finns för
att en träff på 10 av 100 annars är lätt att missa. Slår man någon som fortfarande
har spawnskydd står det **skyddad** i stället för att slaget försvinner tyst.

## Crits och combos

**Kritisk träff.** Varje träff som gör skada slår sin egen tärning: `CRIT.chance`
(15 %) att slå `CRIT.mul` (1,5x) hårdare. Det gäller allt — närstrid, förmågor och
kastad yxa — och räknas **sist** i `damage()`, alltså ovanpå kebab, berserk och
ryggträff. Ingen uppbyggnad, inget sparat otur-skydd. Crit syns på att siffran är
större och orange och att det står **CRIT!** ovanför träffen.

**Combos.** Kedjar man ihop sina två närstridsslag i rätt ordning gör det sista
slaget i kedjan något extra. Kedjorna ligger i `COMBO.list`:

| Combo | Sekvens | Finisher |
| --- | --- | --- |
| Crusher | `Q` `Q` `E` `Q` | +100 % skada — den raka smällen |
| Flurry | `Q` `E` `Q` `E` | +50 % skada och melee blir redo direkt, så nästa kedja kan börja på en gång |
| Skyfall | `E` `E` `Q` `E` | +40 % skada och en uppercut som kastar offret rakt upp i luften |
| Executioner | `E` `Q` `Q` `E` `E` | +150 % skada och +25 HP till dig själv — längst kedja, enda som ger något tillbaka |

Finishern beskrivs helt i konstantfilen: `finisherMul`, `knockback`, `healSelf`,
`refundCooldown` och `stunMs`. Fält som saknas gör ingenting, och både HUD:en och
lobbytexten läser samma lista — en ny combo är alltså en post, inget mer.

**En regel när du lägger till en combo:** ingen combo får ligga i början av en
annan. Kedjan nollställs när en combo går av, så en kort combo som dyker upp på
vägen in i en lång skulle göra den långa omöjlig att nå.
[`test/combat.mjs`](test/combat.mjs) vaktar det. Går två combos av på samma slag
vinner den längsta.

Kedjan räknas på **träffar**, inte på tangenttryck — annars vore bonusen gratis.
Ett slag som går i tomma luften eller blockeras börjar om, och går det längre än
`COMBO.windowMs` (1,4 s) mellan två träffar rinner kedjan ut. Den överlever inte
heller döden. Efter en finisher nollställs kedjan, så nästa varv måste köras hela
vägen igen.

Matchningen sker bakifrån: de senaste träffarna jämförs mot combons början, så en
kedja som inleds med några "fel" slag kan ändå bli en combo längre fram.

Servern äger kedjan och skickar med läget i varje ögonblicksbild (`cb` vilken
combo, `cs` hur många steg som sitter, `cw` ms kvar att fortsätta). HUD:en ritar
ett spår ovanför melee-rutorna med hela sekvensen, tända steg, nästa tangent och
en tunn stapel för tiden. Ligger flera kedjor och matchar visas den som sitter
längst in, och vid lika den som har minst kvar.

**Finishern ska kännas.** När sista slaget i en kedja landar slår combons namn in
i bild i tre gånger sin storlek, studsar på plats, skakar till och lyfts sedan
bort — med mörkt band bakom sig så att det går att läsa mot vad som helst, glöd i
lagfärgen och `»«` som glider utåt. Under den ligger en ljusstöt ur träffpunkten,
fartstreck rakt ut, tre ringar och en skadesiffra som slår in dubbelt så stor.
Skärmen skakar: fullt utslag (`COMBO_FX.shake`) för den som slog och den som tog
emot, en darrning (`shakeOther`) för alla andra — annars skulle skärmen skaka
hela matchen. Skaket ligger i canvasens transform, så bakgrunden ritas några
pixlar för stor så länge det pågår för att inte blotta en kant. Allt sitter i
`COMBO_FX` överst i [`public/js/render.js`](public/js/render.js).

**Ursinne.** Tar man död på någon med en combo-finisher — inte ett vanligt slag,
utan sista slaget i en kedja — går man in i _enraged_: **+50 % utdelad skada i 5
sekunder**. Det är en global buff, den gäller båda lagen och sitter inte på någon
förmåga. Den räknas in i `damage()` på allt man delar ut och staplas
multiplikativt med kebaben och berserken. En ny combo-dräpare laddar om tiden,
och som allt annat försvinner den när man dör. Att någon är enraged syns på en
pulserande eldaura och att figuren blinkar rött, snabbare de sista sekunderna —
samma språk som kebaben. Siffrorna sitter i `ENRAGE` i
[`shared/constants.js`](shared/constants.js).

## Powerups

Var 20:e sekund läggs en powerup ut på en av de handplockade platserna i
`POWERUP_SPAWNS`, men aldrig fler än tre samtidigt. Sorten lottas:

| Sort | Effekt | Plockas upp av |
| --- | --- | --- |
| 🍕 Pizza | +45 HP direkt (kapas vid 100) | bara den som är skadad — annars ligger den kvar åt någon som behöver den |
| 🥙 Kebab | +15 % utdelad skada i 15 sekunder | alla; plockar man en till laddas tiden om |

Servern äger allt som spelar roll: spawn, kollision, hälsan och buffen. Kebabens
multiplikator räknas in i `damage()`, alltså på allt man delar ut — närstrid,
yxkast, sandblast och sköldrusning — och läggs på före ryggträffens bonus.
Buffen försvinner när man dör.

Att någon är buffad syns på att figuren **blinkar** hela tiden buffen varar, och
snabbare de sista tre sekunderna. Klienten får tiden som är kvar i varje
ögonblicksbild (`db`), så blinket är alltid i takt med servern. Siffrorna sitter i
`DAMAGE_BUFF` i [`shared/constants.js`](shared/constants.js).

Källbilderna ligger i `source-images/` och byggs om till spelklara sprites med:

```bash
npm run powerups
```

## Kartor

En karta är en post i `MAPS` i [`shared/constants.js`](shared/constants.js):

| Fält | Gör |
| --- | --- |
| `asset` | Bakgrundsbilden. Saknas den lånar kartan fjordens |
| `thumb` | Lilla förhandsbilden i kartröstningen |
| `theme` | Vilka levande lager klienten lägger **ovanpå** bilden — se `render.js` |
| `layout` | Kollisionsgeometrin, slås upp i `MAP_LAYOUTS`. Flera kartor kan dela layout |

En layout är tre listor: `platforms`, `spawns` (fyra per lag) och `powerupSpawns`.
Alla plattformar är enkelriktade och hela världen är 1600×900. Servern läser
layouten en gång när matchen startar och äger den sedan — kartan kan inte bytas
mitt i en match.

Förhandsbilderna byggs från arenabilderna med:

```bash
npm run thumbs
```

Utan dem laddar lobbyn alla arenabilder i full storlek (~2,5 MB styck) för att
visa dem i en ruta på några hundra pixlar. Samma bild i 480×270 väger ~30 kB.

### Ivory city

Bakgrunden är en målning (`arena_ivory_city.png`). Den äger kompositionen — allt
som renderaren gör är att lägga **rörelse ovanpå** den, och det ligger i
`drawIvoryCityDepth` (bakom spelplanen) och `drawIvoryCityForeground` (framför).

| Lager | Var |
| --- | --- |
| Solsken som andas | Bakom molnen uppe till vänster, där bildens ljus kommer ifrån |
| Ljusstrålar | Ut ur solen, ned mot höger — samma riktning som målningens eget ljus |
| Dis som driver | I målningens egna dimhöjder (`IVORY.mistBands`), annars ser det pålagt ut |
| Fågelflockar | Över dalen |
| Löv som blåser förbi | Framför spelarna, från lövträden i båda förgrundshörnen |
| Pollen i motljuset | Framför spelarna |
| **Nazgûl** | Sällsynt överflygning, ungefär varannan minut — samma upplägg som skogstrollet |

Siffrorna sitter i `IVORY` och `NAZGUL` överst i
[`public/js/render.js`](public/js/render.js).

Två saker är värda att veta om varför det ser ut som det gör:

- **Löven har djup i farten, inte bara i storleken.** Ett löv nära betraktaren är
  större, faller snabbare *och* är mindre genomskinligt. Utan den kopplingen blir
  de en jämn dimma av prickar i stället för löv på olika avstånd.
- **Fåglarna flyger i flockar.** Enstaka prickar på slumpade banor läser som skräp
  på skärmen; en flock som håller ihop läser som fåglar.

**Plattformarna är solida på den här kartan.** Mot fjordens mörka bild räcker en
ljus kantlinje, men mot en solbelyst målning försvinner den i detaljerna — och var
man kan stå får aldrig vara en gissning. `solidPlatforms()` i `render.js` styr
vilka teman som får sten i stället för bara markeringar. Marken tonar ut nedåt:
bara överkanten är kollision, och som solid skiva lade den en blek vägg över hela
förgrunden.

Banan är till skillnad från de andra **spegelsymmetrisk kring x = 800** — ingen
sida ska ha bättre läge. Lägger du till en plattform måste du lägga spegelbilden
också (`x_spegel = 1600 - x - w`). Höjderna ligger på 80–170 px mot ett hopp som
når ~200, så varje avsats nås utan förmågor. Toppavsatsen når man **bara** från
terrassen rakt under — den är menad som en omstridd höjd, och där ligger också en
powerup-plats.

### Titta på en karta utan att starta en match

Servern måste köra:

```
http://localhost:3000/_map-preview.html?map=ivory_city
```

Lägg till `&nazgul=1` för att tvinga fram överflygningen direkt i stället för att
vänta en minut.

## Grafik

Båda lagen ritas med riktiga sprites. Ett lag byter automatiskt till sprites så
fort det finns ett spriteset under `public/assets/<lag>/` — se `SPRITE_SETS` i
[`public/js/render.js`](public/js/render.js).

Källbilderna och övriga originalbilder ligger i `source-images/` (`viking_*.png`,
`cleo_*.png`, arena, powerups och ability-bilder).
De är inte registrerade mot varandra — figuren står på olika ställen i varje ruta
— så de måste bearbetas innan de går att animera:

```bash
npm run sprites
```

Verktyget hittar figurens yta via alfakanalen, räknar ut fotpunkten i varje ruta,
lägger alla rutor på en gemensam duk med fötterna på samma ställe, speglar de rutor
som vetter åt fel håll, skalar ned och skriver `manifest.json`. Resultatet hamnar i
`public/assets/<lag>/`. Vill man bara bygga om ett lag:

```bash
node tools/prepare-sprites.mjs cleo
```

Knappar att vrida på i [`tools/prepare-sprites.mjs`](tools/prepare-sprites.mjs):

| Inställning | Gör |
| --- | --- |
| `CHARACTERS[lag].facing` | Åt vilket håll det färdiga setet vetter (`left`/`right`) |
| `sources[].mirror` | Speglar en ruta som vetter åt fel håll än resten av setet |
| `sources[].scale` | Kompenserar en ruta där figuren är ritad i fel storlek |
| `IDLE_WORLD_H` | Hur hög figuren blir i spelet (träffytan är 44 hög) |

Klienten speglar sedan hela setet runt fotpunkten när spelaren vänder, så `facing`
avgör bara vilket håll källbilderna råkar vara ritade åt. Vikings ruta 3 och Cleos
rutor 2 och 3 är ritade spegelvänt mot resten och speglas därför i verktyget.

Tre förhandsvyer skrivs ut för ögongranskning:

- `<lag>/_preview.png` — alla rutor med fotlinje och mittlinje, för att se att
  figuren står stadigt och inte hoppar mellan rutorna
- `<lag>/_ingame.png` — figuren i verklig spelstorlek med träffytan utritad
- `_matchup-preview.png` — båda lagen, alla rutor, åt båda blickriktningarna, med
  samma uträkning som renderaren använder. Byggs med
  `node tools/preview-matchup.mjs` och är det snabbaste sättet att se att ingen
  ruta tittar åt fel håll.

Attackanimationen spelar rutorna i ordning när man slår. Takten sitter i
`SPRITE_ANIM.attackFrameMs` i [`shared/constants.js`](shared/constants.js) — 80 ms
per ruta, alltså 240 ms för tre rutor, väl inom melee-cooldownen på 420 ms.

### Egen animation per melee-plats

`manifest.attack` är antingen en lista med rutor (samma animation vad man än
slår med) eller en uppslagning per melee-plats (`m1`, `m2`, med `default` som
reserv för platser som saknar egna rutor). Cleo har `m1` = slag och `m2` =
spark; Viking kör yxan på `default` och skölden på `m2`.

En plats är i sin tur antingen bara en lista med filnamn, eller ett objekt med
`files` plus egna `worldWidth`, `worldHeight`, `anchorX`, `anchorY` och `facing`.
Det senare behövs när slaget inte får plats på lagets vanliga duk — sköldsmällen
skjuter skölden längre fram än yxsvingen når. Fält som utelämnas ärvs från
lagets rotvärden.

Sköldrutorna byggs för sig, för deras källbilder saknar alfakanal (figuren står
mot en grå bakgrund) och är ritade mindre än de andra rutorna:

```bash
npm run sprites:shield
```

Verktyget ([`tools/prepare-viking-shield.mjs`](tools/prepare-viking-shield.mjs))
tar bort bakgrunden med flood fill inåt från bildens ram, skalar varje ruta så
hjälmen blir lika bred som i viloposen, lägger rutorna på en gemensam duk med
fotpunkten på samma ställe och skriver in måtten i `manifest.json`. Kontrollera
resultatet i `viking/_preview_shield.png`, där viloposen står bredvid slagets
rutor på samma fotlinje.

| Inställning | Gör |
| --- | --- |
| `FIT_TWEAK` | Ögonmått-kompensation ovanpå hjälmnormaliseringen (0.9) |
| `SEED_TOL` / `NEIGHBOR_TOL` | Hur långt flood fillen får gå i bakgrunden |
| `MAX_CHROMA` | Färgmättnadsgräns som skyddar figuren från flood fillen |

> **Ruta 3 matchar inte de andra.** Den är ritad i en annan stil (ingen sköld,
> annan palett), vetter åt motsatt håll och är mindre. Speglingen och `scale: 1.22`
> döljer det mesta, men rätt lösning är att generera om rutan i samma stil,
> storlek och riktning som ruta 1 och 2.

## Så hänger det ihop

Servern är auktoritativ: den äger alla positioner, HP och cooldowns, kör 60 tick/s
och skickar en ögonblicksbild per tick. Klienten skickar bara tangenttryck och ritar
det den får tillbaka. Ingen spelare kan alltså fuska genom att ändra i webbläsaren.

```
start-game.bat        Startar servern och öppnar webbläsaren
turn-off-game.bat     Stänger av servern
shared/constants.js   Kartor, fysik, lag, förmågor — delas av server och klient
server/game.js        Spelvärlden: fysik, kollision, skada, respawn, poäng
server/index.js       HTTP + WebSocket, spelloopen, LAN-adresser
public/js/net.js      WebSocket + interpolering av andra spelare
public/js/input.js    Tangentbord och handkontroll -> meddelanden
public/js/keybinds.js Spelarens bindningar: standard ur konstantfilen, egna i localStorage
public/js/controls.js Kontrollsidan i lobbyn: binda om tangenter och knappar
public/js/render.js   Canvas: bakgrund, plattformar, spelare, sprites, effekter
public/js/hud.js      Ability-rutor med cooldown, killfeed, poängtavla
public/js/main.js     Lobby och renderloop
tools/                Bearbetar källbilder till spelklara sprites
```

Hela kartan (1600×900) syns alltid på skärmen — ingen kamera som följer spelaren.
Alla plattformar är enkelriktade: man hoppar upp genom dem, landar ovanpå och kan
droppa ned en nivå med `Pil ned`.

## Testa

```bash
npm test
```

Kör flera sviter. De första behöver ingen server:

- [`test/hitreg.mjs`](test/hitreg.mjs) — kör spelvärlden direkt med en klocka som
  stegas manuellt, så spelarna kan ställas på exakta positioner. Kontrollerar
  geometrin (framför, bakom, precis utanför räckhåll, ovanpå varandra, lagkamrat),
  spawnskyddet, att skadan kommer när yxan är nere, cooldownen, att tio träffar
  dödar, och framför allt bakåtspolningen: att den som **syntes** i träffytan tar
  skada även om han hunnit springa därifrån, och att den som **inte** syntes där
  går fri även om han sprungit in.
- [`test/combat.mjs`](test/combat.mjs) — crits och combos. Samma upplägg, men här
  byts även slumpen ut (`new Game({ clock, rng })`), så en kritisk träff är
  antingen garanterad eller omöjlig och varje siffra går att räkna för hand.
  Kontrollerar crit-multiplikatorn och att den staplas sist av alla bonusar,
  att `Q Q E Q` ger dubbel skada på sista slaget, att fel ordning, ett bommat
  slag, en för lång paus eller ett dödsfall bryter kedjan, och att combons läge
  följer med i ögonblicksbilden.
- [`test/platforms.mjs`](test/platforms.mjs) — serverfysiken för plattformar.
  Kontrollerar att `Pil ned` droppar en nivå i taget och stannar på marken.
- [`test/smoke.mjs`](test/smoke.mjs) — kräver att servern kör. Två riktiga
  WebSocket-klienter genom hopp, rörelse, båda förmågorna, närstrid, död,
  killfeed, poäng, respawn och disconnect.

```bash
npm run test:hits
```

Bara träffkontrollen, utan server. `npm run test:combat` kör bara crits och combos.

```bash
npm run peek
```

Skriver ut en ögonblicksbild av vilka som är inne just nu.

I webbläsarkonsolen finns `window.vvc` med `net`, `renderer` och `hud` för felsökning.

## Kvar att göra

- Balansera förmågorna mot den nya närstriden — `charge` (28) och `slam` (34) gör
  fortfarande tre gånger så mycket som ett slag
- Generera om attackruta 3 så den matchar de andra
- Sprites för Cleo, plus gå- och hoppanimationer
- Riktiga ikoner för förmågorna (nu emoji)
- Ljud
- Rundor / vinstvillkor — nu räknas bara poäng uppåt i all oändlighet
