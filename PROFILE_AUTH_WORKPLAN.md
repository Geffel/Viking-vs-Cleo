# Arbetsdokument – konton, profilmigrering och SQLite

Senast uppdaterad: **2026-10-27**.

Detta dokument samlar arbetet med att ersätta webbläsarbundna profiler med
lösenordsskyddade konton. Arbetet omfattar även flytten av profillagringen till
SQLite och **IMP-01** från [IMPROVEMENTS.md](IMPROVEMENTS.md).

Dokumentet är en plan. Inget i det innebär att konto- eller databasändringen är
implementerad.

## Mål

- Varje beständig spelarprofil ägs av ett konto med användarnamn och lösenord.
- Inloggning krävs för samtliga spellägen, inklusive träning och delad skärm.
- Det finns inget gästläge och ingen möjlighet att spela vidare med en
  omigrerad äldre profil.
- Befintliga profiler kan migreras utan att statistik, achievements,
  motståndarrelationer eller profil-ID förändras.
- Profildata lagras transaktionellt i SQLite och skrivning blockerar inte
  spellopen.
- Migreringen är verifierbar och kan återställas från backup.

## Beslutade principer

### Autentisering

- Det gamla `clientId` är inte längre en permanent identitet eller normal
  inloggningsmetod.
- Lösenord lagras aldrig i klartext. Utgångspunkten är Nodes inbyggda
  `crypto.scrypt` med slumpmässigt salt och versions-/parameterinformation i
  den sparade hashen.
- En lyckad inloggning skapar en återkallningsbar serversession. WebSocket-
  anslutningen kopplas till denna session och får inte själv ange vilket konto
  eller profil-ID den tillhör.
- Servern kräver en autentiserad session innan lobby, träning, matcher,
  statistik eller profiländringar blir tillgängliga.
- Inloggningsförsök begränsas för att försvåra lösenordsgissning.

### Användarnamn och visningsnamn

- Inloggningsnamn är unika efter normalisering och används endast för kontot.
- Profilens visningsnamn bevaras separat. Det gör att äldre profiler med samma
  eller liknande namn kan migreras utan att leaderboardhistorik skrivs om.
- Vid migrering föreslås det befintliga visningsnamnet som inloggningsnamn. Om
  det redan är upptaget måste användaren välja ett annat inloggningsnamn.

### Obligatorisk migrering

- Vid första besöket kontrollerar servern om webbläsarens gamla `clientId`
  motsvarar en omigrerad profil.
- Om en sådan profil hittas visas en blockerande migrationsvy. Den ska tydligt
  förklara att migrering krävs för att fortsätta använda profilen.
- Det finns inget val att hoppa över migreringen och fortsätta som gäst.
- På en delad dator får användaren logga in på ett annat befintligt konto.
  Den äldre profilen ligger då kvar som omigrerad och kan inte användas förrän
  den migreras.
- När migreringen lyckas kopplas kontot till det befintliga profil-ID:t i en
  transaktion. Profilen markeras som migrerad och dess gamla `clientId` kan
  aldrig mer användas för autentisering.
- Om webbläsarens gamla identitet saknas får ingen göra anspråk på en profil
  enbart genom att ange dess visningsnamn. Sådana undantag kräver en separat,
  administrativ återställningsprocess.

### SQLite och servermiljö

- Projektet använder Nodes inbyggda `node:sqlite`, inte en separat
  databasserver eller ett externt SQLite-paket.
- Serverns nuvarande Node 22.12.0 måste uppgraderas till en stödd version där
  `node:sqlite` kan användas utan `--experimental-sqlite`. Exakt version låses
  och verifieras innan implementationen påbörjas.
- Databasen körs med foreign keys aktiverade och WAL där det passar
  driftmiljön.
- Databasåtkomst kapslas bakom ett lagringsgränssnitt. Synkrona SQLite-anrop
  utförs utanför spellopen, exempelvis via en Worker Thread och en ordnad kö.
- Databasfilen och tillhörande WAL-data ska ligga på beständig lagring och ingå
  i backup.

## Föreslagen datamodell

