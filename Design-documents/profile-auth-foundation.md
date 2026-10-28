# Konto- och profilmigrering: låsta grundbeslut

Status: beslutad 2026-10-27. Detta dokument är implementationens kontrakt. En
ändring av värdena nedan kräver en uttrycklig säkerhetsgranskning och uppdaterade
tester.

## Runtime

- Produktion och utveckling använder exakt Node.js **24.22.2 (Krypton LTS)**.
  Versionen finns i `.nvmrc`, `package.json` och verifieras före `npm start`.
- På Windows hämtar `Start.bat` vid behov den officiella ZIP-distributionen till
  `.runtime/` och verifierar dess låsta SHA-256 före uppackning. Den lokala
  körmiljön ändrar varken systemets `PATH` eller andra Node-installationer.
- `node:sqlite` används utan startflagga. Databasens synkrona API får bara köras
  i den dedikerade lagringsworkern, aldrig på spellopen.
- Uppgradering görs genom att stoppa servern, uppdatera `.nvmrc`, runtime-
  skriptets URL och checksumma samt `package.json`, köra `npm ci`, `npm test` och
  `npm run check:runtime`, och först därefter starta servern igen. En ny
  patchversion tas inte i drift automatiskt.

## Spelarnamn och lösenord

- Kontot och profilen har ett gemensamt spelarnamn på 1–14 Unicode-tecken.
  Namnet trimmas och kontrolltecken tas bort. Den skrivna formen, inklusive
  stora och små bokstäver, sparas och visas i spelet. En NFKC-normaliserad form
  i gemener används för unikhetskontroll och inloggning.
- Lösenord är 12–128 Unicode-kodpunkter. De trimmas eller Unicode-normaliseras
  inte. Kontroll sker både före och efter UTF-8-avkodning; ogiltig text nekas.
- Hashformatet är versionsmärkt och innehåller algoritm, parametrar och salt.
  Version 1 använder `crypto.scrypt` med `N=131072`, `r=8`, `p=1`, 64 byte
  nyckel, 16 slumpade salt-byte och minst 256 MiB `maxmem`.
- Nytt slumpat salt används för varje lösenord. Hashar jämförs med
  `timingSafeEqual`. Ett okänt konto kör samma scrypt-arbete som ett känt konto,
  och båda ger det generiska svaret "Fel användarnamn eller lösenord".
- En lyckad inloggning med en äldre hashversion uppgraderar hashen i samma
  transaktion som sessionen skapas.

## Begränsning och loggning

- Inloggning begränsas i två oberoende rullande 15-minutersfönster: högst fem
  misslyckanden per normaliserat konto och högst 25 per käll-IP. Därefter nekas
  försök i 15 minuter. En lyckad inloggning nollställer kontots räknare, inte
  IP-räknaren.
- Lösenordsåterställning använder separata rullande 15-minutersfönster med samma
  gränser: högst fem misslyckanden per normaliserat konto och högst 25 per
  käll-IP. Begränsning och kodkontroll sker före dyr lösenordshashning. En
  lyckad återställning nollställer kontots räknare, inte IP-räknaren.
- Begränsningsstatus lagras på servern så att en omstart inte kringgår den.
- Vid serverstart och därefter varje timme tas utgångna eller återkallade
  sessioner bort tillsammans med login- och återställningsfel som ligger utanför
  respektive 15-minutersfönster. Aktiva sessioner påverkas inte.
- Loggen får innehålla tid, resultat, käll-IP i strukturerad form och en envägs-
  identifierare för kontot. Lösenord, rå sessionstoken, legacy-`clientId`,
  återställningskod och fullständigt användarnamn får aldrig loggas.

## Sessioner och skyddade anrop

- En sessionstoken är 32 kryptografiskt slumpade byte. Bara dess SHA-256-hash
  lagras. Token skickas i en `HttpOnly`, `SameSite=Strict`-cookie med `Secure` i
  TLS-miljö och aldrig i URL, logg eller WebSocket-meddelande.
- Sessionen löper ut efter 30 dagars inaktivitet eller 90 dagar absolut, det som
  inträffar först. Senast-använd-tiden skrivs högst en gång per fem minuter.
- Utloggning och lösenordsåterställning återkallar sessioner transaktionellt.
  En användare kan logga ut alla enheter. Utgångna och återkallade sessioner
  rensas periodiskt men nekas omedelbart även innan rensning.
- HTTP uppgraderar WebSocket endast från godkänd Origin och en giltig cookie.
  Konto och profil hämtas från sessionen; klientinskickat konto-, profil- eller
  `clientId`-värde ger aldrig behörighet.
- Alla spel-, profil- och statistikvägar kräver session. Publik leaderboard får
  vara anonym och skrivskyddad. Spelarnamnet är publikt och är även namnet som
  används vid inloggning.

## Kontoåterställning och äldre profiler

- Första versionen har ingen e-poståterställning. Vid registrering skapas tio
  slumpade engångskoder med minst 128 bitars entropi. Endast kodhashar sparas;
  klartext visas en gång och kan inte hämtas igen.
- En giltig kod får sätta ett nytt lösenord, förbrukas atomärt och återkallar
  samtliga befintliga sessioner. Nya koder kan bara skapas av en inloggad
  användare efter ny lösenordsverifiering och ersätter då samtliga gamla koder.
- Förlorat lösenord utan återställningskod kan inte återställas automatiskt.
  Administratören får inte ta över eller flytta en profil enbart utifrån
  visningsnamn eller påstådd statistik.
- Ett förlorat legacy-`clientId` ger ingen självbetjänad profilclaim. Ett
  eventuellt manuellt undantag kräver separat framtida runbook, tvåpersoners-
  godkännande och revisionslogg; tills dess förblir profilen spärrad.

## Backup, aktivering och rollback

- Slutimporten kräver skrivstopp. `profiles.json` kopieras till en tidsstämplad,
  skrivskyddad backup och dess SHA-256 samt storlek skrivs i ett manifest innan
  importen börjar. Importen skriver alltid till en ny databasfil.
- Den nya filen aktiveras med atomärt namnbyte först när schema-, foreign-key-,
  profilantal-, totalsumme-, achievement- och motståndarrelationskontroller har
  passerat. Misslyckad kontroll lämnar den aktiva databasen orörd.
- En live SQLite-databas säkerhetskopieras via SQLite backup-API, inte genom att
  kopiera huvudfilen utan dess WAL. Backup körs före migrering, dagligen och före
  varje versionsuppgradering. De sju senaste dagliga och fyra senaste veckovisa
  backuperna behålls på beständig lagring utanför den aktiva databasens katalog.
- Återställning görs med stoppad server till en ny fil. `integrity_check`,
  `foreign_key_check` och samma totalsummekontroller som importen måste passera
  före atomär aktivering. Den ersatta databasen sparas tills kontrollen är klar.
- Före första lyckade konto-/profilskrivningen kan aktivering rullas tillbaka
  till legacy-backupen. Därefter återställs endast en verifierad SQLite-backup;
  återgång till `profiles.json` skulle förlora konton och är förbjuden.
- Mål för beständig kontodata är RPO högst 24 timmar och RTO högst två timmar.
  Statistikens separata hårdkraschbudget fastställs och testas i story 2–3 när
  skrivkön och checkpointintervallet finns.