Den exakta SQL-modellen fastställs under implementationen, men följande ansvar
ska hållas åtskilda:

### `accounts`

- internt konto-ID
- normaliserat, unikt inloggningsnamn
- visningsform av inloggningsnamnet
- lösenordshash med algoritm och parametrar
- skapad och senast uppdaterad tid
- eventuell spärr-/statusinformation

### `profiles`

- befintligt och oförändrat profil-ID
- konto-ID, tomt endast före migrering
- visningsnamn
- poäng, speltid och fraktionsspeltid
- match-, förmåge-, powerup- och kartstatistik
- achievementdata
- skapad, senast sedd och migrerad tid

Motståndarstatistik kan ligga i egna relationsrader i stället för JSON-fält,
men den måste fortsätta referera till de ursprungliga profil-ID:na.

### `legacy_profile_claims`

- profil-ID
- skyddad representation av äldre `clientId`
- status: väntande, migrerad eller administrativt spärrad
- migrerad tid

Tabellen är ett övergångslager och får inte bli en alternativ långsiktig
inloggningsmetod.

### `sessions`

- hash av en kryptografiskt slumpad sessionstoken
- konto-ID
- skapad tid, senaste användning och utgångstid
- återkallad tid

Råa sessionstokens sparas inte i databasen.

## Delarbete A – lagringsgräns och IMP-01

Detta delarbete tar över **IMP-01 – Profilskrivning utanför spellopen**.

### Problem

Träffar, förmågor och kills kan i dag utlösa serialisering och synkron
omskrivning av hela `profiles.json` på samma tråd som matcherna.
Achievement-kontrollen kan samtidigt gå igenom samtliga profiler. En tidigare
isolerad kontroll gav 30 filomskrivningar för 30 omgångar träffhändelser.

### Genomförande

- Flytta profil-, konto-, sessions- och statistiklagring bakom ett separat
  gränssnitt.
- Låt matchlogiken uppdatera minnestillstånd och lämna ordnade
  förändringsposter till en skrivkö.
- Kör synkrona SQLite-operationer utanför spellopen.
- Samla relaterade statistikändringar i transaktioner och undvik en
  databastransaktion per träff.
- Utvärdera achievements endast för berörda profiler.
- Definiera checkpointintervall, kögräns, retrystrategi och hur servern beter
  sig om databasen inte går att skriva till.
- Töm kön kontrollerat vid normal avstängning.
- Ange uttryckligen hur mycket ännu ej sparad statistik som får gå förlorad vid
  en hård krasch.

### Klart när

- [x] Strid orsakar inga synkrona diskoperationer på spellopen.
- [x] Kö, felhantering och avstängning bevarar ordningen utan
      dubbelregistrering.
- [x] Tillåten förlust av ännu osparad statistik vid hård krasch är bestämd och
      testad.
- [x] Befintliga profiler kan migreras med verifierade totalsummor och
      återställningsmöjlighet.
- [x] Ticktidens p95/p99 och längsta paus har jämförts före och efter under
      strid och sparning.
- [x] Statistik kan testas utan HTTP-server, WebSocket-anslutning eller verklig
      produktionsdatabas.

## Delarbete B – verifierbar dataimport

1. Stoppa skrivningar till den gamla profilfilen under den slutliga importen.
2. Skapa en tidsstämplad backup av `profiles.json`.
3. Importera till en ny databas utan att ändra backupen.
4. Bevara varje `profileId` exakt.
5. Jämför antal profiler och totalsummor för bland annat poäng, speltid, kills,
   deaths, matcher och achievements före och efter import.
6. Kontrollera referenser i `killsAgainst` och `deathsBy`.
7. Aktivera den nya databasen endast om samtliga kontroller passerar.
8. Dokumentera och testa rollback till den gamla filen.

Importen skapar väntande migreringsposter, inte färdiga konton. En spelare får
ett konto först när den obligatoriska migreringen slutförs.

## Delarbete C – konto och session

- Registrering med unikt inloggningsnamn och lösenord.
- Inloggning med ett generiskt fel för fel användarnamn eller lösenord.
- Säker lösenordshashning och konstanttidsjämförelse där det är relevant.
- Sessionsskapande, automatisk återanslutning, utgång och utloggning.
- Serverkontroll på varje skyddad HTTP- och WebSocket-kodväg.
- Begränsning och loggning av misslyckade inloggningsförsök utan att logga
  lösenord eller sessionstokens.
- Ingen återanvändning av klientinskickat profil-ID som behörighetskälla.
- Etablerade spelanslutningar stängs vid utloggning och återverifieras löpande
  så att utgångna eller serveråterkallade sessioner inte behåller spelåtkomst.

## Delarbete D – migrationsflöde

- Läs gammalt `clientId` enbart för att hitta en väntande migration.
- Visa vilken profil och en begränsad statistiksammanfattning som hittats.
- Förklara att migreringen är nödvändig för fortsatt åtkomst.
- Låt användaren skapa inloggningsnamn och lösenord.
- Slutför konto, profilkoppling, migreringsstatus och första session i en enda
  transaktion.
- Hantera samtidiga migrationsförsök så att exakt ett kan lyckas.
- Efter lyckad migrering ska samma äldre identitet inte ge profilåtkomst i en
  annan webbläsarsession.

## Delarbete E – klientflöde

Föreslagen startordning:

1. Kontrollera befintlig serversession.
2. Om inloggad: öppna lobbyn.
3. Om en väntande äldre profil känns igen: öppna blockerande migrationsvy.
4. Annars: visa Logga in och Skapa konto.

Klienten får inte öppna lobby, träning, matchskapande eller andra spelvyer före
ett autentiserat serversvar. Att dölja knappar i klienten är endast presentation;
servern måste upprätthålla spärren.

## Delarbete F – test och driftsättning

- [x] Ny installation kan skapa konto, logga in, logga ut och återansluta.
- [x] Oinloggade klienter nekas samtliga spellägen även med handskrivna
      WebSocket-meddelanden.
- [ ] En identifierad äldre profil kan inte passera migrationsvyn utan att
      migrera eller logga in på ett annat befintligt konto.
- [ ] Två samtidiga anspråk kan inte migrera samma profil två gånger.
- [ ] Ett visningsnamn räcker aldrig för att ta över en profil.
- [ ] Dubbletter bland äldre visningsnamn kan migreras till skilda konton.
- [x] Profil-ID, totalsummor, achievements och motståndarrelationer är identiska
      efter dataimporten.
- [ ] Om import eller verifiering misslyckas startar servern inte mot en
      halvfärdig databas.
- [ ] Normal avstängning tömmer skrivkön; simulerad hård krasch följer den
      beslutade förlustbudgeten.
- [ ] Databasbackup och återställning har provkörts.
- [ ] Ticktidsmätningen för IMP-01 är dokumenterad.

## Låsta grundbeslut

Node-version, lösenords- och scryptregler, sessionslivslängd, rate limiting,
återställningskoder, hantering av förlorat legacy-`clientId`, publik leaderboard
samt backup- och rollbackmodell är beslutade i
[konto- och profilmigreringens grundbeslut](Design-documents/profile-auth-foundation.md).
Parametrarna ska mätas på produktionsservern under implementationen. Om de inte
klarar kapacitetskraven krävs ett nytt dokumenterat säkerhetsbeslut; de får inte
tyst försvagas.

## Föreslagen arbetsordning

- [x] Lås Node-version, säkerhetsregler och återställningsmodell.
- [x] Bryt ut lagrings- och statistikgränser samt mät nuvarande ticktider.
- [x] Implementera SQLite-schema, skrivkö och verifierbar import.
- [x] Implementera konto-, lösenords- och sessionslagret.
- [x] Implementera det obligatoriska migrationsflödet.
- [x] Spärra alla spellägen bakom serververifierad session.
- [x] Genomför importrepetition mot en kopia av verkliga data.
- [x] Ta backup, stoppa servern, kör slutlig import och verifiera.
- [ ] Driftsätt med rollbackmöjlighet och följ upp köfel, inloggningsfel och
      ticktider.
